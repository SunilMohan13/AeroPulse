/**
 * Live implementations of every UI data need.
 *
 * One function per service call, each returning UI types. The service layer
 * chooses between these and the demo narrative; nothing here knows about
 * modes or fallbacks.
 */

import type {
  ApiAqProperties,
  ApiCitizenReport,
  ApiCopilot,
  ApiEvent,
  ApiEvidence,
  ApiFireProperties,
  ApiForecast,
  ApiGridFeature,
  ApiHazardCell,
  ApiIndustryProperties,
  ApiModel,
  ApiPeakForecast,
  ApiPopulationSource,
  ApiProvenance,
  ApiRiskArea,
  ApiSource,
  ApiWeatherProperties,
} from './contracts'
import type {
  CitizenReport,
  CopilotMessage,
  EvidenceItem,
  FireObservation,
  ForecastPoint,
  GridCell,
  HazardCell,
  IndustrySite,
  ModelCatalogEntry,
  PeakForecastCell,
  PollutionEvent,
  PopulationRiskArea,
  SourceHealth,
  WindObservation,
} from '../types'
import { apiGet, apiPost, type FeatureCollection, type ListResponse } from './client'
import {
  toEvidenceItem,
  toFireObservation,
  toForecastPoints,
  toGridCell,
  toHazardCell,
  toModelCatalogEntry,
  toPeakForecastCell,
  toPollutionEvent,
  toSourceHealth,
  toWindObservation,
} from './adapters'
import { KM1_DEG } from '../utils/geo'

/** Cache of grid features within one render pass, keyed by cell. */
const featureCache = new Map<string, ApiGridFeature | null>()

/** Drop memoised features so a refetch sees fresh concentrations. */
export function clearLiveCaches(): void {
  featureCache.clear()
}

async function gridFeature(gridId: string): Promise<ApiGridFeature | null> {
  if (featureCache.has(gridId)) return featureCache.get(gridId) ?? null
  let feature: ApiGridFeature | null = null
  try {
    feature = await apiGet<ApiGridFeature>(`/api/v1/grid-features/${gridId}/latest`)
  } catch {
    // A 404 is ordinary: a cell can have an event without a persisted
    // feature row. The event still renders, with concentrations marked
    // unavailable by the adapter.
    feature = null
  }
  featureCache.set(gridId, feature)
  return feature
}

export async function liveEvents(): Promise<PollutionEvent[]> {
  const response = await apiGet<ListResponse<ApiEvent>>('/api/v1/events', { limit: 50 })
  return Promise.all(
    response.items.map(async (event) =>
      toPollutionEvent(event, (await gridFeature(event.grid_ids[0] ?? '')) ?? undefined),
    ),
  )
}

export async function liveEvent(id: string): Promise<PollutionEvent | null> {
  const event = await apiGet<ApiEvent>(`/api/v1/events/${id}`)
  const feature = await gridFeature(event.grid_ids[0] ?? '')
  return toPollutionEvent(event, feature ?? undefined)
}

export async function liveEvidence(eventId: string): Promise<EvidenceItem[]> {
  const response = await apiGet<ListResponse<ApiEvidence>>(`/api/v1/events/${eventId}/evidence`)
  return response.items.map((item) => toEvidenceItem(item, eventId))
}

/** The most recently updated event, used where the UI needs "the" event. */
async function primaryEventId(): Promise<string | null> {
  const response = await apiGet<ListResponse<ApiEvent>>('/api/v1/events', { limit: 20 })
  const active = response.items.find((e) => e.status === 'ACTIVE' || e.status === 'CONFIRMED')
  return (active ?? response.items[0])?.event_id ?? null
}

export async function liveForecast(eventId?: string): Promise<ForecastPoint[]> {
  const target = eventId ?? (await primaryEventId())
  if (!target) return []
  const forecast = await apiGet<ApiForecast>(`/api/v1/events/${target}/forecast`)
  return toForecastPoints(forecast)
}

