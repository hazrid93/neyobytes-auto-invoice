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
  myinvoisDocId: string | null
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