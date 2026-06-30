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
export const VISION_TRANSCRIBE_PROMPT = `You are an invoice OCR engine. Transcribe every visible field of the invoice photo into plain structured text.

OUTPUT RULES (critical):
- Output ONLY the field lines below. Begin with "Seller name:" on the first line.
- Do NOT narrate your reasoning. Do NOT write "Let me think", "I should", "Hmm", "Wait", "The user wants me to", or any commentary about your process. Deliberate silently; the output is ONLY the transcription lines.
- One field per line, using the exact label prefix shown. Repeat the "Item:" prefix once per line item.
- NOT PRESENT = the field is not on the document. ILLEGIBLE = visible but cannot be read. Never invent or guess a value.

Fields (in this order):
Seller name:
Seller TIN:
Seller phone:
Seller email:
Seller address:
Buyer name:
Buyer TIN:
Buyer email:
Buyer address:
Invoice number:
Issue date:  (transcribe exactly as shown, e.g. DD/MM/YYYY)
Due date:
Terms:  (e.g. "30 Days", "Net 30", "30 Hari" — if shown)
Currency:
Item: description | qty | unit price | amount   (one line per item)
Subtotal:
Tax:  (rate and amount, e.g. "GST 6% | 0.00")
Total:
Payment method:
Bank details:
QR verification:
Notes:
Amount in words:  (if shown)

Transcribe numbers EXACTLY as shown, including currency symbols and thousands separators (e.g. "RM 2,000.00").

Example output — follow this format exactly, only the lines, nothing else:
Seller name: East Repair Inc.
Seller TIN: NOT PRESENT
Seller phone: NOT PRESENT
Seller email: NOT PRESENT
Seller address: 1912 Harvest Lane, New York, NY 12210
Buyer name: John Smith
Buyer TIN: NOT PRESENT
Buyer email: NOT PRESENT
Buyer address: 2 Court Square, New York, NY 12210
Invoice number: US-001
Issue date: 11/02/2019
Due date: 26/02/2019
Terms: NOT PRESENT
Currency: USD
Item: Front and rear brake cables | 1 | 100.00 | 100.00
Item: New set of pedal arms | 2 | 15.00 | 30.00
Item: Labor 3hrs | 3 | 5.00 | 15.00
Subtotal: 145.00
Tax: Sales Tax 6.25% | 9.06
Total: 154.06
Payment method: NOT PRESENT
Bank details: NOT PRESENT
QR verification: NOT PRESENT
Notes: Payment is due within 15 days.
Amount in words: NOT PRESENT`

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
export const STRUCTURING_SYSTEM_PROMPT = `You are an invoice data-structuring engine. You receive the OCR transcription of an invoice (plain text). Extract every field and return ONLY a single JSON object — no prose, no markdown fences, no commentary — matching this shape:

{
  "invoice_number": "string|null",
  "issue_date": "YYYY-MM-DD|null",
  "due_date": "YYYY-MM-DD|null",
  "currency": "MYR",
  "seller": { "name": "...", "tin": "...", "phone": "...", "email": "...", "address": "..." },
  "buyer":  { "name": "...", "tin": "...", "email": "...", "address": "..." },
  "items": [
    { "description": "...", "quantity": 1, "unit_price": 0, "tax_rate": 0,
      "payment_method": "Cash|Card|Bank Transfer|Cheque|null", "bank_detail": "string|null" }
  ],
  "subtotal": 0, "tax_total": 0, "total": 0,
  "payment_method": "string|null",
  "bank_detail": "string|null",
  "qr_verification": "string|null",
  "notes": "string|null",
  "confidence": 0.0
}

Invoices vary widely in layout and labels. Apply these DYNAMIC FIELD-MAPPING RULES robustly:

DATES
- Malaysian invoices use DD/MM/YYYY. Interpret ambiguous dates as DD/MM/YYYY unless a component is >12 (then it must be the day). Convert to YYYY-MM-DD.
- due_date: use the explicit due date if present. If only "Terms"/"Net"/"Hari" is shown (e.g. "30 Days", "Net 30", "30 Hari"), COMPUTE due_date = issue_date + N days (ISO). If neither, null.

MONEY & TAX
- Strip currency symbols and thousands separators: "RM 2,000.00" → 2000, "$154.06" → 154.06.
- tax_rate is a PERCENT number (6 means 6%, not 0.06). quantity, unit_price, and the totals are plain numbers.
- tax_total = the actual tax AMOUNT shown (e.g. "GST Amt 9.06" → 9.06). If items are zero-rated (rate shown but amount 0.00), set tax_total = 0 and per-item tax_rate = the stated rate. Never infer a tax amount that is not printed.
- Map total columns: "Sub Total"/"Subtotal" → subtotal; "GST Amount"/"SST"/"Tax Amount" → tax_total; "Total Payable"/"Total Incl. GST"/"Total Amount Due"/"TOTAL" → total. If only one grand total is printed, that is total; set subtotal/tax_total to the stated components if present, else derive (subtotal = total − tax_total).
- Reconciliation: if subtotal + tax_total ≠ total, trust the printed total, keep subtotal/tax_total as printed, and append a note. Lower confidence (e.g. 0.6).

CURRENCY
- Normalize "RM"/"Ringgit Malaysia"/"MYR" → "MYR"; "$"/"USD" → "USD"; otherwise the 3-letter ISO code shown.

LINE ITEMS
- quantity: strip units ("1.00 UNIT" → 1, "2 pcs" → 2). If quantity is absent, default 1.
- unit_price: the per-unit price. If unit_price is missing but amount + quantity are present, derive unit_price = amount / quantity (round to 2 decimals).
- Each table row is one item regardless of column layout (some have No/Description/Qty/Price/Total; others add Discount, Sub Total, GST Amt, etc.). Always produce description + quantity + unit_price. Put per-row tax in tax_rate only if a rate is shown for that row.

SELLER / BUYER
- Keep the name clean: drop trailing company-registration codes in parentheses (e.g. "(502590121322025-K)") — move them to notes.
- TIN = the value explicitly labeled "TIN"/"TIN No". Do not confuse SST/registration/IC numbers for a TIN.

ABSENT vs ILLEGIBLE
- "NOT PRESENT" or a blank value → null. "ILLEGIBLE" → null (optionally mention in notes). Never invent values.
- Fields with no schema home (amount in words, company registration no., delivery-order no., page count) → put in notes.

OUTPUT
- ONLY the JSON object. It is parsed by JSON.parse — no markdown fences, no commentary.
- confidence (0..1): your estimate of extraction reliability. Lower it when fields were illegible/absent or totals did not reconcile.`

export function messagesForStructuring(ocrText: string): import('./llm').ChatMessage[] {
  return [
    { role: 'system', content: STRUCTURING_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `OCR transcription:\n"""\n${ocrText}\n"""`,
    },
  ]
}