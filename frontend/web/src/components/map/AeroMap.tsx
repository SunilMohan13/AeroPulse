import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as maplibregl from 'maplibre-gl'
import { DeckGL } from '@deck.gl/react'
import { useQuery } from '@tanstack/react-query'
import type { GridCell, FireObservation, MapLayerVisibility } from '../../types'
import { cn } from '../../utils/cn'
import {
  buildSmokeParticles,
  createFireGlowLayer,
  createFireLayer,
  createGeographyLayer,
  createIndustryLayer,
  createPlaceDotLayer,
  createPlaceLabelLayer,
  createPlumeLayer,
  createPollutionLayer,
  createPopulationLayer,
  createSmokeParticleLayer,
  createTransportAxisLayer,
  createWindLayer,
} from './layerFactories'
import { useApp } from '../../context/AppContext'
import { fetchAirQuality, fetchFires, fetchWeather, fetchIndustries } from '../../services/mapService'
import { resolveStep, stepToKm, type GridBounds } from '../../data/mockGrid'
import { MapPopup } from './MapPopup'
import { MapControls } from './MapControls'
import { MapToolbar } from './MapToolbar'
import { MapTimeline } from './MapTimeline'
import { MapLegend } from './MapLegend'
import { CORRIDOR_LOCATIONS, PUNJAB_FIRE_CENTER, type NamedLocation } from '../../utils/geo'
import { attachBasemapFallback, CARTO_STYLE_URL } from './basemapStyle'
import { useAnimationClock } from '../../hooks/useAnimationClock'
const INITIAL_VIEW = {
  longitude: 76.2,
  latitude: 29.8,
  zoom: 6.2,
  pitch: 0,
  bearing: 0,
}

type ViewState = typeof INITIAL_VIEW

const MIN_ZOOM = 3
const MAX_ZOOM = 13
const ZOOM_STEP = 0.9

const TILE_SIZE = 512

function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2
}

