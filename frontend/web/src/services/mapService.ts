import { getGridAt, type GridBounds } from '../data/mockGrid'
import { getFiresAt } from '../data/mockFires'
import { defaultWind } from '../data/mockWind'
import { mockIndustries } from '../data/mockPopulation'
import type { GridCell, FireObservation, WindObservation, IndustrySite } from '../types'
import { liveAirQuality, liveFires, liveWeather } from '../api/live'
import { resolve } from './resolve'

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms))

/**
 * Mirrors GET /api/v1/map/air-quality.
 *
 * The demo path takes an hour offset and an intensity so the scripted
 * narrative can scrub time and ramp the episode. Live has no such controls:
 * the API serves the latest persisted grid-hour, so the timeline scrubber is
 * inert in live mode and the UI disables it rather than pretending it works.
 */
export async function fetchAirQuality(
  hourOffset = 0,
  intensity = 1,
  bounds?: GridBounds,
  transportBearingDeg?: number,
): Promise<GridCell[]> {
  return resolve(
    'air-quality',
    async () => {
      await delay()
      return getGridAt(hourOffset, intensity, bounds, transportBearingDeg)
    },
    liveAirQuality,
  )
}

export async function fetchFires(hourOffset = 0, intensity = 1): Promise<FireObservation[]> {
  return resolve(
    'fires',
    async () => {
      await delay(80)
      return getFiresAt(hourOffset, intensity)
    },
    liveFires,
  )
}

export async function fetchWeather(): Promise<WindObservation[]> {
  return resolve(
    'weather',
    async () => {
      await delay(60)
      return defaultWind
    },
    liveWeather,
  )
}

/**
 * Industrial sites.
 *
 * The OSM and industry connectors persist as `raster.v1` product footprints,
 * not as named point assets with a type, so `/api/v1/map/satellite` cannot
 * reconstruct this layer. Demo-only until an inventory endpoint exists.
 */
export async function fetchIndustries(): Promise<IndustrySite[]> {
  await delay(40)
  return mockIndustries
}
