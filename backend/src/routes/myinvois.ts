import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { isMock, invalidateToken } from '../lib/myinvois'
import { listSubmissionsForInvoice } from '../repositories/submissionRepo'
import { getProfile } from '../repositories/profileRepo'
import * as submissionService from '../services/invoiceSubmissionService'
import * as authService from '../services/authService'
import { env } from '../env'
import type { AppEnv } from '../types'

export const myinvois = new Hono<AppEnv>()

/**
 * All routes honor MYINVOIS_ENV:
 *   mock    → no network, canned responses (local dev default)
 *   sandbox → preprod-api.myinvois.hasil.gov.my
 *   prod    → api.myinvois.hasil.gov.my
 *
 * Credential model is PER-USER (Login as Taxpayer System): each user pastes
 * their own LHDN client_id/client_secret (see /connection below); the token is
 * fetched with those and cached per user. The env-level client creds are an
 * optional single-tenant fallback.
 *
 * Every response includes the active mode so the frontend can show a banner.
 * (Thrown errors propagate to app.onError → mapDomainError; no try/catch on the
 * simple reads.)
 */

// GET /myinvois/status — which environment + credential mode are active?
myinvois.get('/status', requireAuth, (c) =>
  c.json({
    mode: isMock ? 'mock' : env.MYINVOIS_ENV,
    signing: isMock ? 'not_required' : env.MYINVOIS_CERT_PEM ? 'configured' : 'missing',
    // Which credential flow the frontend should present:
    //   taxpayer     → "Connect LHDN account" (paste the user's own ERP key)
    //   intermediary → "Add Neyobytes as intermediary" (user appoints us by TIN)
    credMode: isMock ? 'taxpayer' : env.MYINVOIS_CRED_MODE,
    // Intermediary mode only: our company's TIN (+ optional ROB) for the user
    // to add in their portal. Omitted in taxpayer mode.
    intermediaryTin: isMock || env.MYINVOIS_CRED_MODE !== 'intermediary' ? null : env.MYINVOIS_INTERMEDIARY_TIN ?? null,
    intermediaryRob: isMock || env.MYINVOIS_CRED_MODE !== 'intermediary' ? null : env.MYINVOIS_INTERMEDIARY_ROB ?? null,
    // The taxpayer profile portal (for login / ERP generation / appointment) +
    // the internal /iapi base (native auto-appoint only). Surfaced so the
    // frontend doesn't hardcode hosts (sandbox vs prod differ).
    portalUrl: env.MYINVOIS_PORTAL_URL,
    iapiBase: env.MYINVOIS_IAPI_BASE,
  }),
)

// ── Connection management (per-user LHDN ERP credentials) ─────────────────
//
// The taxpayer generates an ERP client_id/client_secret pair on the MyInvois
// portal (profile.myinvois.hasil.gov.my → Generate ERP), then pastes it here.
// The secret is AES-256-GCM-encrypted at rest; only client_id + connectedAt
// are ever returned.

// GET /myinvois/connection — is the user linked? (never returns the secret)
myinvois.get('/connection', requireAuth, async (c) => {
  const profile = await getProfile(c.get('user').sub)
  return c.json({
    connected: Boolean(profile?.myinvoisClientId),
    clientId: profile?.myinvoisClientId ?? null,
    connectedAt: profile?.myinvoisConnectedAt ?? null,
  })
})

// PUT /myinvois/connection  { clientId, clientSecret } — store (and encrypt).
myinvois.put('/connection', requireAuth, async (c) => {
  const parsed = z
    .object({
      clientId: z.string().trim().min(1, 'Client ID is required').max(200),
      clientSecret: z.string().min(1, 'Client Secret is required').max(400),
    })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }
  const userId = c.get('user').sub
  await authService.connectMyInvois(userId, parsed.data.clientId, parsed.data.clientSecret)
  // Drop any cached token so the next call re-fetches with the new pair.
  if (!isMock) invalidateToken(userId)
  const profile = await getProfile(userId)
  return c.json({
    connected: true,
    clientId: profile?.myinvoisClientId ?? parsed.data.clientId,
    connectedAt: profile?.myinvoisConnectedAt ?? null,
  })
})

// DELETE /myinvois/connection — clear stored credentials + cached token.
myinvois.delete('/connection', requireAuth, async (c) => {
  const userId = c.get('user').sub
  await authService.disconnectMyInvois(userId)
  if (!isMock) invalidateToken(userId)
  return c.json({ connected: false, clientId: null, connectedAt: null })
})

// POST /myinvois/validate-tin — validate a taxpayer number against LHDN.
//   body: { "tin": "SG1234567890" } → { valid, taxpayerName?, raw }
// In mock mode: format-based heuristic, no network.
myinvois.post('/validate-tin', requireAuth, async (c) => {
  const parsed = z.object({ tin: z.string().min(1).max(20) }).safeParse(
    await c.req.json().catch(() => ({})),
  )
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }
  const result = await submissionService.validateTinString(parsed.data.tin, c.get('user').sub)
  return c.json(result)
})

// POST /myinvois/validate-tin/:customerId — validate a customer's stored TIN
// and cache the result (writes customers.tin_validated_at).
myinvois.post('/validate-tin/:customerId', requireAuth, async (c) => {
  const result = await submissionService.validateCustomerTin(
    c.req.param('customerId'),
    c.get('user').sub,
  )
  return c.json(result)
})

// POST /myinvois/submit/:invoiceId — submit an invoice to LHDN (or mock).
//
// The 201-vs-200 success-status choice (LHDN's 202 accepted → 201) is the
// only deviation from "let onError handle it" — and it's on the SUCCESS path
// (a return value), not in a catch. Submit failures are re-thrown by the
// service AFTER the error audit row is written, so they propagate to
// app.onError normally and the audit trail is preserved. No route try/catch.
myinvois.post('/submit/:invoiceId', requireAuth, async (c) => {
  const result = await submissionService.submitInvoice(
    c.req.param('invoiceId'),
    c.get('user').sub,
  )
  return c.json(result, result.httpStatus === 202 ? 201 : 200)
})

// GET /myinvois/submissions/:invoiceId — audit history for an invoice.
myinvois.get('/submissions/:invoiceId', requireAuth, async (c) => {
  const rows = await listSubmissionsForInvoice(
    c.req.param('invoiceId'),
    c.get('user').sub,
  )
  return c.json({ submissions: rows })
})

// GET /myinvois/document/:uuid — fresh status from LHDN for a submitted doc.
myinvois.get('/document/:uuid', requireAuth, async (c) => {
  const details = await submissionService.getDocumentStatus(
    c.req.param('uuid'),
    c.get('user').sub,
  )
  return c.json(details)
})