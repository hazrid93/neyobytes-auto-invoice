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