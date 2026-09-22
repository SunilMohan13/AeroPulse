/**
 * Live implementations of every UI data need.
 *
 * One function per service call, each returning UI types. The service layer
 * chooses between these and the demo narrative; nothing here knows about
 * modes or fallbacks.
 */

import type {
  ApiAqProperties,
  ApiCopilot,
  ApiEvent,
  ApiEvidence,
  ApiFireProperties,
  ApiForecast,
  ApiGridFeature,
  ApiHazardCell,
  ApiModel,
  ApiPeakForecast,
  ApiProvenance,
  ApiRisk,
  ApiSource,
  ApiWeatherProperties,
} from './contracts'
import type {
  CopilotMessage,
  EvidenceItem,
  FireObservation,
  ForecastPoint,
  GridCell,
  HazardCell,
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

export async function liveForecast(): Promise<ForecastPoint[]> {
  const eventId = await primaryEventId()
  if (!eventId) return []
  const forecast = await apiGet<ApiForecast>(`/api/v1/events/${eventId}/forecast`)
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
 * Ranked exposure areas, built from persisted cells plus the risk endpoint.
 *
 * `GET /api/v1/risk` scores one point at a time, so this queries it per cell
 * and ranks the results. `population` here is the reference layer's density
 * per km², not a headcount: the UI must label it as such, because a column
 * headed "population" showing 11,320 for Delhi would read as a city count.
 */
export async function liveRiskAreas(): Promise<PopulationRiskArea[]> {
  const features = await apiGet<ListResponse<ApiGridFeature>>('/api/v1/grid-features', {
    limit: 25,
  })
  const scored = await Promise.all(
    features.items
      .filter((f) => f.pm25 !== null)
      .map(async (f) => {
        const risk = await apiGet<ApiRisk>('/api/v1/risk', {
          pm25: f.pm25 ?? 0,
          lat: f.center_lat,
          lon: f.center_lon,
        })
        return { feature: f, risk }
      }),
  )
  return scored
    .sort((a, b) => b.risk.population_risk - a.risk.population_risk)
    .map(({ feature, risk }, index) => ({
      rank: index + 1,
      name: risk.population_reference ?? feature.grid_id.slice(0, 10),
      risk:
        risk.population_risk >= 0.6
          ? 'SEVERE'
          : risk.population_risk >= 0.35
            ? 'HIGH'
            : risk.population_risk >= 0.15
              ? 'MEDIUM'
              : 'LOW',
      population: Math.round(risk.population_density),
      lat: feature.center_lat,
      lon: feature.center_lon,
    }))
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
