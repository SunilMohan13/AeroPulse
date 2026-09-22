/**
 * Wire contracts to UI types.
 *
 * The two vocabularies have genuinely diverged, and this file is where that
 * is resolved in the open rather than papered over:
 *
 * * **Severity.** The contract's top band is `CRITICAL`; the UI calls it
 *   `SEVERE`. A straight cast would render the top band as unstyled text.
 * * **Confidence scale.** Contracts use 0–1, the UI renders 0–100.
 * * **Geometry.** `event.v1` carries `grid_ids`, not coordinates. The UI map
 *   needs a point, so an event is joined to its grid feature, which has the
 *   cell centroid.
 * * **Fields the API does not have.** `recommendedActions` and
 *   `populationAtRisk` exist in the demo narrative and nowhere in the API.
 *   They are returned empty and listed in `provenance.unavailable`, so a
 *   screen can render "—" instead of quietly showing a demo value while
 *   claiming to be live. That substitution is the single worst failure mode
 *   available to this app, and the plan calls it out by name.
 */

import type {
  ApiEvent,
  ApiEvidence,
  ApiFireProperties,
  ApiForecast,
  ApiGridFeature,
  ApiHazardCell,
  ApiModel,
  ApiPeakForecast,
  ApiSource,
  ApiWeatherProperties,
} from './contracts'
import type {
  DataProvenance,
  EventSeverity,
  EventStatus,
  EventType,
  EvidenceItem,
  FireObservation,
  ForecastPoint,
  GridCell,
  HazardCell,
  ModelCatalogEntry,
  PeakForecastCell,
  PollutionEvent,
  SourceHealth,
  SourceLikelihood,
  WindObservation,
} from '../types'
import { getAqiFromPm25, getRiskFromPm25 } from '../utils/aqi'

/** Fields the live API has no equivalent for, listed once. */
export const LIVE_UNAVAILABLE_EVENT_FIELDS = [
  'recommendedActions',
  'populationAtRisk',
  'title',
] as const

const pct = (v: number | null | undefined): number => Math.round((v ?? 0) * 100)

/** Contract severity to UI severity. `CRITICAL` is the UI's `SEVERE`. */
export function toSeverity(value: string): EventSeverity {
  switch (value.toUpperCase()) {
    case 'CRITICAL':
    case 'SEVERE':
      return 'SEVERE'
    case 'HIGH':
      return 'HIGH'
    case 'MEDIUM':
      return 'MEDIUM'
    default:
      return 'LOW'
  }
}

const STATUSES: EventStatus[] = [
  'DETECTED',
  'VALIDATING',
  'CONFIRMED',
  'FORECASTING',
  'ACTIVE',
  'DECLINING',
  'RESOLVED',
  'REJECTED',
]

export function toStatus(value: string): EventStatus {
  const upper = value.toUpperCase() as EventStatus
  return STATUSES.includes(upper) ? upper : 'DETECTED'
}

/** Map the dominant source likelihood onto the UI's event-type vocabulary. */
export function toEventType(likelihood: ApiGridFeature['source_likelihood']): EventType {
  if (!likelihood) return 'transport'
  const ranked: [EventType, number][] = [
    ['biomass', likelihood.biomass_burning],
    ['industrial', likelihood.industrial],
    ['traffic', likelihood.traffic],
    ['dust', likelihood.dust],
    ['transport', likelihood.regional_transport],
  ]
  ranked.sort((a, b) => b[1] - a[1])
  return ranked[0][1] > 0 ? ranked[0][0] : 'transport'
}

export function toSourceLikelihood(
  likelihood: ApiGridFeature['source_likelihood'],
): SourceLikelihood[] {
  if (!likelihood) return []
  return [
    { source: 'Biomass burning', probability: pct(likelihood.biomass_burning) },
    { source: 'Regional transport', probability: pct(likelihood.regional_transport) },
    { source: 'Industrial', probability: pct(likelihood.industrial) },
    { source: 'Traffic', probability: pct(likelihood.traffic) },
    { source: 'Dust', probability: pct(likelihood.dust) },
  ].sort((a, b) => b.probability - a.probability)
}

/**
 * Coarse corridor region from a coordinate.
 *
 * A label for the operator, not an administrative boundary lookup. Kept
 * deliberately coarse — claiming district precision from a latitude band
 * would be a fabricated level of detail.
 */
export function toRegion(lat: number, lon: number): string {
  if (lat >= 30.2) return 'Punjab'
  if (lat >= 29.2) return 'Haryana (north)'
  if (lat >= 28.2 && lon >= 76.5) return 'Delhi NCR'
  if (lat >= 28.2) return 'Haryana (south)'
  return 'Indo-Gangetic corridor'
}

