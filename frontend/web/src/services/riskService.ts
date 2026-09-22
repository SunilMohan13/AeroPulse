import { mockRiskAreas } from '../data/mockPopulation'
import type { PopulationRiskArea } from '../types'
import { liveRiskAreas } from '../api/live'
import { isDemo } from './dataMode'
import { resolve } from './resolve'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

async function demoRiskAreas(): Promise<PopulationRiskArea[]> {
  await delay()
  return mockRiskAreas
}

export async function fetchRiskAreas(): Promise<PopulationRiskArea[]> {
  return resolve('risk-areas', demoRiskAreas, liveRiskAreas)
}

/**
 * Total population in the ranked exposure areas.
 *
 * Demo only. In live mode the `population` field is density per km² from the
 * reference layer, not a headcount, so summing it would produce a number
 * with no meaning presented as "people at risk" — the most quotable figure
 * on the Overview. Live returns null and the KPI renders "—".
 */
export async function fetchTotalExposure(): Promise<number | null> {
  if (!isDemo()) return null
  await delay(50)
  return mockRiskAreas.reduce((sum, a) => sum + a.population, 0)
}
