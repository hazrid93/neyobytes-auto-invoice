/**
 * Hono-aware error mapping — the SINGLE edge that turns a thrown domain error
 * into a JSON Response. Imported ONLY by routes (and the global onError
 * fallback); never imported by services or repositories.
 *
 * domain/errors.ts holds the pure error classes with zero Hono dependency;
 * this module is where `Context` enters the picture.
 */
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AppError, ValidationError } from '../domain/errors'

export interface ApiErrorBody {
  error: string
  message: string
  issues?: unknown
}

/**
 * Map a thrown error to a JSON Response. The PRIMARY path is the global
 * `app.onError((err, c) => mapDomainError(c, err))` in index.ts — Hono catches
 * thrown errors from async handlers automatically, so most routes just throw
 * (via services/repos) and never call this directly. It is imported directly
 * ONLY by the two routes with a success-path deviation that onError can't
 * express (extract's {ok:false} payload preservation, submit's 201-vs-200):
 *
 *   try { ... } catch (e) { return mapDomainError(c, e) }   // exception, not default
 */
export function mapDomainError(c: Context, e: unknown): Response {
  if (e instanceof AppError) {
    if (e.status >= 500) console.error(`[${e.code}]`, e.message, e.cause ?? '')
    else console.warn(`[${e.code}]`, e.message)
    const body: ApiErrorBody = { error: e.code, message: e.message }
    if (e instanceof ValidationError && e.issues !== undefined) body.issues = e.issues
    // AppError.status is `number`; Hono's c.json() requires ContentfulStatusCode
    // (a literal union excluding 1xx). At this single Hono edge, import that
    // type rather than hand-rolling a drift-prone union.
    return c.json(body, e.status as ContentfulStatusCode)
  }
  // Unknown throw — shouldn't happen if repos/services obey the contract, but
  // never leak a raw stack to the client.
  console.error('[unhandled]', e)
  return c.json({ error: 'internal_error', message: 'An unexpected error occurred' }, 500)
}