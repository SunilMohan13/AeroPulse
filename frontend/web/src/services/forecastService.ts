import { getForecastSeries, mockForecast, mockObservedHistory } from '../data/mockForecast'
import type { ForecastPoint } from '../types'
import { fetchApiJson } from './api'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

export async function fetchObservedHistory(): Promise<{ hour: number; pm25: number }[]> {
  await delay(60)
  return mockObservedHistory
}

export async function fetchForecast(eventId?: string): Promise<ForecastPoint[]> {
  if (eventId && (import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()) {
    const data = await fetchApiJson<{
      generated_at?: string
      grid_predictions?: Record<string, unknown>[]
      horizons?: number[]
      horizon_hours?: number
    }>(`/api/v1/events/${eventId}/forecast`, { grid_predictions: [] })
    const predictions = data.grid_predictions ?? []
    if (predictions.length > 0) {
      const generatedAt = data.generated_at ? new Date(data.generated_at).getTime() : Date.now()
      const horizon = Number(data.horizon_hours ?? data.horizons?.[0] ?? 0)
      return predictions.map((prediction, index) => {
        const pm25 = Number(prediction.pm25 ?? 0)
        const confidence = Number(prediction.confidence ?? 0)
        return {
          hour: horizon || index,
          timestamp: new Date(generatedAt + (horizon || index) * 3600000).toISOString(),
          pm25,
          confidenceLow: Math.max(0, pm25 * (1 - (1 - confidence) * 0.25)),
          confidenceHigh: pm25 * (1 + (1 - confidence) * 0.25),
        }
      })
    }
  }
  await delay()
  return mockForecast
}

export async function fetchForecastSeries(): Promise<ForecastPoint[]> {
  await delay()
  return getForecastSeries()
}
