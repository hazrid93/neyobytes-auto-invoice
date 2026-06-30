import { z } from 'zod'

// Two-stage invoice extraction:
//   Stage A (vision model, e.g. kimi-k2.7): image  → raw OCR transcription (text)
//   Stage B (text model, e.g. glm-5.2):     text  → structured JSON
//
// Separating the stages (a) lets each model do what it's best at — vision reads
// the photo, the cheaper text model structures it; (b) produces an OCR-text
// audit trail you can inspect when structuring is wrong; (c) activates the
// text model (otherwise dead config behind requireVision). The final JSON
// shape is unchanged from the old single-stage call, so downstream parsing +
// persistence are untouched.

export const InvoiceItemSchema = z.object({
  description: z.string().default(''),
  quantity: z.number().default(1),
  unit_price: z.number().default(0),
  tax_rate: z.number().default(0),
  payment_method: z.string().nullable().optional(),
  bank_detail: z.string().nullable().optional(),
})
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>

export const ExtractedInvoiceSchema = z.object({
  invoice_number: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(), // YYYY-MM-DD if parseable
  due_date: z.string().nullable().optional(),
  currency: z.string().default('MYR'),
  seller: z
    .object({
      name: z.string().nullable().optional(),
      tin: z.string().nullable().optional(), // Tax Identification Number
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
    })
    .default({}),
  buyer: z
    .object({
      name: z.string().nullable().optional(),
      tin: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
    })
    .default({}),
  items: z.array(InvoiceItemSchema).default([]),
  subtotal: z.number().nullable().optional(),
  tax_total: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  bank_detail: z.string().nullable().optional(),
  qr_verification: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Confidence 0..1 across the extraction (model self-report).
  confidence: z.number().nullable().optional(),
})
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>

// ── Stage A: vision transcription ──────────────────────────────────────────
// The vision model reads the invoice photo and produces a plain-text
// transcription of every visible field. This is the audit-trail artifact fed
// to Stage B. It must NOT be JSON — that's Stage B's job — so the two models'
// responsibilities stay clean and the transcription is human-inspectable.
export const VISION_TRANSCRIBE_PROMPT = `You are an invoice OCR engine for Malaysian SME invoices. You receive a photo or scan of an invoice. Transcribe EVERY visible field into plain structured text — not JSON, not markdown, no code fences.

Capture, in this order, one field per line:
- Seller: name, TIN, phone, email, address
- Buyer: name, TIN, email, address (if present)
- Invoice number
- Issue date (transcribe exactly as shown, e.g. DD/MM/YYYY)
- Due date
- Currency
- Line items: one per line as "description | qty | unit price | amount"
- Subtotal
- Tax (SST): rate and amount
- Total
- Payment method
- Bank details
- QR verification string (if present)
- Notes

Rules:
- Be literal and complete. Transcribe numbers EXACTLY as shown, including the currency symbol and thousands separators (e.g. "RM 2,000.00").
- If a field is unreadable, write "ILLEGIBLE" for its value. Never invent or guess a value.
- Output only the transcription text. No commentary, no JSON, no code fences.`

export function messagesForTranscription(imageDataUrl: string): import('./llm').ChatMessage[] {
  return [
    { role: 'system', content: VISION_TRANSCRIBE_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Transcribe this invoice.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ]
}

// ── Stage B: text structuring ─────────────────────────────────────────────
// The text model receives Stage A's OCR transcription and emits the final
// JSON. The shape mirrors docs/flow/flow1.jpeg (purchase/expense side) and
// maps onto the invoices + invoice_items tables.
export const STRUCTURING_SYSTEM_PROMPT = `You are an invoice data-structuring engine for Malaysian SME invoices. You receive the OCR transcription of an invoice (plain text produced by an OCR stage). Extract every field and return ONLY a single JSON object — no prose, no markdown fences, no commentary — matching this shape:

{
  "invoice_number": "string|null",
  "issue_date": "YYYY-MM-DD|null",
  "due_date": "YYYY-MM-DD|null",
  "currency": "MYR",
  "seller": { "name": "...", "tin": "...", "phone": "...", "email": "...", "address": "..." },
  "buyer":  { "name": "...", "tin": "...", "email": "...", "address": "..." },
  "items": [
    { "description": "...", "quantity": 1, "unit_price": 0, "tax_rate": 0,
      "payment_method": "Cash|Card|Bank Transfer|null", "bank_detail": "..." }
  ],
  "subtotal": 0, "tax_total": 0, "total": 0,
  "payment_method": "string|null",
  "bank_detail": "string|null",
  "qr_verification": "string|null",
  "notes": "string|null",
  "confidence": 0.0
}

Rules:
- Quantities and money are NUMBERS (strip currency symbols and thousands separators, e.g. "RM 2,000.00" → 2000).
- Dates are ISO YYYY-MM-DD. Convert "30/06/2026" → "2026-06-30".
- TIN is the Malaysian Tax Identification Number (12 chars). If the OCR says "ILLEGIBLE" or omits it, use null.
- Use null (not omitted) for any field you cannot determine from the OCR text.
- Set confidence to your estimate (0..1) of how reliably the invoice was read.
- Output ONLY the JSON object. It will be parsed by JSON.parse.`

export function messagesForStructuring(ocrText: string): import('./llm').ChatMessage[] {
  return [
    { role: 'system', content: STRUCTURING_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `OCR transcription:\n"""\n${ocrText}\n"""`,
    },
  ]
}