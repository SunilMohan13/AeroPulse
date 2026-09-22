import { mockEvidence, evidenceNodes, evidenceEdges, eventTimeline } from '../data/mockEvidence'
import type { EvidenceItem, EvidenceNode, EvidenceEdge, TimelineEvent } from '../types'
import { liveEvidence } from '../api/live'
import { resolve } from './resolve'

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms))

async function demoEvidence(eventId: string): Promise<EvidenceItem[]> {
  await delay()
  return mockEvidence.filter((e) => e.supports === eventId)
}

export async function fetchEvidence(eventId: string): Promise<EvidenceItem[]> {
  return resolve(
    'evidence',
    () => demoEvidence(eventId),
    () => liveEvidence(eventId),
  )
}

/**
 * The evidence graph view.
 *
 * `GET /api/v1/events/{id}/graph` returns `graph.v1` edges without the x/y
 * coordinates this hand-laid diagram needs, so live mode does not attempt a
 * partial rendering. The demo graph is the curated illustration and stays
 * the illustration; the live evidence *list* is wired above and is where
 * real lineage shows up.
 */
export async function fetchEvidenceGraph(): Promise<{
  nodes: EvidenceNode[]
  edges: EvidenceEdge[]
}> {
  await delay()
  return { nodes: evidenceNodes, edges: evidenceEdges }
}

export async function fetchEventTimeline(eventId: string): Promise<TimelineEvent[]> {
  await delay(60)
  if (eventId === 'EVT-1024') return eventTimeline
  return eventTimeline.slice(0, 3)
}
