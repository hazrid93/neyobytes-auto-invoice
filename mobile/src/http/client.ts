/**
 * The HTTP client — the ONE place that knows the backend base URL, how to
 * attach the bearer token, and how to turn a non-2xx response into a typed
 * ApiError. Services consume `request<T>()` and never touch fetch directly.
 *
 * View models consume `ApiError` via a small `mapApiError()` to choose screen
 * messages; they never see fetch or status codes.
 */
import { getToken } from './tokenStore'

/** Backend base URL — inlined at bundle time via EXPO_PUBLIC_* (SDK 49+).
 * For a same-origin web deploy behind nginx, set EXPO_PUBLIC_API_BASE_URL=""
 * (empty) so requests hit /auth/... on the deployed origin; nginx proxies
 * /auth /invoices /myinvois /health to the backend port (no /api prefix). */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4001'

export interface ApiError {
  /** Machine slug from the backend (e.g. 'invalid_credentials'). */
  code: string
  /** Human detail from the backend. */
  message: string
  /** zod issues if the backend returned invalid_input. */
  issues?: unknown
  status: number
}

async function buildHeaders(extra?: Record<string, string>): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  const token = await getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * Typed request. Throws ApiError on non-2xx; returns parsed JSON as T.
 * Network failures (offline) are normalized to a 0-status ApiError so the
 * view-model layer has one error shape to handle.
 */
export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: await buildHeaders(init.headers),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch (e) {
    // Network-level failure (offline, DNS, CORS). Single normalized shape.
    const apiErr: ApiError = {
      code: 'network_error',
      message: String((e as Error)?.message ?? 'Network request failed'),
      status: 0,
    }
    throw apiErr
  }

  if (!res.ok) {
    let body: { error?: string; message?: string; issues?: unknown } = {}
    try {
      body = await res.json()
    } catch {
      /* non-JSON error body */
    }
    const apiErr: ApiError = {
      code: body.error ?? `http_${res.status}`,
      message: body.message ?? res.statusText,
      issues: body.issues,
      status: res.status,
    }
    throw apiErr
  }

  // 204 No Content / empty body → return null typed as T (caller opts in).
  if (res.status === 204) return null as T
  return (await res.json()) as T
}

/** Helper for view models: turn an ApiError into a short user-facing message. */
export function apiErrorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'status' in e && 'code' in e) {
    const err = e as ApiError
    if (err.status === 0) return 'You appear to be offline. Check your connection.'
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 503) return 'The service is temporarily unavailable. Try again shortly.'
    return err.message || err.code
  }
  return 'Something went wrong.'
}