import { mockEvidence, evidenceNodes, evidenceEdges, eventTimeline } from '../data/mockEvidence'
import type { EvidenceItem, EvidenceNode, EvidenceEdge, TimelineEvent } from '../types'

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms))

export async function fetchEvidence(eventId: string): Promise<EvidenceItem[]> {
  await delay()
  return mockEvidence.filter((e) => e.supports === eventId)
}

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
