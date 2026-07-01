import { z } from 'zod'

// Two-stage invoice extraction:
//   Stage A (vision model, e.g. kimi-k2.7): image  → raw verbatim OCR text
//   Stage B (text model, e.g. glm-5.2):     text  → structured JSON
//
// Stage A is PURE OCR — it transcribes the photo verbatim and does NOTHING
// else. Every interpretation decision (field mapping, date math, currency
// normalization, total reconciliation, BRN-vs-TIN disambiguation) lives in
// Stage B. This separation is deliberate and load-bearing:
//   (a) Reasoning models leak chain-of-thought in proportion to how many
//       judgment calls you ask of them. A pure transcription task has no
//       judgment calls, so there's nothing to narrate — the narration leak
//       we saw (7204-char output full of "Should I write SST 8 or 8%?")
//       came from asking Stage A to do Stage B's interpretation job.
//   (b) The cheaper text model is better at structuring; the vision model is
//       only good at reading pixels.
//   (c) The raw transcription is a human-inspectable audit trail
//       (persisted at extractedData._ocrText) for when structuring is wrong.
//
// stripReasoningPreamble() below is defense-in-depth: even with a pure-OCR
// prompt, a reasoning model can still emit a leading "Let me analyze..."
// preamble before the transcription. The filter strips ONLY such a leading
// preamble; it never touches the document body.

export const InvoiceItemSchema = z.object({
  description: z.string().default(''),
  quantity: z.number().default(1),
  unit_price: z.number().default(0),
  discount: z.number().nullable().optional(), // per-line discount AMOUNT, 0 if none
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
      brn: z.string().nullable().optional(), // Business Registration Number (SSM)
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
    })
    .default({}),
  buyer: z
    .object({
      name: z.string().nullable().optional(),
      tin: z.string().nullable().optional(),
      brn: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
    })
    .default({}),
  items: z.array(InvoiceItemSchema).default([]),
  subtotal: z.number().nullable().optional(),
  tax_total: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  amount_in_words: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  bank_detail: z.string().nullable().optional(),
  qr_verification: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Confidence 0..1 across the extraction (model self-report).
  confidence: z.number().nullable().optional(),
})
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>

// ── Stage A: vision transcription (PURE OCR — no interpretation) ──────────
// The vision model transcribes the invoice photo VERBATIM. No field mapping,
// no relabeling, no NOT-PRESENT/ILLEGIBLE decisions, no pipe formatting —
// those are Stage B's job. A pure transcription task minimizes the reasoning
// the model has to do, which is what stops chain-of-thought narration from
// leaking into `content`.
export const VISION_TRANSCRIBE_PROMPT = `You are an invoice OCR engine. Transcribe the invoice photo VERBATIM into plain text — every visible line, value, and label exactly as printed, top to bottom.

OUTPUT RULES (critical):
- Output ONLY the document's own text. No commentary, no analysis, no preface, no summary.
- NEVER write "Let me think", "I should", "The image shows", "Here is", "Now I need to", or any description of what you are doing or why. The entire output must be the transcription itself.
- Preserve the document's own layout as faithfully as one line per visual row allows: line breaks, labels, spacing, and column order exactly as printed.
- Transcribe numbers, currency symbols, and separators EXACTLY as printed (e.g. "RM 2,000.00", "SST 8%", "30/06/2026").
- If a value is visible but unreadable, write [illegible]. Never invent or guess any value.
- Do NOT reformat, relabel, reorder, summarize, or interpret. Do NOT output JSON or field labels of your own. Transcribe only what is literally printed on the page.
- If the photo has multiple pages, transcribe them in order, separated by one blank line.`

