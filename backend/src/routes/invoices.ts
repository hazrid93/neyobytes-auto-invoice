import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import * as invoiceService from '../services/invoiceService'
import type { AppEnv } from '../types'

export const invoices = new Hono<AppEnv>()

const itemSchema = z.object({
  description: z.string(),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  taxRate: z.number().default(0),
})

// GET /invoices — list the current user's invoices (newest first).
// (Thrown errors propagate to app.onError → mapDomainError; no try/catch here.)
invoices.get('/', requireAuth, async (c) => {
  const rows = await invoiceService.listInvoices(c.get('user').sub)
  return c.json({ invoices: rows })
})

// GET /invoices/:id — full invoice (including extractedData) for the review/
// confirm screen. UUID-validated so GET /invoices/extract (if ever issued) is
// a clean 400, not a 404 masquerading as "not found".
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
invoices.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  if (!UUID.test(id)) {
    return c.json({ error: 'invalid_input', message: 'invoice id must be a uuid' }, 400)
  }
  const invoice = await invoiceService.getInvoice(id, c.get('user').sub)
  if (!invoice) return c.json({ error: 'not_found', message: 'invoice not found' }, 404)
  return c.json({ invoice })
})

// PATCH /invoices/:id — edit a draft. Accepts a partial of the scalar columns
// plus an optional `extractedData` blob (the review screen sends the full
// edited object). Only provided keys are written.
const patchSchema = z.object({
  invoiceNumber: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  currency: z.string().optional(),
  subtotal: z.number().optional(),
  taxTotal: z.number().optional(),
  total: z.number().optional(),
  extractedData: z.record(z.string(), z.unknown()).optional(),
  // e-Invoice submission fields (MyInvois Core Fields Validator + flow 2):
  invoiceType: z.string().max(2).nullable().optional(), // 01-04, 11-14
  issueTime: z.string().nullable().optional(), // UTC HH:MM:SSZ
  paymentMeansCode: z.string().max(2).nullable().optional(), // 01-08
  paymentAccount: z.string().max(150).nullable().optional(), // bank account no
})
invoices.patch('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  if (!UUID.test(id)) {
    return c.json({ error: 'invalid_input', message: 'invoice id must be a uuid' }, 400)
  }
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }
  const invoice = await invoiceService.updateInvoice(id, c.get('user').sub, parsed.data)
  if (!invoice) return c.json({ error: 'not_found', message: 'invoice not found' }, 404)
  return c.json({ invoice })
})

// DELETE /invoices/:id — delete a draft (cascades to invoice_items +
// myinvois_submissions via FK onDelete: 'cascade'). Returns 200 on success.
invoices.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  if (!UUID.test(id)) {
    return c.json({ error: 'invalid_input', message: 'invoice id must be a uuid' }, 400)
  }
  const ok = await invoiceService.deleteInvoice(id, c.get('user').sub)
  if (!ok) return c.json({ error: 'not_found', message: 'invoice not found' }, 404)
  return c.json({ ok: true })
})

// POST /invoices — create a draft invoice (atomic: invoice + items in one tx).
invoices.post('/', requireAuth, async (c) => {
  const parsed = z
    .object({
      customerId: z.string().uuid().nullable().optional(),
      invoiceNumber: z.string().optional(),
      issueDate: z.string().optional(),
      currency: z.string().default('MYR'),
      items: z.array(itemSchema).default([]),
    })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }

  const invoice = await invoiceService.createDraftInvoice({
    userId: c.get('user').sub,
    customerId: parsed.data.customerId ?? null,
    invoiceNumber: parsed.data.invoiceNumber,
    issueDate: parsed.data.issueDate,
    currency: parsed.data.currency,
    items: parsed.data.items,
  })
  return c.json({ invoice }, 201)
})

// POST /invoices/extract — upload an invoice image, OCR it via the vision model,
// return a pre-filled invoice for the user to confirm.
//
// Body: { "image": "data:image/jpeg;base64,..." } OR { "image": "https://..." }
// The image is stored privately in Supabase Storage (invoice-images/<userId>/<uuid>)
// and the extracted JSON is persisted to invoices.extracted_data as a draft.
//
// NOTE the local try/catch: extractInvoice returns a discriminated
// `{ ok: false, extracted }` when OCR succeeded but the DB persist failed, so we
// can surface the LLM payload to the user instead of losing it. This is the
// explicit exception to the "let onError handle it" rule.
invoices.post('/extract', requireAuth, async (c) => {
  const parsed = z.object({ image: z.string().min(1) }).safeParse(
    await c.req.json().catch(() => ({})),
  )
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }

  const result = await invoiceService.extractInvoice(parsed.data.image, c.get('user').sub)
  // Discriminated result: OCR success → 201; OCR succeeded but DB persist
  // failed → 500 WITH the extracted payload (preserving the model's output).
  // OCR-itself failures are thrown as ExternalError('llm') and propagate to
  // app.onError → mapDomainError — no route-level catch needed for that path.
  if (result.ok) {
    return c.json(
      {
        invoiceId: result.invoiceId,
        rawImagePath: result.rawImagePath,
        ocrText: result.ocrText,
        extracted: result.extracted,
        createdAt: result.createdAt,
      },
      201,
    )
  }
  return c.json(
    {
      error: 'persist_failed',
      message: result.error,
      ocrText: result.ocrText,
      extracted: result.extracted,
      rawImagePath: result.rawImagePath,
    },
    500,
  )
})