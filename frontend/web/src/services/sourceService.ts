import { mockSources } from '../data/mockSources'
import type { SourceHealth } from '../types'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

let freshnessBump = 0

export function bumpSourceFreshness() {
  freshnessBump = (freshnessBump + 1) % 3
}

export async function fetchSources(): Promise<SourceHealth[]> {
  await delay()
  return mockSources.map((s) => ({
    ...s,
    freshnessMinutes: s.freshnessMinutes + freshnessBump,
  }))
}

export async function fetchSource(id: string): Promise<SourceHealth | null> {
  await delay(60)
  const source = mockSources.find((s) => s.id === id)
  return source ?? null
}
