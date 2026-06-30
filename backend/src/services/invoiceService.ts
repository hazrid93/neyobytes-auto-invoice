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
import { log } from '../lib/logger'
import { env } from '../env'
import {
  messagesForTranscription,
  messagesForStructuring,
  type ExtractedInvoice,
} from '../lib/extraction'
import { parseExtracted } from '../lib/extract-parse'
import {
  listInvoicesByUser,
  getInvoiceById,
  updateInvoice as updateInvoiceRepo,
  deleteInvoice as deleteInvoiceRepo,
  createInvoice,
  createDraftFromExtraction,
  type InvoiceSummary,
  type NewInvoiceItem,
  type InvoiceRow,
} from '../repositories/invoiceRepo'
import { computeInvoiceTotals } from '../domain/totals'
import { ValidationError, ExternalError } from '../domain/errors'

// ── list ─────────────────────────────────────────────────────────────────
export async function listInvoices(userId: string): Promise<InvoiceSummary[]> {
  return listInvoicesByUser(userId)
}

// ── get one (full row incl. extractedData) for the review/confirm screen ──
export async function getInvoice(
  invoiceId: string,
  userId: string,
): Promise<InvoiceRow | undefined> {
  return getInvoiceById(invoiceId, userId)
}

// ── update a draft (edit scalar fields + the extractedData blob) ──
export async function updateInvoice(
  invoiceId: string,
  userId: string,
  patch: {
    invoiceNumber?: string | null
    issueDate?: string | null
    dueDate?: string | null
    currency?: string
    subtotal?: number
    taxTotal?: number
    total?: number
    extractedData?: Record<string, unknown> | null
  },
): Promise<InvoiceRow | undefined> {
  return updateInvoiceRepo(invoiceId, userId, patch)
}

// ── delete a draft (cascades items + submissions) ──
export async function deleteInvoice(invoiceId: string, userId: string): Promise<boolean> {
  return deleteInvoiceRepo(invoiceId, userId)
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
  /** Stage A output — the vision model's raw OCR transcription (audit trail). */
  ocrText: string
  extracted: ExtractedInvoice
  createdAt: Date
}
export interface ExtractResultPersistFailed {
  ok: false
  rawImagePath: string | null
  /** Stage A output — the vision model's raw OCR transcription (audit trail). */
  ocrText: string
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
  const imgBytes = imageDataUrl.startsWith('data:')
    ? Math.round((imageDataUrl.split(',')[1]?.length ?? 0) * 0.75)
    : 0
  log.info('extract', 'start', { user: userId.slice(0, 8), img_bytes: imgBytes, raw_stored: rawImagePath != null })

  // 2. Two-stage extraction, sharing one hard 60s deadline (mobile clients
  // can't wait on retries). The deadline aborts BOTH stages cooperatively.
  //
  //   Stage A (vision): image → raw OCR transcription (requireVision:true so
  //     the text model is never asked to read an image).
  //   Stage B (text):   transcription → structured JSON. glm-5.2 is the
  //     PRIMARY (model: LLM_TEXT_MODEL explicit, else chat() defaults to the
  //     vision model); kimi-k2.7 is the fallback (it handles text fine) so a
  //     text-model hiccup doesn't sink the whole extraction.
  const deadline = AbortSignal.timeout(60_000)

  // Stage A — vision transcription.
  let ocrText: string
  const tA = Date.now()
  try {
    const a = await chat({
      messages: messagesForTranscription(imageDataUrl),
      requireVision: true,
      // Vision stage = minimal reasoning ("off"). The gateway's
      // reasoning_effort:"none" is best-effort, so "low" enforces the intent
      // more reliably — transcription is a literal copy task, not a reasoning
      // one, and we want the model to spend tokens on the transcript not CoT.
      reasoningEffort: 'low',
      temperature: 0,
      maxTokens: 2048,
      signal: deadline,
    })
    ocrText = a.content
    log.info('extract', 'stage=A done', {
      ms: Date.now() - tA,
      model: a.model,
      ocr_len: ocrText.length,
      preview: ocrText.slice(0, 160),
    })
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    log.error('extract', 'stage=A failed', { ms: Date.now() - tA, err: msg.slice(0, 200) })
    if (/abort|timeout|deadline/i.test(msg)) {
      throw new ExternalError('llm', 'OCR transcription took too long. Try a smaller image.', 504)
    }
    throw new ExternalError('llm', `OCR transcription failed: ${msg}`, 502)
  }
  if (!ocrText.trim()) {
    log.error('extract', 'stage=A empty', { ms: Date.now() - tA })
    throw new ExternalError('llm', 'OCR transcription returned no text.', 502)
  }

  // Stage B — text structuring.
  let extracted: ExtractedInvoice
  const tB = Date.now()
  try {
    const b = await chat({
      messages: messagesForStructuring(ocrText),
      model: env.LLM_TEXT_MODEL,
      fallbackModel: env.LLM_VISION_MODEL,
      requireVision: false,
      // Text stage = high reasoning. Structuring OCR text into strict JSON
      // (currency/date normalization, null-vs-omit judgement, total
      // reconciliation) benefits from deeper CoT; a generous max_tokens
      // budget lets the model reason then emit `content`.
      reasoningEffort: 'high',
      structured: true,
      temperature: 0,
      maxTokens: 4096,
      signal: deadline,
    })
    extracted = parseExtracted(b.content)
    log.info('extract', 'stage=B done', {
      ms: Date.now() - tB,
      model: b.model,
      items: extracted.items.length,
      subtotal: extracted.subtotal ?? '-',
      tax: extracted.tax_total ?? '-',
      total: extracted.total ?? '-',
      seller: extracted.seller?.name ?? '-',
      inv_no: extracted.invoice_number ?? '-',
    })
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    log.error('extract', 'stage=B failed', { ms: Date.now() - tB, ocr_len: ocrText.length, err: msg.slice(0, 200) })
    if (/abort|timeout|deadline/i.test(msg)) {
      throw new ExternalError('llm', 'Structuring took too long. Try a smaller image.', 504)
    }
    throw new ExternalError('llm', `Structuring failed: ${msg}`, 502)
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
      // Persist the Stage A OCR text alongside the structured JSON so the
      // audit trail survives — inspect extractedData._ocrText if structuring
      // ever disagrees with the photo.
      extractedData: {
        ...(extracted as unknown as Record<string, unknown>),
        _ocrText: ocrText,
      },
    })
    return { ok: true, invoiceId: inv.id, rawImagePath, ocrText, extracted, createdAt: inv.createdAt }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    log.error('extract', 'persist failed', { err: msg.slice(0, 200), items: extracted.items.length, total: extracted.total ?? '-' })
    return { ok: false, rawImagePath, ocrText, extracted, error: msg }
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