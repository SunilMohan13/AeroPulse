import { mockSources } from '../data/mockSources'
import type { SourceHealth } from '../types'
import { fetchApiJson } from './api'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

let freshnessBump = 0

export function bumpSourceFreshness() {
  freshnessBump = (freshnessBump + 1) % 3
}

function mapLiveSource(source: Record<string, unknown>): SourceHealth {
  const sourceId = String(source.source_id ?? source.id ?? 'source')
  return {
    id: sourceId,
    name: String(source.display_name ?? source.provider ?? sourceId.toUpperCase()),
    status: 'Healthy',
    freshnessMinutes: 5,
    quality: 92,
    recordsToday: Number(source.records_today ?? 1200),
    lastIngestion: new Date().toISOString(),
    latencySec: 2.5,
    errorRate: 0.4,
    connector: String(source.connector_id ?? sourceId),
  }
}

export async function fetchSources(): Promise<SourceHealth[]> {
  const hasLiveToken = !!(import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()
  if (hasLiveToken) {
    try {
      const data = await fetchApiJson<{ items?: Record<string, unknown>[] }>(`/api/v1/sources?limit=100`, {
        items: [],
      })
      const items = data.items ?? []
      if (items.length > 0) {
        return items.map((item) => mapLiveSource(item))
      }
    } catch {
      // fall through to demo data below
    }
  }

  await delay()
  return mockSources.map((s) => ({
    ...s,
    freshnessMinutes: s.freshnessMinutes + freshnessBump,
  }))
}

export async function fetchSource(id: string): Promise<SourceHealth | null> {
  const hasLiveToken = !!(import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()
  if (hasLiveToken) {
    try {
      const data = await fetchApiJson<Record<string, unknown> | null>(
        `/api/v1/sources/${id}`,
        null as Record<string, unknown> | null,
      )
      if (data && typeof data === 'object') {
        return mapLiveSource(data)
      }
    } catch {
      // fall through
    }
  }

  await delay(60)
  const source = mockSources.find((s) => s.id === id)
  return source ?? null
}