export function messagesForTranscription(imageDataUrl: string): import('./llm').ChatMessage[] {
  return [
    { role: 'system', content: VISION_TRANSCRIBE_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Transcribe this invoice verbatim.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ]
}

// ── Post-filter: strip a leading reasoning preamble (defense-in-depth) ────
// The pure-OCR prompt above is the PRIMARY fix for narration leaks. This
// filter is the backstop: if the model still emits a "Let me analyze..." /
// "The image shows..." preamble BEFORE the actual transcription, drop those
// leading lines. It is deliberately CONSERVATIVE:
//   - It strips ONLY a maximal LEADING run of lines that begin with an
//     unmistakable reasoning-opener. The moment a line does not match, it
//     stops — the rest of the document (transcription + any interleaved
//     reasoning) is passed through untouched to Stage B.
//   - It never rewrites or deletes lines in the document body, so a clean
//     transcription is returned unchanged, and legitimate invoice text that
//     happens to follow reasoning phrasing below the first non-matching line
//     is never lost.
// An invoice body essentially never opens with these phrases, so the risk of
// eating real content is negligible; the residual risk (interleaved mid-body
// reasoning) is acceptable and mitigated by reasoningEffort:'low' upstream.
const REASONING_OPENER = new RegExp(
  '^(?:' +
    [
      'the user (?:wants|asked|requested|would like)',
      'let me (?:think|analyze|analyz|look|examine|transcrib|identif|determin|map|parse|read)',
      "i(?:'| a)m going to (?:transcrib|analyz|read)",
      "i(?:'|)?ll (?:transcrib|analyz|look|examine|identif|determin)",
      'i (?:should|need to|ought to|think i|notice that)',
      'here(?: i|\\u2019)s the transcr',
      'below is the transcr',
      'my transcr',
      'now[, ]+i (?:need|will|should)',
      '(?:analyzing|looking at|based on) (?:the image|the document|this (?:image|invoice|photo))',
      'the (?:image|document|photo|invoice) (?:shows|contains|depicts|displays|has)',
      'sure[,!]',
      'of course[,!]',
      'certainly[,!]',
      'alright[,!]',
      'to transcribe',
      'first[, ]+(?:i|let me)',
      'step \\d+',
    ].join('|') +
    ')',
  'i',
)

export function stripReasoningPreamble(text: string): string {
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    // Skip blank lines inside the preamble (a model often blank-separates
    // its reasoning from the transcription), but keep counting so a blank
    // line doesn't terminate the preamble prematurely.
    if (line === '') {
      i++
      continue
    }
    if (REASONING_OPENER.test(line)) {
      i++
      continue
    }
    // First non-blank, non-reasoning line — start of the actual content.
    break
  }
  return lines.slice(i).join('\n').trimStart()
}

