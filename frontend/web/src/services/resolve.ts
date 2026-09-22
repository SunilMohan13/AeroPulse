/**
 * The demo/live branch, in one place.
 *
 * Every service call goes through `resolve`, so the fallback policy is
 * written once and cannot drift between endpoints.
 *
 * The policy: in live mode, try live. If it fails, serve the demo value
 * **and record the failure** so the UI can say a banner's worth of truth
 * about it. Falling back silently would leave an operator reading a scripted
 * Punjab episode while the header says "Live", which is the single most
 * damaging thing this layer could do.
 */

import { ApiError } from '../api/client'
import { isDemo, recordFallback, clearFallback } from './dataMode'

/**
 * Run the demo or live implementation according to the current mode.
 *
 * @param endpoint Stable label for the fallback banner, e.g. `events`.
 * @param demo Demo implementation. Must never throw; it is the safety net.
 * @param live Live implementation.
 * @param options `allowFallback: false` rethrows instead of serving demo
 *   data — used where a demo value would be actively misleading rather than
 *   merely wrong, such as a model catalog that only exists live.
 */
export async function resolve<T>(
  endpoint: string,
  demo: () => Promise<T>,
  live: () => Promise<T>,
  options: { allowFallback?: boolean } = {},
): Promise<T> {
  if (isDemo()) return demo()

  try {
    const result = await live()
    clearFallback(endpoint)
    return result
  } catch (error) {
    const reason = error instanceof ApiError ? error.reason : 'unexpected error'
    if (options.allowFallback === false) {
      recordFallback(endpoint, reason)
      throw error
    }
    recordFallback(endpoint, `${reason} — showing demo data`)
    return demo()
  }
}
