/**
 * Shared client-side DTOs. These mirror the backend's response shapes; they live
 * in `domain/` so both `services/` (which receive them from http) and
 * `viewmodels/` (which map them to view shapes) import from one place.
 *
 * Keep these as TYPE-ONLY mirrors — do not duplicate business logic here.
 * If a transformation is non-trivial, it belongs in a viewmodel.
 */

export interface AuthUser {
  id: string
  email: string
  fullName: string | null
}

export interface AuthResult {
  token: string
  user: AuthUser
}

export interface Profile extends AuthUser {
  companyName: string | null
  tin: string | null
  // Supplier identity fields for the MyInvois Core Fields Validator.
  brn: string | null
  sstNumber: string | null
  ttxNumber: string | null
  msicCode: string | null
  msicDescription: string | null
  contactNumber: string | null
  addressLine1: string | null
  addressLine2: string | null
  addressLine3: string | null
  city: string | null
  postalZone: string | null
  stateCode: string | null
  // Per-user LHDN MyInvois ERP credentials (Login as Taxpayer System).
  // Only the public client_id half + the connection timestamp are surfaced;
  // the secret never leaves the backend.
  myinvoisClientId: string | null
  myinvoisConnectedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InvoiceSummary {
  id: string
  invoiceNumber: string | null
  issueDate: string | null
  total: number
  currency: string
  status: 'draft' | 'submitted' | 'paid' | string
  kind: 'sales' | 'purchase' | string
  createdAt: string
  // Submission audit fields (populated after a successful submit). Shown on
  // the home list so the user sees the LHDN Document ID + QR without opening
  // each invoice.
  myinvoisDocId: string | null // human-readable Document ID (longId)
  qrUrl: string | null // {envbaseurl}/{uuid}/share/{longId} → render as QR
}

/**
 * Full invoice row — what GET /invoices/:id returns. Includes the model's
 * `extractedData` blob (the ExtractedInvoice the OCR pipeline produced) plus
 * the persisted columns the review screen falls back to.
 */
export interface InvoiceDetail {
  id: string
  invoiceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  status: string
  kind: string
  rawImagePath: string | null
  extractedData: ExtractedInvoice | null
  myinvoisDocId: string | null // the human-readable Document ID (longId)
  validationUuid: string | null // the MyInvois document UUID
  qrUrl: string | null // the validation link {base}/{uuid}/share/{longId} → render as QR
  // e-Invoice submission fields (MyInvois Core Fields Validator + flow 2).
  invoiceType: string | null
  issueTime: string | null
  paymentMeansCode: string | null
  paymentAccount: string | null
  createdAt: string
}

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
}

export interface ExtractedInvoice {
  invoice_number: string | null
  issue_date: string | null
  due_date: string | null
  currency: string
  seller: {
    name: string | null
    tin: string | null
    phone: string | null
    email: string | null
    address: string | null
  } | null
  buyer: {
    name: string | null
    tin: string | null
    email: string | null
    address: string | null
  } | null
  items: Array<{
    description: string
    quantity: number
    unit_price: number
    tax_rate: number
    payment_method: string | null
    bank_detail: string | null
    // LHDN line-item code fields (UBL Item/InvoicedQuantity/TaxCategory).
    // Optional — present when the user set them in the review editor; the UBL
    // builder falls back to '06'/'C62'/'000' when absent.
    tax_type_code?: string | null
    unit_code?: string | null
    classification?: string | null
    origin_country?: string | null
    // Per-line discount AMOUNT (Stage B captures it when printed). Preserved
    // through the review round-trip so a captured invoice's discount isn't
    // silently destroyed. Editing it is part of the (cert-gated, blocked)
    // per-line allowance/charge work — kept read-only for now.
    discount?: number | null
  }>
  subtotal: number | null
  tax_total: number | null
  total: number | null
  payment_method: string | null
  bank_detail: string | null
  qr_verification: string | null
  notes: string | null
  confidence: number | null
}

export interface ExtractResult {
  invoiceId: string
  rawImagePath: string | null
  extracted: ExtractedInvoice
  createdAt: string
}

export interface TinValidationResult {
  tin: string
  valid: boolean
  taxpayerName?: string
  raw: Record<string, unknown>
}

/** Per-user LHDN connection state (GET/PUT/DELETE /myinvois/connection). */
export interface MyInvoisConnection {
  connected: boolean
  clientId: string | null
  connectedAt: string | null
}

/** Which credential flow the backend is configured for.
 *  taxpayer     → user pastes their own ERP key (Login as Taxpayer System)
 *  intermediary → user appoints our company by TIN (Login as Intermediary System) */
export type MyInvoisCredMode = 'taxpayer' | 'intermediary'

export interface SubmitResult {
  mode: 'mock' | 'sandbox' | 'prod'
  submissionUid: string
  accepted: boolean
  documentUuid: string | null
  documents: Array<{
    uuid: string
    status: string
    longId?: string
    errorMessage?: string
  }>
  raw: Record<string, unknown>
  httpStatus: number
}