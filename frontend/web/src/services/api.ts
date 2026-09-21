const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined ?? 'http://127.0.0.1:18000').replace(/\/$/, '')

export function getApiBase() {
  return API_BASE
}

export function getAuthHeader(): Record<string, string> {
  const token = (import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchApiJson<T>(
  path: string,
  fallback: T,
  init: RequestInit = {},
): Promise<T> {
  const token = (import.meta.env.VITE_API_TOKEN as string | undefined ?? '').trim()
  if (!token) {
    return fallback
  }

  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    }
    Object.assign(headers, getAuthHeader())

    const response = await fetch(url, {
      ...init,
      headers,
    })

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }

    return (await response.json()) as T
  } catch (error) {
    console.warn(`Falling back to demo data for ${path}:`, error)
    return fallback
  }
}
