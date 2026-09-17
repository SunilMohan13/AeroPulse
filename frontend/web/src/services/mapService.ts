import { getGridAt, type GridBounds } from '../data/mockGrid'
import { getFiresAt } from '../data/mockFires'
import { defaultWind } from '../data/mockWind'
import { mockIndustries } from '../data/mockPopulation'
import type { GridCell, FireObservation, WindObservation, IndustrySite } from '../types'
import { fetchApiJson } from './api'
import { getAqiFromPm25, getRiskFromPm25 } from '../utils/aqi'

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms))

type GeoFeature = {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: Record<string, unknown>
}

type FeatureCollection = { features?: GeoFeature[] }

function hasLiveToken() {
  return !!(import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()
}

function bboxQuery(bounds?: GridBounds) {
  return bounds ? `&bbox=${bounds.west},${bounds.south},${bounds.east},${bounds.north}` : ''
}

function pointFromGeometry(feature: GeoFeature) {
  const coordinates = feature.geometry?.coordinates
  if (feature.geometry?.type === 'Point' && Array.isArray(coordinates)) {
    const [lon, lat] = coordinates
    if (typeof lon === 'number' && typeof lat === 'number') return { lon, lat }
  }
  return { lon: 77.21, lat: 28.61 }
}

function centerFromGeometry(feature: GeoFeature) {
  const coordinates = feature.geometry?.coordinates
  if (feature.geometry?.type === 'Polygon' && Array.isArray(coordinates)) {
    const ring = (coordinates[0] ?? []) as unknown[]
    const points = ring.filter((point): point is number[] =>
      Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number',
    )
    if (points.length > 0) {
      return {
        lon: points.reduce((sum, point) => sum + point[0], 0) / points.length,
        lat: points.reduce((sum, point) => sum + point[1], 0) / points.length,
      }
    }
  }
  return pointFromGeometry(feature)
}

/** Mirrors GET /api/v1/map/air-quality?bbox=&time=&resolution= */
export async function fetchAirQuality(
  hourOffset = 0,
  intensity = 1,
  bounds?: GridBounds,
): Promise<GridCell[]> {
  if (hasLiveToken()) {
    const data = await fetchApiJson<FeatureCollection>(
      `/api/v1/map/grid?limit=2000${bboxQuery(bounds)}`,
      { features: [] },
    )
    if ((data.features ?? []).length > 0) {
      return (data.features ?? []).map((feature) => {
        const properties = feature.properties ?? {}
        const pm25 = Number(properties.pm25_estimate ?? properties.pm25 ?? 0)
        const center = centerFromGeometry(feature)
        return {
          gridId: String(properties.grid_id ?? `${center.lat}:${center.lon}`),
          lat: center.lat,
          lon: center.lon,
          pm25,
          pm10: Number(properties.pm10 ?? pm25 * 1.28),
          no2: Number(properties.no2 ?? 0),
          aqi: getAqiFromPm25(pm25),
          population: Number(properties.population ?? 0),
          risk: getRiskFromPm25(pm25),
          stepDeg: 0.01,
          plume: 0,
          edgeFade: 1,
        }
      })
    }
  }
  await delay()
  return getGridAt(hourOffset, intensity, bounds)
}

export async function fetchFires(
  hourOffset = 0,
  intensity = 1,
): Promise<FireObservation[]> {
  if (hasLiveToken()) {
    const data = await fetchApiJson<FeatureCollection>('/api/v1/map/fire?limit=2000', { features: [] })
    if ((data.features ?? []).length > 0) {
      return (data.features ?? []).map((feature, index) => {
        const properties = feature.properties ?? {}
        const point = pointFromGeometry(feature)
        return {
          id: String(properties.observation_id ?? properties.id ?? `fire-${index}`),
          lat: point.lat,
          lon: point.lon,
          frp: Number(properties.frp ?? 0),
          confidence: Number(properties.confidence ?? 0),
          timestamp: String(properties.observed_at ?? new Date().toISOString()),
        }
      })
    }
  }
  await delay(80)
  return getFiresAt(hourOffset, intensity)
}

export async function fetchWeather(): Promise<WindObservation[]> {
  if (hasLiveToken()) {
    const data = await fetchApiJson<FeatureCollection>('/api/v1/map/weather?limit=2000', { features: [] })
    if ((data.features ?? []).length > 0) {
      return (data.features ?? []).map((feature) => {
        const properties = feature.properties ?? {}
        const point = pointFromGeometry(feature)
        const u = Number(properties.wind_u ?? 0)
        const v = Number(properties.wind_v ?? 0)
        return {
          lat: point.lat,
          lon: point.lon,
          u,
          v,
          speed: Math.sqrt(u * u + v * v),
          direction: (Math.atan2(u, v) * 180) / Math.PI,
        }
      })
    }
  }
  await delay(60)
  return defaultWind
}

export async function fetchIndustries(): Promise<IndustrySite[]> {
  if (hasLiveToken()) {
    const data = await fetchApiJson<FeatureCollection>('/api/v1/map/industry?limit=500', { features: [] })
    if ((data.features ?? []).length > 0) {
      return (data.features ?? []).map((feature, index) => {
        const properties = feature.properties ?? {}
        const point = pointFromGeometry(feature)
        return {
          id: String(properties.asset_id ?? `industry-${index}`),
          name: String(properties.name ?? 'Industry asset'),
          lat: point.lat,
          lon: point.lon,
          type: 'Industry/OCEMS',
        }
      })
    }
  }
  await delay(40)
  return mockIndustries
}
