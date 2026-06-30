/**
 * Tiny async-state helper shared by view models. Avoids repeating
 * `{ loading, error, data, run }` in every hook.
 *
 * This is intentionally minimal — no caching, no SWR, no suspense. The app's
 * data is mostly one-shot actions (login, submit, extract), not live queries.
 * If that changes, swap in a real data library behind this seam.
 */
import { useState, useCallback, useRef } from 'react'
import { apiErrorMessage, type ApiError } from '../http/client'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** The raw ApiError if the last run failed (for code-specific UI), else null. */
  errorRaw: ApiError | null
}

export interface UseAsyncResult<T> extends AsyncState<T> {
  /** Run an async function and track its loading/error/data state. */
  run: (fn: () => Promise<T>) => Promise<T | null>
  /** Reset to idle (clears data + error). */
  reset: () => void
}

export function useAsync<T>(initial: T | null = null): UseAsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: initial,
    loading: false,
    error: null,
    errorRaw: null,
  })
  // Guard against stale updates after unmount / race with a newer run.
  const seqRef = useRef(0)

  const run = useCallback(async (fn: () => Promise<T>): Promise<T | null> => {
    const mySeq = ++seqRef.current
    setState({ data: null, loading: true, error: null, errorRaw: null })
    try {
      const data = await fn()
      if (seqRef.current === mySeq) setState({ data, loading: false, error: null, errorRaw: null })
      return data
    } catch (e) {
      if (seqRef.current === mySeq) {
        const raw = e as ApiError
        const message =
          e && typeof e === 'object' && 'status' in e
            ? apiErrorMessage(e)
            : 'Something went wrong.'
        setState({ data: null, loading: false, error: message, errorRaw: raw })
      }
      return null
    }
  }, [])

  const reset = useCallback(() => {
    seqRef.current++
    setState({ data: initial, loading: false, error: null, errorRaw: null })
  }, [initial])

  return { ...state, run, reset }
}