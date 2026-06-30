/**
 * Invoice service — list / create / extract.
 *
 * `list` and `create` are thin (read/write through the repo); they earn a
 * service home because the create path normalizes items + computes round-each-
 * step totals via the domain helper (not something a route should own).
 *
 * `extract` orchestrates two external clients (Supabase Storage + the LLM
 * gateway) plus the draft-insert repo, and returns a DISCRIMINATED result so a
 * DB persist failure after a successful OCR does NOT lose the model's output —
 * the route converts `{ ok: false, extracted }` into a 500 *with* the payload,
 * matching the old route's fallthrough behavior. This case deliberately does
 * NOT throw AppError (onError would return a bare error and drop `extracted`).
 */
import { supabase } from '../lib/supabase'
import { chat } from '../lib/llm'
import { messagesForExtraction, type ExtractedInvoice } from '../lib/extraction'
import { parseExtracted } from '../lib/extract-parse'
import {
  listInvoicesByUser,
  createInvoice,
  createDraftFromExtraction,
  type InvoiceSummary,
  type NewInvoiceItem,
} from '../repositories/invoiceRepo'
import { computeInvoiceTotals } from '../domain/totals'
import { ValidationError, ExternalError } from '../domain/errors'

// ── list ─────────────────────────────────────────────────────────────────
export async function listInvoices(userId: string): Promise<InvoiceSummary[]> {
  return listInvoicesByUser(userId)
}

// ── create ───────────────────────────────────────────────────────────────
export interface CreateItemInput {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
}

export interface CreateInvoiceInput {
  userId: string
  customerId: string | null
  invoiceNumber?: string
  issueDate?: string
  currency?: string
  items: CreateItemInput[]
}

export type CreatedInvoice = Awaited<ReturnType<typeof createInvoice>>

export async function createDraftInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  // Round-each-step totals (convention 1 from domain/totals.ts) — line gross
  // → subtotal/taxTotal/total all toFixed(2) progressively. Matches what the
  // money columns store so the dashboard and per-line amounts agree.
  const totals = computeInvoiceTotals(input.items)

  const items: NewInvoiceItem[] = input.items.map((it, i) => ({
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    taxRate: it.taxRate,
    amount: totals.lineAmounts[i], // gross (tax-inclusive), round2
    sortOrder: i,
  }))

  return createInvoice({
    userId: input.userId,
    customerId: input.customerId,
    invoiceNumber: input.invoiceNumber ?? null,
    issueDate: input.issueDate ?? null,
    currency: input.currency ?? 'MYR',
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    status: 'draft',
    kind: 'sales',
    items,
  })
}

// ── extract ──────────────────────────────────────────────────────────────
export interface ExtractResultOk {
  ok: true
  invoiceId: string
  rawImagePath: string | null
  extracted: ExtractedInvoice
  createdAt: Date
}
export interface ExtractResultPersistFailed {
  ok: false
  rawImagePath: string | null
  extracted: ExtractedInvoice
  error: string
}
export type ExtractResult = ExtractResultOk | ExtractResultPersistFailed

/**
 * Upload the image (best-effort), run OCR via the vision model (60s deadline),
 * then persist as a draft. On persist failure, return the extracted payload
 * anyway via a discriminated `{ ok: false }` so the caller can surface it.
 *
 * Throws ValidationError for non-data:/non-http images (route maps to 400) and
 * ExternalError('llm') on extraction timeout/failure (route maps to 504/502).
 */
export async function extractInvoice(
  imageDataUrl: string,
  userId: string,
): Promise<ExtractResult> {
  if (!imageDataUrl.startsWith('data:') && !imageDataUrl.startsWith('http')) {
    throw new ValidationError('image must be a data: URL or an https: URL')
  }

  // 1. Best-effort raw image storage. Proceeds even if storage is down.
  const rawImagePath = await storeRawImage(imageDataUrl, userId)

  // 2. OCR via the vision model with a hard 60s deadline (mobile clients can't
  // wait on the model's retries). AbortSignal.timeout() collaborate-aborts the
  // inner fetch per attempt and stops the retry loop cleanly.
  const deadline = AbortSignal.timeout(60_000)
  let extracted: ExtractedInvoice
  try {
    const r = await chat({
      messages: messagesForExtraction(imageDataUrl),
      // model omitted on purpose: chat() defaults to env.LLM_VISION_MODEL,
      // which is the single validated source for the vision model.
      requireVision: true,
      structured: true,
      temperature: 0,
      maxTokens: 4096,
      signal: deadline,
    })
    extracted = parseExtracted(r.content)
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    if (/abort|timeout|deadline/i.test(msg)) {
      throw new ExternalError('llm', 'Extraction took too long. Try a smaller image.', 504)
    }
    throw new ExternalError('llm', msg, 502)
  }

  // 3. Persist as a draft. Totals come from the model; the confirm step
  // recomputes from items anyway. On DB failure → { ok: false, extracted }
  // so the user doesn't lose the model's output.
  const subtotal = extracted.subtotal ?? 0
  const taxTotal = extracted.tax_total ?? 0
  const total = extracted.total ?? Number((subtotal + taxTotal).toFixed(2))
  try {
    const inv = await createDraftFromExtraction({
      userId,
      invoiceNumber: extracted.invoice_number ?? null,
      issueDate: extracted.issue_date ?? null,
      dueDate: extracted.due_date ?? null,
      currency: extracted.currency,
      subtotal,
      taxTotal,
      total,
      kind: 'purchase', // expense-side upload per docs/flow/flow1.jpeg
      rawImagePath,
      extractedData: extracted as unknown as Record<string, unknown>,
    })
    return { ok: true, invoiceId: inv.id, rawImagePath, extracted, createdAt: inv.createdAt }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    return { ok: false, rawImagePath, extracted, error: msg }
  }
}

// Best-effort upload of a data: URL to the private invoice-images bucket.
// Returns the storage path, or null if the upload was skipped/failed.
async function storeRawImage(imageDataUrl: string, userId: string): Promise<string | null> {
  if (!imageDataUrl.startsWith('data:')) return null
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!match) return null
  const mime = match[1]
  const buf = Buffer.from(match[2], 'base64')
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('invoice-images')
    .upload(path, buf, { contentType: mime, upsert: false })
  if (upErr) {
    console.warn('[storage] upload skipped:', upErr.message)
    return null
  }
  return path
}