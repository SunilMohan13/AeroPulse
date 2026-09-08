import { mockCitizenReports } from '../data/mockCitizenReports'
import type { CitizenReport } from '../types'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

export async function fetchCitizenReports(): Promise<CitizenReport[]> {
  await delay()
  return mockCitizenReports
}

export async function fetchCitizenStats() {
  await delay(50)
  const reports = mockCitizenReports
  return {
    totalToday: 312,
    awaiting: 27,
    correlated: 84,
    reports,
  }
}
