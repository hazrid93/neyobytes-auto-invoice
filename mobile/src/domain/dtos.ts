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
  items: Array<{
    description: string
    quantity: number
    unit_price: number
    tax_rate: number
  }>
  subtotal: number | null
  tax_total: number | null
  total: number | null
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