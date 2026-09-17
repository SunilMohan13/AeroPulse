import { mockCitizenReports } from '../data/mockCitizenReports'
import type { CitizenReport } from '../types'
import { fetchApiJson } from './api'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

export async function fetchCitizenReports(): Promise<CitizenReport[]> {
  if ((import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()) {
    const data = await fetchApiJson<{ items?: Record<string, unknown>[] }>(
      '/api/v1/citizen/reports?limit=100',
      { items: [] },
    )
    const items = data.items ?? []
    if (items.length > 0) {
      return items.map((item) => ({
        id: String(item.report_id ?? item.id ?? 'report'),
        type: String(item.observation_type ?? 'unknown'),
        location: `${Number(item.lat ?? 0).toFixed(3)}, ${Number(item.lon ?? 0).toFixed(3)}`,
        lat: Number(item.lat ?? 0),
        lon: Number(item.lon ?? 0),
        reportedAt: String(item.observed_at ?? new Date().toISOString()),
        confidence: item.cv_class === 'unknown' ? 50 : 70,
        classification: String(item.cv_class ?? 'unknown'),
        corroboration: item.correlated_event_id ? 1 : 0,
        status: item.moderation === 'accepted' ? 'CORROBORATED' : item.moderation === 'rejected' ? 'REJECTED' : 'PENDING',
      }))
    }
  }
  await delay()
  return mockCitizenReports
}

export async function fetchCitizenStats() {
  const reports = await fetchCitizenReports()
  if ((import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()) {
    return {
      totalToday: reports.length,
      awaiting: reports.filter((report) => report.status === 'PENDING').length,
      correlated: reports.filter((report) => report.status === 'CORROBORATED').length,
      reports,
    }
  }
  await delay(50)
  return {
    totalToday: 312,
    awaiting: 27,
    correlated: 84,
    reports,
  }
}
