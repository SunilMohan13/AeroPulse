import { mockCitizenReports } from '../data/mockCitizenReports'
import type { CitizenReport } from '../types'
import { liveCitizenReports } from '../api/live'
import { isDemo } from './dataMode'
import { resolve } from './resolve'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

/**
 * What live mode cannot show on this screen.
 *
 * The list route now exists, so reports are fetched live. What is still
 * missing is classification: no CV model is deployed, so every report comes
 * back `cv_class=unknown` and `moderation=pending`. A live feed is therefore
 * a list of unclassified pending items — real, but thinner than the demo's
 * corroborated/rejected narrative.
 */
export const CITIZEN_LIVE_CAVEAT =
  'Reports are live, but no CV model is deployed: every report returns cv_class=unknown and ' +
  'moderation=pending, so classification and corroboration stay empty until one is.'

async function demoReports(): Promise<CitizenReport[]> {
  await delay()
  return mockCitizenReports
}

export async function fetchCitizenReports(): Promise<CitizenReport[]> {
  return resolve('citizen', demoReports, liveCitizenReports)
}

export async function fetchCitizenStats() {
  const reports = await fetchCitizenReports()
  if (isDemo()) {
    await delay(50)
    return { totalToday: 312, awaiting: 27, correlated: 84, reports }
  }
  // Derived from what the API actually returned, rather than the demo's
  // headline figures. An empty backend therefore reads as zero, which is the
  // truth about a stack nobody has reported into.
  return {
    totalToday: reports.length,
    awaiting: reports.filter((r) => r.status === 'PENDING').length,
    correlated: reports.filter((r) => r.status === 'CORROBORATED').length,
    reports,
  }
}
