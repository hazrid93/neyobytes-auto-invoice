/**
 * Public (unauthenticated) e-invoice lookup — the flow-1 customer retrieval
 * loop. A customer who received an invoice scans the QR (or enters the
 * Document ID) and retrieves a public-facing view to verify it.
 *
 * The lookup is by the human-readable Document ID (longId, stored as
 * invoices.myinvois_doc_id) or the MyInvois validation UUID. Only submitted
 * (accepted) invoices are returned; raw extractedData + internal user ids are
 * never exposed — only the public-facing invoice view (supplier name/TIN/SSM,
 * buyer name/TIN, items, totals, Document ID, validation UUID, QR link).
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { findPublicInvoice } from '../repositories/invoiceRepo'
import { renderReceiptHtml } from '../lib/receipt'
import type { AppEnv } from '../types'

export const publicRoutes = new Hono<AppEnv>()

// GET /public/invoices/:ref — public lookup by Document ID (longId) or UUID.
// 200 → { invoice: PublicInvoiceView }; 404 if not found / not yet submitted.
publicRoutes.get('/invoices/:ref', async (c) => {
  const ref = c.req.param('ref').trim()
  if (!ref) return c.json({ error: 'invalid_input', message: 'reference is required' }, 400)
  const invoice = await findPublicInvoice(ref)
  if (!invoice) return c.json({ error: 'not_found', message: 'no submitted invoice matches that Document ID or UUID' }, 404)
  return c.json({ invoice })
})

// POST /public/invoices/qr — decode a scanned QR payload. The QR encodes the
// validation link {base}/{uuid}/share/{longId}; we accept the full link OR the
// raw uuid/longId fragment and resolve to the public invoice. This mirrors the
// LHDN Taxpayer's QR Code API's spirit (decode → lookup) but operates on OUR
// stored data (no authenticated LHDN call needed for a customer verify).
const qrSchema = z.object({ qr: z.string().min(1) })
publicRoutes.post('/invoices/qr', async (c) => {
  const parsed = qrSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  let ref = parsed.data.qr.trim()
  // If the payload is a full validation link, extract the uuid (segment after
  // the host) and fall back to the longId segment.
  try {
    if (ref.startsWith('http')) {
      const u = new URL(ref)
      const seg = u.pathname.split('/').filter(Boolean) // [uuid, 'share', longId]
      if (seg.length >= 1) ref = seg[0]
    }
  } catch {
    // not a URL — use the raw payload as the ref
  }
  const invoice = await findPublicInvoice(ref)
  if (!invoice) return c.json({ error: 'not_found', message: 'no submitted invoice matches that QR' }, 404)
  return c.json({ invoice })
})

// GET /public/invoices/:ref/receipt — the customer's printable verify view (the
// flow-1 OUTPUT a customer retrieves by scanning the QR / entering the
// Document ID). Same HTML receipt, unauthenticated, built from the public view.
publicRoutes.get('/invoices/:ref/receipt', async (c) => {
  const ref = c.req.param('ref').trim()
  if (!ref) return c.json({ error: 'invalid_input', message: 'reference is required' }, 400)
  const invoice = await findPublicInvoice(ref)
  if (!invoice) return c.json({ error: 'not_found', message: 'no submitted invoice matches that Document ID or UUID' }, 404)
  const html = await renderReceiptHtml(invoice)
  return c.html(html)
})