// ── Stage B: text structuring (all interpretation lives here) ────────────
// The text model receives the raw verbatim OCR transcription (the document's
// own labels + layout preserved) and emits the final JSON. It does ALL the
// interpretation Stage A refuses to: segmenting columns, mapping document
// labels to fields, date math, currency normalization, total reconciliation,
// and BRN-vs-TIN disambiguation. The shape mirrors docs/flow/flow1.jpeg
// (purchase/expense side) and maps onto the invoices + invoice_items tables.
export const STRUCTURING_SYSTEM_PROMPT = `You are an invoice data-structuring engine. You receive the RAW VERBATIM OCR transcription of an invoice (plain text, with the document's own labels and layout preserved). Segment and classify it into fields and return ONLY a single JSON object — no prose, no markdown fences, no commentary — matching this shape:

{
  "invoice_number": "string|null",
  "issue_date": "YYYY-MM-DD|null",
  "due_date": "YYYY-MM-DD|null",
  "currency": "MYR",
  "seller": { "name": "...", "tin": "...", "brn": "...", "phone": "...", "email": "...", "address": "..." },
  "buyer":  { "name": "...", "tin": "...", "brn": "...", "email": "...", "address": "..." },
  "items": [
    { "description": "...", "quantity": 1, "unit_price": 0, "discount": 0, "tax_rate": 0,
      "payment_method": "Cash|Card|Bank Transfer|Cheque|null", "bank_detail": "string|null" }
  ],
  "subtotal": 0, "tax_total": 0, "total": 0,
  "amount_in_words": "string|null",
  "payment_method": "string|null",
  "bank_detail": "string|null",
  "qr_verification": "string|null",
  "notes": "string|null",
  "confidence": 0.0
}

The OCR text is the document printed verbatim — read its labels and layout to find each field. Invoices vary widely; apply these DYNAMIC FIELD-MAPPING RULES robustly:

DATES
- Malaysian invoices use DD/MM/YYYY. Interpret ambiguous dates as DD/MM/YYYY unless a component is >12 (then it must be the day). Convert to YYYY-MM-DD.
- due_date: use the explicit due date if present. If only "Terms"/"Net"/"Hari" is shown (e.g. "30 Days", "Net 30", "30 Hari"), COMPUTE due_date = issue_date + N days (ISO). If neither, null.

MONEY & TAX
- Strip currency symbols and thousands separators: "RM 2,000.00" → 2000, "$154.06" → 154.06.
- tax_rate is a PERCENT number (6 means 6%, not 0.06). quantity, unit_price, discount, and the totals are plain numbers.
- discount: the per-line discount AMOUNT if a discount column/value is shown for that row; 0 if none.
- tax_total = the actual tax AMOUNT shown (e.g. "GST Amt 9.06" → 9.06). If items are zero-rated (rate shown but amount 0.00), set tax_total = 0 and per-item tax_rate = the stated rate. Never infer a tax amount that is not printed.
- Map total columns: "Sub Total"/"Subtotal" → subtotal; "GST Amount"/"SST"/"Tax Amount" → tax_total; "Total Payable"/"Total Incl. GST"/"Total Amount Due"/"TOTAL" → total. If only one grand total is printed, that is total; set subtotal/tax_total to the stated components if present, else derive (subtotal = total − tax_total).
- Reconciliation: if subtotal + tax_total ≠ total, trust the printed total, keep subtotal/tax_total as printed, and append a note. Lower confidence (e.g. 0.6).

CURRENCY
- Normalize "RM"/"Ringgit Malaysia"/"MYR" → "MYR"; "$"/"USD" → "USD"; otherwise the 3-letter ISO code shown.

LINE ITEMS
- Each table row is one item regardless of column layout (some have No/Description/Qty/Price/Total; others add Discount, Sub Total, GST Amt, etc.). Always produce description + quantity + unit_price. Put per-row tax in tax_rate only if a rate is shown for that row.
- quantity: strip units ("1.00 UNIT" → 1, "2 pcs" → 2). If quantity is absent, default 1.
- unit_price: the per-unit price. If unit_price is missing but amount + quantity are present, derive unit_price = amount / quantity (round to 2 decimals).

SELLER / BUYER
- brn = the company / business registration number. Often printed in parentheses after the company name (e.g. "ABC SDN BHD (202501213322)(82101025-K)"), or labeled "Co. No.", "Company No.", "Reg No.", "SSM No.", "No. Pendaftaran". Prefer the 12-digit SSM form when both old and new are shown (e.g. "202501213322"). Keep the company name in \`name\` WITHOUT the registration code in parentheses.
- tin = the value explicitly labeled "TIN"/"TIN No"/"No. Cukai". Do NOT confuse BRN / SST / company-registration / IC numbers for a TIN.

AMOUNT IN WORDS
- Capture the "amount in words" line verbatim into amount_in_words (e.g. "Ringgit Malaysia: Two Hundred and Fifty Five Only"). null if absent.

ABSENT vs ILLEGIBLE
- A field not on the document, or "[illegible]" / an unreadable value → null. Never invent values.
- Free-text fields with no schema home (delivery-order no., page count, "attention", extra footer notes) → put in notes.

OUTPUT
- ONLY the JSON object. It is parsed by JSON.parse — no markdown fences, no commentary.
- confidence (0..1): your estimate of extraction reliability. Lower it when fields were illegible/absent or totals did not reconcile.`

export function messagesForStructuring(ocrText: string): import('./llm').ChatMessage[] {
  return [
    { role: 'system', content: STRUCTURING_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Verbatim OCR transcription:\n"""\n${ocrText}\n"""`,
    },
  ]
}