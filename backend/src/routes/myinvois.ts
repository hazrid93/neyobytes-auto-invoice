import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { isMock } from '../lib/myinvois'
import { listSubmissionsForInvoice } from '../repositories/submissionRepo'
import * as submissionService from '../services/invoiceSubmissionService'
import { env } from '../env'
import type { AppEnv } from '../types'

export const myinvois = new Hono<AppEnv>()

/**
 * All routes honor MYINVOIS_ENV:
 *   mock    → no network, canned responses (local dev default)
 *   sandbox → preprod-api.myinvois.hasil.gov.my
 *   prod    → api.myinvois.hasil.gov.my
 * Every response includes the active mode so the frontend can show a banner.
 *
 * (Thrown errors propagate to app.onError → mapDomainError; no try/catch on the
 * simple reads.)
 */

// GET /myinvois/status — which environment are we hitting?
myinvois.get('/status', requireAuth, (c) =>
  c.json({
    mode: isMock ? 'mock' : env.MYINVOIS_ENV,
    signing: isMock ? 'not_required' : env.MYINVOIS_CERT_PEM ? 'configured' : 'missing',
  }),
)

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
  const result = await submissionService.validateTinString(parsed.data.tin)
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
  const details = await submissionService.getDocumentStatus(c.req.param('uuid'))
  return c.json(details)
})