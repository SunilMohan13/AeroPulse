import { mockRiskAreas } from '../data/mockPopulation'
import type { PopulationRiskArea } from '../types'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

export async function fetchRiskAreas(): Promise<PopulationRiskArea[]> {
  await delay()
  return mockRiskAreas
}

/**
 * Single source of truth for exposure, so the Overview KPI and the Risk
 * headline cannot disagree. Derived from the ranked areas rather than a
 * standalone constant.
 */
export async function fetchTotalExposure(): Promise<number> {
  await delay(50)
  return mockRiskAreas.reduce((sum, a) => sum + a.population, 0)
}