export async function liveAirQuality(): Promise<GridCell[]> {
  const response = await apiGet<ListResponse<ApiGridFeature>>('/api/v1/grid-features', {
    limit: 500,
  })
  // H3 resolution 8 is ~1 km across; the UI renders square cells of that
  // edge length rather than true hexagons, matching how the demo grid draws.
  return response.items.map((feature) => toGridCell(feature, KM1_DEG))
}

export async function liveFires(): Promise<FireObservation[]> {
  const collection = await apiGet<FeatureCollection<ApiFireProperties>>('/api/v1/map/fire', {
    limit: 500,
  })
  return collection.features.map((f) =>
    toFireObservation(f.properties, f.geometry.coordinates as unknown as [number, number]),
  )
}

export async function liveWeather(): Promise<WindObservation[]> {
  const collection = await apiGet<FeatureCollection<ApiWeatherProperties>>('/api/v1/map/weather', {
    limit: 500,
  })
  return collection.features
    .map((f) =>
      toWindObservation(f.properties, f.geometry.coordinates as unknown as [number, number]),
    )
    .filter((w): w is WindObservation => w !== null)
}

export async function liveSources(): Promise<SourceHealth[]> {
  const response = await apiGet<ListResponse<ApiSource>>('/api/v1/sources', { limit: 50 })
  return response.items.map(toSourceHealth)
}

export async function liveModels(): Promise<ModelCatalogEntry[]> {
  const response = await apiGet<ListResponse<ApiModel>>('/api/v1/models', { limit: 100 })
  return response.items.map(toModelCatalogEntry)
}

export interface LiveHazard {
  cells: HazardCell[]
  provenance: ApiProvenance | null
}

export async function liveHazard(): Promise<LiveHazard> {
  const response = await apiGet<ListResponse<ApiHazardCell> & { provenance?: ApiProvenance }>(
    '/api/v1/grid-hazard',
    { limit: 500 },
  )
  return {
    cells: response.items
      .map(toHazardCell)
      .filter((c): c is HazardCell => c !== null)
      .sort((a, b) => b.hazardScore - a.hazardScore),
    provenance: response.provenance ?? null,
  }
}

export interface LivePeak {
  cells: PeakForecastCell[]
  provenance: ApiProvenance | null
}

export async function livePeak(): Promise<LivePeak> {
  const response = await apiGet<ListResponse<ApiPeakForecast> & { provenance?: ApiProvenance }>(
    '/api/v1/grid-peak',
    { limit: 500 },
  )
  return {
    cells: response.items
      .map(toPeakForecastCell)
      .filter((c): c is PeakForecastCell => c !== null)
      .sort((a, b) => b.peakPm25 - a.peakPm25),
    provenance: response.provenance ?? null,
  }
}

/**
 * Ranked exposure areas from `GET /api/v1/risk/areas`.
 *
 * Replaces an earlier client-side approach that scored each grid cell with
 * its own `/api/v1/risk` call: one request instead of N, and the ranking is
 * computed where the population data lives rather than being re-derived in
 * the browser.
 *
 * `population` here is a real headcount from the reference layer, not a
 * density — unlike the grid-feature path, where only density exists.
 */
export async function liveRiskAreas(): Promise<PopulationRiskArea[]> {
  const response = await apiGet<{
    items: ApiRiskArea[]
    population_source?: ApiPopulationSource
  }>('/api/v1/risk/areas', { pm25: 180, exposure_hours: 6 })

  return response.items.map((area) => ({
    rank: area.rank,
    name: area.name,
    risk: toRiskBand(area.risk),
    population: area.population,
    lat: area.lat,
    lon: area.lon,
  }))
}

/** Population provenance, so the UI can state which provider backs a number. */
export async function livePopulationSource(): Promise<ApiPopulationSource | null> {
  const response = await apiGet<{ population_source?: ApiPopulationSource }>(
    '/api/v1/risk/areas',
    { pm25: 180, exposure_hours: 6 },
  )
  return response.population_source ?? null
}

function toRiskBand(value: string): PopulationRiskArea['risk'] {
  const upper = value.toUpperCase()
  if (upper === 'SEVERE' || upper === 'HIGH' || upper === 'MEDIUM') return upper
  return 'LOW'
}

