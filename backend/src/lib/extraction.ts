import { z } from 'zod'

// The structured shape we ask the vision model to return for an invoice photo.
// Matches the output JSON in docs/flow/flow1.jpeg (purchase/expense side) and
// maps cleanly onto the invoices + invoice_items tables.
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

export const EXTRACTION_SYSTEM_PROMPT = `You are an invoice OCR and data-extraction engine for Malaysian SME invoices.
You receive a photo or scan of an invoice. Extract every visible field and return
ONLY a single JSON object — no prose, no markdown fences, no commentary — matching this shape:

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
- Quantities and money are NUMBERS (no currency symbols, no thousands separators).
- Dates are ISO YYYY-MM-DD. If only DD/MM/YYYY is visible, convert it.
- TIN is the Malaysian Tax Identification Number (12 chars). If unreadable, use null.
- Use null (not omitted) for any field you cannot read on the invoice.
- Set confidence to your estimate (0..1) of how reliably you read the whole invoice.
- Output ONLY the JSON object. It will be parsed by JSON.parse.`

export function messagesForExtraction(imageDataUrl: string): import('./llm').ChatMessage[] {
  return [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract this invoice into the JSON schema.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ]
}
