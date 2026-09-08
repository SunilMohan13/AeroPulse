import { getForecastSeries, mockForecast, mockObservedHistory } from '../data/mockForecast'
import type { ForecastPoint } from '../types'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

export async function fetchObservedHistory(): Promise<{ hour: number; pm25: number }[]> {
  await delay(60)
  return mockObservedHistory
}

export async function fetchForecast(): Promise<ForecastPoint[]> {
  await delay()
  return mockForecast
}

export async function fetchForecastSeries(): Promise<ForecastPoint[]> {
  await delay()
  return getForecastSeries()
}
