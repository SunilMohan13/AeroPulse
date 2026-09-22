import { getForecastSeries, mockForecast, mockObservedHistory } from '../data/mockForecast'
import type { ForecastPoint } from '../types'
import { liveForecast } from '../api/live'
import { resolve } from './resolve'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

/**
 * Observed PM2.5 leading up to detection.
 *
 * No API route returns a per-cell observed history as a series; the closest
 * is `/api/v1/grid-features` filtered by cell and time, which the forecast
 * chart would have to re-derive. Left on the demo series until a history
 * endpoint exists, rather than faking one from a single latest value.
 */
export async function fetchObservedHistory(): Promise<{ hour: number; pm25: number }[]> {
  await delay(60)
  return mockObservedHistory
}

async function demoForecast(): Promise<ForecastPoint[]> {
  await delay()
  return mockForecast
}

async function demoForecastSeries(): Promise<ForecastPoint[]> {
  await delay()
  return getForecastSeries()
}

export async function fetchForecast(): Promise<ForecastPoint[]> {
  return resolve('forecast', demoForecast, liveForecast)
}

export async function fetchForecastSeries(): Promise<ForecastPoint[]> {
  return resolve('forecast-series', demoForecastSeries, liveForecast)
}
