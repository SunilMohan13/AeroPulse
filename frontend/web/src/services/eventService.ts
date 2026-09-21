import { mockEvents, HERO_EVENT_ID } from '../data/mockEvents'
import type { PollutionEvent, SourceLikelihood } from '../types'
import { fetchApiJson, getApiBase } from './api'

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms))

let livePm25Offset = 0

export function bumpLivePm25() {
  livePm25Offset += Math.round((Math.random() - 0.3) * 6)
}

export function getLivePm25Offset() {
  return livePm25Offset
}

function parseGeometryLatLon(geometry?: string | null) {
  if (!geometry || !geometry.startsWith('POINT(') || !geometry.endsWith(')')) {
    return { lat: 28.61, lon: 77.21 }
  }

  const inner = geometry.slice(6, -1).trim()
  const [lon, lat] = inner.split(/\s+/).map(Number)
  if (Number.isFinite(lon) && Number.isFinite(lat)) {
    return { lat, lon }
  }
  return { lat: 28.61, lon: 77.21 }
}

function normalizeStatus(value?: string): PollutionEvent['status'] {
  const candidate = (value ?? 'DETECTED').toUpperCase()
  const allowed = [
    'DETECTED',
    'VALIDATING',
    'CONFIRMED',
    'FORECASTING',
    'ACTIVE',
    'DECLINING',
    'RESOLVED',
    'REJECTED',
  ] as const
  const normalized = allowed.includes(candidate as (typeof allowed)[number]) ? candidate : 'DETECTED'
  return normalized as PollutionEvent['status']
}

function normalizeSeverity(value?: string): PollutionEvent['severity'] {
  const candidate = (value ?? 'MEDIUM').toUpperCase()
  const allowed = ['LOW', 'MEDIUM', 'HIGH', 'SEVERE'] as const
  const normalized = allowed.includes(candidate as (typeof allowed)[number]) ? candidate : 'MEDIUM'
  return normalized as PollutionEvent['severity']
}

function mapLiveEvent(event: Record<string, unknown>): PollutionEvent {
  const geometry = typeof event.geometry === 'string' ? event.geometry : null
  const { lat, lon } = parseGeometryLatLon(geometry)
  const pm25 = Number(event.pm25 ?? event.impact ?? 150) || 150
  const aqi = Number(event.aqi ?? Math.round(pm25 * 1.4)) || Math.round(pm25 * 1.4)
  const sourceLikelihood: SourceLikelihood[] = [
    { source: 'Regional transport', probability: 62 },
    { source: 'Biomass burning', probability: 48 },
    { source: 'Traffic', probability: 22 },
    { source: 'Industrial', probability: 18 },
  ]

  const status = normalizeStatus(typeof event.status === 'string' ? event.status : undefined)
  const severity = normalizeSeverity(typeof event.severity === 'string' ? event.severity : undefined)

  return {
    id: String(event.event_id ?? event.id ?? 'evt-live'),
    title: String(event.title ?? `Pollution event ${String(event.event_id ?? 'live')}`),
    type: 'traffic',
    severity,
    status,
    lat,
    lon,
    pm25,
    pm10: Math.round(pm25 * 1.28),
    aqi,
    detectionConfidence: Number(event.detection_confidence ?? 0.8) * 100,
    sourceConfidence: Number(event.source_confidence ?? 0.7) * 100,
    forecastConfidence: Number(event.forecast_confidence ?? 0.65) * 100,
    impactConfidence: Number(event.impact_confidence ?? 0.72) * 100,
    populationAtRisk: Number(event.population_at_risk ?? 1_200_000),
    region: 'Live AeroPulse feed',
    detectedAt: typeof event.created_at === 'string' ? event.created_at : new Date().toISOString(),
    updatedAt: typeof event.updated_at === 'string' ? event.updated_at : new Date().toISOString(),
    fireCount: 0,
    frpMw: 0,
    sourceLikelihood,
    recommendedActions: [
      'Validate sensor and satellite corroboration',
      'Prioritize public health advisory for the affected grid',
    ],
  }
}

export async function fetchEvents(): Promise<PollutionEvent[]> {
  const hasLiveToken = !!(import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()
  if (hasLiveToken) {
    try {
      const data = await fetchApiJson<{ items?: Record<string, unknown>[] }>(`/api/v1/events?limit=10`, {
        items: [],
      })
      const items = data.items ?? []
      if (items.length > 0) {
        return items.map((item) => mapLiveEvent(item))
      }
    } catch {
      // fall through to demo data below
    }
  }

  await delay()
  return mockEvents.map((e) =>
    e.id === HERO_EVENT_ID ? { ...e, pm25: e.pm25 + livePm25Offset } : e,
  )
}

export async function fetchEvent(id: string): Promise<PollutionEvent | null> {
  const hasLiveToken = !!(import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()
  if (hasLiveToken) {
    try {
      const data = await fetchApiJson<Record<string, unknown> | null>(
        `/api/v1/events/${id}`,
        null as Record<string, unknown> | null,
      )
      if (data && typeof data === 'object') {
        return mapLiveEvent(data)
      }
    } catch {
      // fall through
    }
  }

  await delay()
  const event = mockEvents.find((e) => e.id === id)
  if (!event) return null
  return event.id === HERO_EVENT_ID ? { ...event, pm25: event.pm25 + livePm25Offset } : event
}

export async function fetchActiveEventCount(): Promise<number> {
  const hasLiveToken = !!(import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()
  if (hasLiveToken) {
    try {
      const data = await fetchApiJson<{ total?: number }>(`/api/v1/events?limit=100`, { total: 0 })
      return Number(data.total ?? 0)
    } catch {
      // fall through
    }
  }

  await delay(50)
  return mockEvents.filter((e) => e.status === 'ACTIVE' || e.status === 'CONFIRMED').length
}

if (import.meta.env.DEV) {
  console.info(`AeroPulse frontend API base: ${getApiBase()}`)
}