/**
 * Build a UI event from the contract plus, when available, the grid feature
 * for its first cell.
 *
 * @param event The `event.v1` record.
 * @param feature Grid feature for `event.grid_ids[0]`, when it could be
 *   fetched. Without it the event still renders, with concentrations and
 *   coordinates marked unavailable rather than guessed.
 */
export function toPollutionEvent(event: ApiEvent, feature?: ApiGridFeature): PollutionEvent {
  const unavailable = [...LIVE_UNAVAILABLE_EVENT_FIELDS] as string[]
  const pm25 = feature?.pm25 ?? feature?.pm25_estimate ?? 0
  if (!feature) unavailable.push('pm25', 'pm10', 'aqi', 'lat', 'lon', 'sourceLikelihood')

  const lat = feature?.center_lat ?? 0
  const lon = feature?.center_lon ?? 0

  return {
    id: event.event_id,
    // The contract has no title. Composing one from the dominant source and
    // region is a label, so it is listed as unavailable above: a reader must
    // not take it for an operator-authored description.
    title: feature
      ? `${labelForType(toEventType(feature.source_likelihood))} · ${toRegion(lat, lon)}`
      : `Pollution event ${event.event_id.slice(0, 12)}`,
    type: toEventType(feature?.source_likelihood ?? null),
    severity: toSeverity(event.severity),
    status: toStatus(event.status),
    lat,
    lon,
    pm25: Math.round(pm25),
    pm10: Math.round(feature?.pm10 ?? 0),
    aqi: getAqiFromPm25(pm25),
    detectionConfidence: pct(event.detection_confidence),
    sourceConfidence: pct(event.source_confidence),
    forecastConfidence: pct(event.forecast_confidence),
    impactConfidence: pct(event.impact_confidence),
    // The API exposes population *density* on the grid feature, never a
    // headcount at risk. Multiplying density by an assumed area to produce a
    // "2.4M people" figure would be inventing the most quotable number on
    // the screen, so this stays 0 and is flagged.
    populationAtRisk: 0,
    region: toRegion(lat, lon),
    detectedAt: event.created_at,
    updatedAt: event.updated_at,
    fireCount: feature?.fire_count ?? 0,
    frpMw: Math.round(feature?.fire_frp ?? 0),
    sourceLikelihood: toSourceLikelihood(feature?.source_likelihood ?? null),
    // No API field supplies these. An empty list renders as "not provided".
    recommendedActions: [],
    provenance: {
      mode: 'live',
      modelVersion: event.model_versions.join(', ') || null,
      featureVersion: event.feature_version,
      degraded: event.model_versions.every((v) => !v.startsWith('hgb-')),
      unavailable,
      note: feature
        ? undefined
        : `No persisted grid feature for ${event.grid_ids[0] ?? 'this event'}; concentrations unavailable.`,
    },
  }
}

function labelForType(type: EventType): string {
  switch (type) {
    case 'biomass':
      return 'Biomass burning event'
    case 'industrial':
      return 'Industrial emission event'
    case 'traffic':
      return 'Traffic emission event'
    case 'dust':
      return 'Dust event'
    default:
      return 'Regional transport event'
  }
}

export function toEvidenceItem(item: ApiEvidence, eventId: string): EvidenceItem {
  const quality = item.quality_score ?? 0
  return {
    id: item.evidence_id,
    category: item.evidence_type.replace(/_/g, ' '),
    source: item.evidence_type.split('_')[0].toUpperCase(),
    observation: item.summary,
    time: '',
    confidence: pct(quality),
    supports: eventId,
    strength: quality >= 0.8 ? 'Strong' : quality >= 0.5 ? 'Moderate' : 'Weak',
  }
}

/**
 * Flatten a `forecast.v1` into the UI's per-hour series.
 *
 * The contract is per-cell at a set of horizons; the chart is per-hour for
 * one place. The origin cell is taken as that place, because it is the only
 * cell present at every horizon.
 */
export function toForecastPoints(forecast: ApiForecast): ForecastPoint[] {
  const generated = new Date(forecast.generated_at).getTime()
  const origin = forecast.grid_predictions.filter((p) => p.grid_id === forecast.origin_grid_id)
  const series = origin.length ? origin : forecast.grid_predictions.slice(0, 1)
  const baseline = series[0]?.pm25 ?? 0

  return forecast.horizons.slice(0, series.length || forecast.horizons.length).map((hour, i) => {
    const cell = series[Math.min(i, series.length - 1)]
    const spread = (1 - cell.confidence) * cell.pm25
    return {
      hour,
      timestamp: new Date(generated + hour * 3600000).toISOString(),
      pm25: Math.round(cell.pm25),
      confidenceLow: Math.round(cell.pm25 - spread),
      confidenceHigh: Math.round(cell.pm25 + spread),
      baselinePm25: Math.round(baseline),
      p90: cell.p90,
      p10: cell.p10,
      provenance: {
        mode: 'live',
        modelVersion: forecast.model_version,
        degraded: !forecast.model_version.startsWith('hgb-'),
        note: forecast.cams_applied ? undefined : 'CAMS correction not applied.',
      },
    }
  })
}