/**
 * Citizen reports from `GET /api/v1/citizen/reports`.
 *
 * Every report the API returns is `moderation=pending` with
 * `cv_class=unknown` until a CV model is deployed, so `classification` will
 * read "unknown" and confidence stays low. That is the true state of the
 * pipeline, not a mapping defect.
 */
export async function liveCitizenReports(): Promise<CitizenReport[]> {
  const response = await apiGet<ListResponse<ApiCitizenReport>>('/api/v1/citizen/reports')
  return response.items.map((report) => ({
    id: report.report_id,
    type: report.observation_type,
    location: `${report.lat.toFixed(3)}, ${report.lon.toFixed(3)}`,
    lat: report.lat,
    lon: report.lon,
    reportedAt: report.observed_at,
    // No CV model runs, so an unclassified report carries no classifier
    // confidence. 50 is the "no information" midpoint, not a measurement.
    confidence: report.cv_class === 'unknown' ? 50 : 70,
    classification: report.cv_class,
    corroboration: report.correlated_event_id ? 1 : 0,
    status:
      report.moderation === 'accepted'
        ? 'CORROBORATED'
        : report.moderation === 'rejected'
          ? 'REJECTED'
          : 'PENDING',
    relatedEventId: report.correlated_event_id ?? undefined,
  }))
}

/** Industrial assets from `GET /api/v1/map/industry`. */
export async function liveIndustries(): Promise<IndustrySite[]> {
  const collection = await apiGet<FeatureCollection<ApiIndustryProperties>>(
    '/api/v1/map/industry',
    { limit: 500 },
  )
  return collection.features.map((feature, index) => {
    const [lon, lat] = feature.geometry.coordinates as unknown as [number, number]
    const properties = feature.properties
    return {
      id: properties.asset_id ?? properties.product_id ?? `industry_${index}`,
      name: properties.name ?? properties.product_id ?? 'Industrial asset',
      lat,
      lon,
      // The replay serves raster product footprints, which carry no asset
      // classification. Labelled generically rather than guessed at.
      type: properties.resolution ? `Asset (${properties.resolution})` : 'Industrial asset',
    }
  })
}

export async function liveCopilot(query: string): Promise<CopilotMessage> {
  const response = await apiPost<ApiCopilot>('/api/v1/copilot/query', { question: query })
  const sections: string[] = [response.answer]
  if (response.observed_facts?.length) {
    sections.push(`OBSERVED\n${response.observed_facts.map((f) => `• ${f}`).join('\n')}`)
  }
  if (response.likely_sources?.length) {
    sections.push(`INFERRED\n${response.likely_sources.map((s) => `• ${s}`).join('\n')}`)
  }
  if (response.predicted_conditions?.length) {
    sections.push(`PREDICTED\n${response.predicted_conditions.map((p) => `• ${p}`).join('\n')}`)
  }
  if (response.limitations?.length) {
    sections.push(`LIMITATIONS\n${response.limitations.map((l) => `• ${l}`).join('\n')}`)
  }
  // `llm_used` is false in this build: the Copilot copies numbers from stored
  // events rather than generating them. Saying so on the message keeps a
  // reader from crediting it with reasoning it did not do.
  if (response.llm_used === false) {
    sections.push('Evidence lookup only — no language model was used to produce this answer.')
  }
  return {
    id: `msg_${Date.now()}`,
    role: 'assistant',
    content: sections.join('\n\n'),
    citations: (response.evidence ?? [])
      .filter((e) => e.source)
      .map((e) => ({ source: e.source ?? '', time: e.time ?? '' })),
  }
}

/** Air-quality observation points, for the map's station layer. */
export async function liveStations(): Promise<
  { lat: number; lon: number; parameter: string; value: number; sourceId: string }[]
> {
  const collection = await apiGet<FeatureCollection<ApiAqProperties>>('/api/v1/map/air-quality', {
    limit: 500,
  })
  return collection.features.map((f) => {
    const [lon, lat] = f.geometry.coordinates as unknown as [number, number]
    return {
      lat,
      lon,
      parameter: f.properties.parameter,
      value: f.properties.value,
      sourceId: f.properties.source_id,
    }
  })
}
