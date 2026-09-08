import { getGridAt, type GridBounds } from '../data/mockGrid'
import { getFiresAt } from '../data/mockFires'
import { defaultWind } from '../data/mockWind'
import { mockIndustries } from '../data/mockPopulation'
import type { GridCell, FireObservation, WindObservation, IndustrySite } from '../types'

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms))

/** Mirrors GET /api/v1/map/air-quality?bbox=&time=&resolution= */
export async function fetchAirQuality(
  hourOffset = 0,
  intensity = 1,
  bounds?: GridBounds,
): Promise<GridCell[]> {
  await delay()
  return getGridAt(hourOffset, intensity, bounds)
}

export async function fetchFires(
  hourOffset = 0,
  intensity = 1,
): Promise<FireObservation[]> {
  await delay(80)
  return getFiresAt(hourOffset, intensity)
}

export async function fetchWeather(): Promise<WindObservation[]> {
  await delay(60)
  return defaultWind
}

export async function fetchIndustries(): Promise<IndustrySite[]> {
  await delay(40)
  return mockIndustries
}