function inverseMercatorY(y: number): number {
  const n = Math.PI * (1 - 2 * y)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/**
 * Exact visible extent from the Web Mercator projection, over-scanned by
 * `pad`. The padding keeps the generated patch's edge off-screen — otherwise
 * the layer boundary shows up as a hard-edged rectangle over the basemap.
 */
function boundsFor(view: ViewState, width: number, height: number, pad = 1.5): GridBounds {
  const worldPx = TILE_SIZE * 2 ** view.zoom
  const spanLon = (360 * width * pad) / worldPx
  const dY = (height * pad) / (2 * worldPx)
  const yCenter = mercatorY(view.latitude)

  return {
    west: view.longitude - spanLon / 2,
    east: view.longitude + spanLon / 2,
    north: inverseMercatorY(Math.max(yCenter - dY, 1e-6)),
    south: inverseMercatorY(Math.min(yCenter + dY, 1 - 1e-6)),
  }
}

/** Snap bounds so small pans reuse the same query key instead of refetching. */
function quantise(bounds: GridBounds, q = 0.25): GridBounds {
  return {
    west: Math.floor(bounds.west / q) * q,
    east: Math.ceil(bounds.east / q) * q,
    south: Math.floor(bounds.south / q) * q,
    north: Math.ceil(bounds.north / q) * q,
  }
}

interface AeroMapProps {
  /** Preview mode: chrome-free map for embedding in a dashboard card. */
  compact?: boolean
  showControls?: boolean
  showTimeline?: boolean
  showLegend?: boolean
  /** Per-instance layer overrides, so a page can require its own layers
   *  without mutating the shared toggle state other pages read. */
  forceLayers?: Partial<MapLayerVisibility>
  className?: string
}

export function AeroMap({
  compact = false,
  showControls = !compact,
  showTimeline = !compact,
  showLegend = !compact,
  forceLayers,
  className,
}: AeroMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const {
    hourOffset,
    layers: globalLayers,
    demoIntensity,
    setSelectedFireId,
    setSelectedGridId,
  } = useApp()
  const layers = useMemo(
    () => ({ ...globalLayers, ...forceLayers }),
    [globalLayers, forceLayers],
  )
  const [viewState, setViewState] = useState<ViewState>(INITIAL_VIEW)
  const time = useAnimationClock(24)
  const pulse = time * 1.6
  const [popupCell, setPopupCell] = useState<GridCell | null>(null)
  const [popupFire, setPopupFire] = useState<FireObservation | null>(null)
  const [offlineBasemap, setOfflineBasemap] = useState(false)
  const [size, setSize] = useState({ width: 1200, height: 600 })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  useEffect(() => {
    const el = mapContainerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width <= 0 || height <= 0) return
      setSize({ width, height })
      // MapLibre latches its transform size at construction. If the container
      // had no layout yet, that transform stays 0x0 and the map silently never
      // requests a single tile, so it must be told about the new size.
      mapRef.current?.resize()
    })
    observer.observe(el)
    return () => observer.disconnect()
    // The observed element is replaced when the map moves into the portal.
  }, [expanded])

  const bounds = useMemo(
    () => quantise(boundsFor(viewState, size.width, size.height)),
    [viewState, size.width, size.height],
  )
  const boundsKey = `${bounds.west},${bounds.east},${bounds.south},${bounds.north}`
  const resolutionKm = useMemo(() => stepToKm(resolveStep(bounds)), [bounds])

  const { data: grid = [] } = useQuery({
    queryKey: ['airQuality', hourOffset, demoIntensity, boundsKey],
    queryFn: () => fetchAirQuality(hourOffset, demoIntensity, bounds),
    placeholderData: (previous) => previous,
    // Each snapshot is tens of MB and every hour/viewport combination is a
    // distinct key, so the default 5-minute retention accumulated gigabytes
    // while scrubbing the timeline and crashed the tab. Snapshots are cheap to
    // regenerate, so evict them almost immediately.
    gcTime: 10_000,
    staleTime: 10_000,
  })
  const { data: fires = [] } = useQuery({
    queryKey: ['fires', hourOffset, demoIntensity],
    queryFn: () => fetchFires(hourOffset, demoIntensity),
    placeholderData: (previous) => previous,
  })
  const { data: wind = [] } = useQuery({ queryKey: ['wind'], queryFn: fetchWeather })
  const { data: industries = [] } = useQuery({
    queryKey: ['industries'],
    queryFn: fetchIndustries,
  })

  // Read without subscribing, so re-creating the map preserves the camera
  // instead of snapping back to the initial view.
  const viewRef = useRef(viewState)
  viewRef.current = viewState

  // MapLibre is a passive basemap; deck.gl owns interaction so the two
  // cannot fight over the camera. Expanding moves this subtree into a portal,
  // which destroys the container element, so the map is rebuilt alongside it.
  useEffect(() => {
    if (!mapContainerRef.current) return
    const view = viewRef.current
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: CARTO_STYLE_URL,
      center: [view.longitude, view.latitude],
      zoom: view.zoom,
      attributionControl: { compact: true },
      interactive: false,
    })
    mapRef.current = map
    if (import.meta.env.DEV) {
      ;(window as unknown as { __aeroMap?: maplibregl.Map }).__aeroMap = map
    }

    // Tile hosting can be blocked on demo networks; fall back to a bundled
    // style instead of showing an empty canvas.
    attachBasemapFallback(map, () => setOfflineBasemap(true))

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [expanded])

  const syncBasemap = useCallback((v: ViewState) => {
    mapRef.current?.jumpTo({
      center: [v.longitude, v.latitude],
      zoom: v.zoom,
      pitch: v.pitch,
      bearing: v.bearing,
    })
  }, [])

  const applyView = useCallback(
    (next: ViewState) => {
      const clamped = {
        ...next,
        zoom: Math.min(Math.max(next.zoom, MIN_ZOOM), MAX_ZOOM),
      }
      setViewState(clamped)
      syncBasemap(clamped)
    },
    [syncBasemap],
  )

  const zoomBy = useCallback(
    (delta: number) => applyView({ ...viewState, zoom: viewState.zoom + delta }),
    [applyView, viewState],
  )
  const resetView = useCallback(() => applyView(INITIAL_VIEW), [applyView])

  const handleFireClick = useCallback(
    (fire: FireObservation) => {
      setSelectedFireId(fire.id)
      setPopupFire(fire)
      setPopupCell(null)
      applyView({ ...viewState, longitude: fire.lon, latitude: fire.lat, zoom: 8.5 })
    },
    [applyView, setSelectedFireId, viewState],
  )

  const handleCellClick = useCallback(
    (cell: GridCell) => {
      setSelectedGridId(cell.gridId)
      setPopupCell(cell)
      setPopupFire(null)
    },
    [setSelectedGridId],
  )

  // Each layer memoises independently so the animation clock only rebuilds the
  // cheap animated layers, never the large polygon fields.
  const pollutionLayer = useMemo(
    () => createPollutionLayer(grid, layers.pollution, handleCellClick),
    [grid, layers.pollution, handleCellClick],
  )
  const plumeLayer = useMemo(() => createPlumeLayer(grid, layers.forecast), [grid, layers.forecast])
  const populationLayer = useMemo(
    () => createPopulationLayer(grid, layers.population),
    [grid, layers.population],
  )
  const industryLayer = useMemo(
    () => createIndustryLayer(industries, layers.industry),
    [industries, layers.industry],
  )
  const axisLayer = useMemo(
    () =>
      createTransportAxisLayer(
        PUNJAB_FIRE_CENTER,
        CORRIDOR_LOCATIONS[0],
        layers.forecast || layers.wind,
      ),
    [layers.forecast, layers.wind],
  )

  const particles = useMemo(() => buildSmokeParticles(520, fires.length), [fires.length])

  const labelPlaces = useMemo(
    () => CORRIDOR_LOCATIONS.filter((l) => !l.name.includes('cluster')),
    [],
  )
  // Coastlines, borders and city names duplicate what the real basemap draws,
  // so they only stand in when the basemap is the offline fallback.
  const geographyLayer = useMemo(
    () => createGeographyLayer(offlineBasemap),
    [offlineBasemap],
  )
  const placeDotLayer = useMemo(
    () => (offlineBasemap ? createPlaceDotLayer(labelPlaces) : null),
    [labelPlaces, offlineBasemap],
  )
  const placeLabelLayer = useMemo(
    () => (offlineBasemap ? createPlaceLabelLayer(labelPlaces, viewState.zoom) : null),
    [labelPlaces, offlineBasemap, viewState.zoom],
  )

  const fireGlowLayer = useMemo(
    () => createFireGlowLayer(fires, layers.fires, pulse),
    [fires, layers.fires, pulse],
  )
  const fireLayer = useMemo(
    () => createFireLayer(fires, layers.fires, handleFireClick),
    [fires, layers.fires, handleFireClick],
  )
  const smokeLayer = useMemo(
    () =>
      createSmokeParticleLayer(
        particles,
        fires,
        layers.fires && (layers.forecast || layers.pollution),
        time,
        Math.max(hourOffset, 6),
      ),
    [particles, fires, layers.fires, layers.forecast, layers.pollution, time, hourOffset],
  )
  const windLayer = useMemo(
    () => createWindLayer(wind, layers.wind, time),
    [wind, layers.wind, time],
  )

  const deckLayers = useMemo(
    () =>
      [
        geographyLayer,
        pollutionLayer,
        plumeLayer,
        axisLayer,
        populationLayer,
        windLayer,
        industryLayer,
        fireGlowLayer,
        smokeLayer,
        fireLayer,
        placeDotLayer,
        placeLabelLayer,
      ].filter(Boolean),
    [
      geographyLayer,
      pollutionLayer,
      plumeLayer,
      axisLayer,
      populationLayer,
      windLayer,
      industryLayer,
      fireGlowLayer,
      smokeLayer,
      fireLayer,
      placeDotLayer,
      placeLabelLayer,
    ],
  )

  const zoomToFireCenter = useCallback(() => {
    applyView({
      ...viewState,
      longitude: PUNJAB_FIRE_CENTER.lon,
      latitude: PUNJAB_FIRE_CENTER.lat,
      zoom: 8,
    })
  }, [applyView, viewState])

  const goToLocation = useCallback(
    (location: NamedLocation) => {
      applyView({
        ...viewState,
        longitude: location.lon,
        latitude: location.lat,
        zoom: location.zoom,
      })
    },
    [applyView, viewState],
  )

  const closePopup = useCallback(() => {
    setPopupCell(null)
    setPopupFire(null)
    setSelectedFireId(null)
    setSelectedGridId(null)
  }, [setSelectedFireId, setSelectedGridId])

  // Expanding overrides the caller's sizing entirely and reveals the full
  // chrome, so a dashboard preview becomes a usable map without a route change.
  const chrome = expanded
    ? { controls: true, timeline: true, legend: true }
    : { controls: showControls, timeline: showTimeline, legend: showLegend }

  const content = (
    // `relative` is structural — the basemap and deck.gl canvas both position
    // against it — so it is always applied, never replaced by the caller.
    <div
      className={
        expanded
          ? 'fixed inset-0 z-50 bg-bg-base'
          : cn('relative h-full w-full', className)
      }
    >
      {/* maplibre-gl.css sets `.maplibregl-map { position: relative }`, which
          beats the utility class and collapses this box to zero height (and
          then MapLibre requests no tiles at all). Inline style wins. */}
      <div ref={mapContainerRef} className="absolute inset-0" style={{ position: 'absolute' }} />
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => applyView(vs as ViewState)}
        // Zoom limits are enforced in `applyView`, which every camera change
        // (wheel, drag, toolbar, fly-to) funnels through.
        controller
        layers={deckLayers}
        getTooltip={({ object }) => {
          if (!object) return null
          if ('frp' in object) return `Fire · FRP ${(object.frp as number).toFixed(0)} MW`
          if ('pm25' in object) return `PM2.5 ${object.pm25} µg/m³ · AQI ${object.aqi}`
          return null
        }}
      />
      <MapToolbar
        zoom={viewState.zoom}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onZoomOut={() => zoomBy(-ZOOM_STEP)}
        onReset={resetView}
        expanded={expanded}
        onToggleExpand={() => setExpanded((v) => !v)}
      />
      {chrome.controls && (
        <MapControls onZoomToFire={zoomToFireCenter} onSelectLocation={goToLocation} />
      )}
      {chrome.legend && <MapLegend resolutionKm={resolutionKm} />}
      {(popupCell || popupFire) && (
        <MapPopup cell={popupCell} fire={popupFire} fires={fires} onClose={closePopup} />
      )}
      {/* Sits above the timeline panel, which previously covered it entirely. */}
      {offlineBasemap && (
        <div className="absolute bottom-32 left-4 z-10 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
          Offline basemap — environmental layers unaffected
        </div>
      )}
      {chrome.timeline && <MapTimeline />}
    </div>
  )

  // Page wrappers use transforms for route transitions, and a transformed
  // ancestor becomes the containing block for `fixed` — so full screen only
  // truly covers the viewport from a portal on <body>.
  return expanded ? createPortal(content, document.body) : content
}
