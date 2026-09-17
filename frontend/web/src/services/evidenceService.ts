import { mockEvidence, evidenceNodes, evidenceEdges, eventTimeline } from '../data/mockEvidence'
import type { EvidenceItem, EvidenceNode, EvidenceEdge, TimelineEvent } from '../types'
import { fetchApiJson } from './api'

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms))

export async function fetchEvidence(eventId: string): Promise<EvidenceItem[]> {
  if ((import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()) {
    const data = await fetchApiJson<{ items?: Record<string, unknown>[] }>(
      `/api/v1/events/${eventId}/evidence`,
      { items: [] },
    )
    const items = data.items ?? []
    if (items.length > 0) {
      return items.map((item) => ({
        id: String(item.evidence_id ?? item.id ?? 'evidence'),
        category: String(item.evidence_type ?? 'Evidence'),
        source: String(item.evidence_type ?? 'AeroPulse'),
        observation: String(item.summary ?? ''),
        time: String(item.observed_at ?? item.created_at ?? new Date().toISOString()),
        confidence: Number(item.quality_score ?? 0) * 100,
        supports: eventId,
        strength: Number(item.quality_score ?? 0) >= 0.8 ? 'Strong' : 'Moderate',
      }))
    }
  }
  await delay()
  return mockEvidence.filter((e) => e.supports === eventId)
}

export async function fetchEvidenceGraph(): Promise<{
  nodes: EvidenceNode[]
  edges: EvidenceEdge[]
}> {
  if ((import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()) {
    const events = await fetchApiJson<{ items?: Record<string, unknown>[] }>(
      '/api/v1/events?limit=1',
      { items: [] },
    )
    const eventId = events.items?.[0]?.event_id ?? events.items?.[0]?.id
    if (eventId) {
      const graph = await fetchApiJson<{
        vertices?: Record<string, unknown>[]
        edges?: Record<string, unknown>[]
      }>(`/api/v1/events/${String(eventId)}/graph`, { vertices: [], edges: [] })
      if ((graph.vertices ?? []).length > 0) {
        const allowedTypes = ['event', 'fire', 'cpcb', 'satellite', 'weather', 'cams', 'forecast'] as const
        return {
          nodes: (graph.vertices ?? []).map((vertex, index) => {
            const rawType = String(vertex.type ?? 'event')
            const type = allowedTypes.includes(rawType as (typeof allowedTypes)[number])
              ? rawType as EvidenceNode['type']
              : 'event'
            const properties = vertex.properties && typeof vertex.properties === 'object'
              ? vertex.properties as Record<string, unknown>
              : {}
            return {
              id: String(vertex.id ?? `vertex-${index}`),
              label: String(properties.label ?? vertex.type ?? vertex.id ?? 'Evidence'),
              type,
              x: 120 + (index % 3) * 280,
              y: 100 + Math.floor(index / 3) * 120,
            }
          }),
          edges: (graph.edges ?? []).map((edge) => ({
            from: String(edge.from_id ?? ''),
            to: String(edge.to_id ?? ''),
          })),
        }
      }
    }
  }
  await delay()
  return { nodes: evidenceNodes, edges: evidenceEdges }
}

export async function fetchEventTimeline(eventId: string): Promise<TimelineEvent[]> {
  await delay(60)
  if (eventId === 'EVT-1024') return eventTimeline
  return eventTimeline.slice(0, 3)
}
