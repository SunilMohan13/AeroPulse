import { mockRiskAreas } from '../data/mockPopulation'
import type { PopulationRiskArea } from '../types'
import { fetchApiJson } from './api'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

export async function fetchRiskAreas(): Promise<PopulationRiskArea[]> {
  if ((import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()) {
    const data = await fetchApiJson<{ items?: Record<string, unknown>[] }>(
      '/api/v1/risk/areas?pm25=180',
      { items: [] },
    )
    if ((data.items ?? []).length > 0) {
      return (data.items ?? []).map((item) => ({
        rank: Number(item.rank ?? 0),
        name: String(item.name ?? item.cell_id ?? 'Area'),
        risk: String(item.risk ?? 'LOW') as PopulationRiskArea['risk'],
        population: Number(item.population ?? 0),
        lat: Number(item.lat ?? 0),
        lon: Number(item.lon ?? 0),
      }))
    }
  }
  await delay()
  return mockRiskAreas
}

/**
 * Single source of truth for exposure, so the Overview KPI and the Risk
 * headline cannot disagree. Derived from the ranked areas rather than a
 * standalone constant.
 */
export async function fetchTotalExposure(): Promise<number> {
  const areas = await fetchRiskAreas()
  if ((import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()) {
    return areas.reduce((sum, area) => sum + area.population, 0)
  }
  await delay(50)
  return mockRiskAreas.reduce((sum, a) => sum + a.population, 0)
}
