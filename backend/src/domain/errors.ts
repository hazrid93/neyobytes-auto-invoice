/**
 * Application error model — PURE domain. No Hono, no zod (typed via `unknown`).
 *
 * Boundary contract (the single source of truth for the refactor):
 *   repositories → throw DbUnavailableError | Error            (no HTTP types)
 *   services     → throw typed domain errors below              (no HTTP types)
 *   routes/httpErrors → the ONLY layer that catches; mapDomainError() (called
 *     solely by app.onError in index.ts) → JSON
 *
 * zod input parsing is an HTTP concern and stays in routes. ValidationError
 * carries `issues: unknown` precisely to keep zod out of this module's type
 * graph — do not import zod here. The route's catch-all is responsible for
 * logging + mapping — no try/catch deeper down.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
    public readonly cause?: unknown,
  ) {
    super(message ?? code)
    this.name = 'AppError'
  }
}

// ── typed domain errors services throw ────────────────────────────────────
export class ValidationError extends AppError {
  // zod issues, carried opaquely (zod stays out of the type graph via `unknown`).
  public readonly issues?: unknown
  constructor(message = 'invalid_input', issues?: unknown) {
    super('invalid_input', 400, message)
    this.name = 'ValidationError'
    this.issues = issues
  }
}

export class NotFoundError extends AppError {
  constructor(code = 'not_found', message?: string) {
    super(code, 404, message ?? code)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(code = 'conflict', message?: string) {
    super(code, 409, message ?? code)
    this.name = 'ConflictError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = 'unauthorized', message?: string) {
    super(code, 401, message ?? code)
    this.name = 'UnauthorizedError'
  }
}

export class ExternalError extends AppError {
  constructor(
    public readonly upstream: 'lhdn' | 'llm' | 'supabase' | 'storage' | 'unknown',
    message: string,
    status = 502,
  ) {
    super(`${upstream}_error`, status, message)
    this.name = 'ExternalError'
  }
}

export class SigningNotConfiguredError extends AppError {
  constructor(message = 'Signing cert not configured') {
    super('signing_not_configured', 503, message)
    this.name = 'SigningNotConfiguredError'
  }
}

// The user has not linked their LHDN MyInvois ERP credentials (per-user
// Login-as-Taxpayer-System model). Maps to 409 — the resource state (their
// profile) must change before the action can proceed; tells the frontend to
// route to Connect MyInvois.
export class MyInvoisNotConnectedError extends AppError {
  constructor(message = 'Connect your LHDN MyInvois account in Settings first.') {
    super('myinvois_not_connected', 409, message)
    this.name = 'MyInvoisNotConnectedError'
  }
}

// Thrown by repositories when the pooler isn't configured (db === null) OR
// when a query fails on a connection-class (auth/ENOTFOUND/ECONN…) error.
export class DbUnavailableError extends AppError {
  constructor(message = 'Database is not configured or unreachable') {
    super('database_unavailable', 503, message)
    this.name = 'DbUnavailableError'
  }
}

// ── error classification (pure; repository-facing) ───────────────────────
// Connection-class errors → DbUnavailable (503, actionable). Anything else is a
// genuine query failure → 500. The regex predates this module; kept as the
// single classification point for repository throws.
const CONNECTION_RE = /tenant|ENOTFOUND|ECONN|connect|pooler|password|authentication/i

/** Wrap any raw repository throw into a classified AppError. */
export function classifyDbError(e: unknown, context?: string): AppError {
  const msg = String((e as { message?: string } | undefined)?.message ?? e)
  if (msg.includes('database_not_configured') || CONNECTION_RE.test(msg)) {
    return new DbUnavailableError(
      `Cannot reach Postgres${context ? ` (${context})` : ''}: ${msg}`,
    )
  }
  return new AppError('query_failed', 500, msg, e)
}