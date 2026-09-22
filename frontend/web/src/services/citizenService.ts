import { mockCitizenReports } from '../data/mockCitizenReports'
import type { CitizenReport } from '../types'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

/**
 * Citizen reports — demo only, and not for want of wiring.
 *
 * The API exposes `POST /api/v1/citizen/reports`, `POST /reports/{id}/media`
 * and `GET /reports/{id}`. There is no list route, so a client cannot
 * enumerate reports without already knowing every id. Backend behaviour also
 * pins every report at `moderation=pending` with `cv_class=unknown`, because
 * no CV model is deployed; a live feed would therefore be a list of
 * unclassified pending items.
 *
 * Wiring a single-report GET behind a screen that needs a feed would look
 * live while showing nothing, which is worse than being plainly demo. Closed
 * by adding `GET /api/v1/citizen/reports` with the standard
 * items/total/limit/offset shape.
 */
export const CITIZEN_LIVE_UNSUPPORTED =
  'The API has no citizen report list route (only POST and GET by id), so this screen stays on demo data in live mode.'

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