/** Grid feature to the map's cell shape. */
export function toGridCell(feature: ApiGridFeature, stepDeg: number): GridCell {
  const pm25 = feature.pm25 ?? feature.pm25_estimate ?? 0
  return {
    gridId: feature.grid_id,
    lat: feature.center_lat,
    lon: feature.center_lon,
    pm25,
    pm10: feature.pm10 ?? 0,
    no2: feature.no2 ?? 0,
    aqi: getAqiFromPm25(pm25),
    // Density per km², which for a ~1 km cell is the closest honest stand-in
    // for cell population. Null stays 0 rather than becoming a guess.
    population: Math.round(feature.population ?? 0),
    risk: getRiskFromPm25(pm25),
    stepDeg,
    // The API does not separate a smoke contribution from total PM2.5. The
    // demo's plume decomposition is a narrative device; live has no such
    // split, so it is zero rather than a fabricated share.
    plume: 0,
    edgeFade: 1,
  }
}

export function toFireObservation(
  properties: ApiFireProperties,
  coordinates: [number, number],
): FireObservation {
  return {
    id: `${properties.source_id}_${properties.grid_id}_${properties.observed_at}`,
    lat: coordinates[1],
    lon: coordinates[0],
    frp: properties.frp,
    confidence: Math.round(properties.confidence * 100),
    timestamp: properties.observed_at,
  }
}

export function toWindObservation(
  properties: ApiWeatherProperties,
  coordinates: [number, number],
): WindObservation | null {
  const { wind_u: u, wind_v: v } = properties
  if (u === null || v === null) return null
  const speed = Math.hypot(u, v)
  // Meteorological convention: the bearing the wind blows *from*.
  const direction = (Math.atan2(-u, -v) * 180) / Math.PI
  return {
    lat: coordinates[1],
    lon: coordinates[0],
    u,
    v,
    speed,
    direction: (direction + 360) % 360,
  }
}

export function toHazardCell(cell: ApiHazardCell): HazardCell | null {
  if (cell.center_lat === null || cell.center_lon === null) return null
  return {
    gridId: cell.grid_id,
    lat: cell.center_lat,
    lon: cell.center_lon,
    timestamp: cell.timestamp,
    hazardScore: cell.hazard_score,
    thresholdUgm3: cell.threshold_ugm3,
    horizonHours: cell.horizon_hours,
    calibrated: cell.calibrated,
    degraded: cell.degraded,
    modelVersion: cell.model_version,
    observedPm25: cell.observed_pm25,
  }
}

export function toPeakForecastCell(cell: ApiPeakForecast): PeakForecastCell | null {
  if (cell.center_lat === null || cell.center_lon === null) return null
  return {
    gridId: cell.grid_id,
    lat: cell.center_lat,
    lon: cell.center_lon,
    timestamp: cell.timestamp,
    peakPm25: cell.peak_pm25,
    horizonHours: cell.horizon_hours,
    exceedsThreshold: cell.exceeds_threshold,
    thresholdUgm3: cell.threshold_ugm3,
    degraded: cell.degraded,
    modelVersion: cell.model_version,
    observedPm25: cell.observed_pm25,
  }
}

/**
 * Source registry entry to the UI's health row.
 *
 * `GET /api/v1/sources` is a *registry*, not a health feed: it has no
 * freshness, latency, error rate or record count. Those UI columns therefore
 * read as unknown in live mode rather than showing the demo's figures.
 */
export function toSourceHealth(source: ApiSource): SourceHealth {
  return {
    id: source.source_id,
    name: source.display_name || source.provider,
    status: source.enabled ? 'Healthy' : 'Offline',
    freshnessMinutes: null,
    quality: null,
    recordsToday: null,
    lastIngestion: null,
    latencySec: null,
    errorRate: null,
    connector: `${source.connector_id} · ${source.status}`,
  }
}

export function toModelCatalogEntry(model: ApiModel): ModelCatalogEntry {
  return {
    modelId: model.model_id,
    modelName: model.model_name,
    version: model.version,
    stage: model.stage,
    runtimeRole: model.runtime_role,
    algorithm: model.algorithm,
    artifactAvailable: model.artifact_available,
    gateFailures: model.gate_failures ?? [],
    notes: model.notes,
  }
}

/** Provenance stamp for any live value with no richer detail to report. */
export function liveProvenance(partial: Partial<DataProvenance> = {}): DataProvenance {
  return { mode: 'live', ...partial }
}
