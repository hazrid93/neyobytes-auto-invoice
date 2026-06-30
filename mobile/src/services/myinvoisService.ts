/**
 * MyInvois service — validate-TIN, submit, document status. Honors the
 * backend's MYINVOIS_ENV (mock/sandbox/prod); the active mode is surfaced in
 * responses so the UI can show a banner.
 */
import { request } from '../http/client'
import type { TinValidationResult, SubmitResult } from '../domain/dtos'

export interface MyInvoisStatus {
  mode: 'mock' | 'sandbox' | 'prod'
  signing: 'not_required' | 'configured' | 'missing'
}

export async function getStatus(): Promise<MyInvoisStatus> {
  return request<MyInvoisStatus>('/myinvois/status')
}

export async function validateTin(tin: string): Promise<TinValidationResult> {
  return request<TinValidationResult>('/myinvois/validate-tin', {
    method: 'POST',
    body: { tin },
  })
}

export async function validateCustomerTin(customerId: string): Promise<
  TinValidationResult & { customerId: string; customerName: string }
> {
  return request(`/myinvois/validate-tin/${encodeURIComponent(customerId)}`, {
    method: 'POST',
  })
}

export async function submitInvoice(invoiceId: string): Promise<SubmitResult> {
  return request<SubmitResult>(`/myinvois/submit/${encodeURIComponent(invoiceId)}`, {
    method: 'POST',
  })
}

export interface SubmissionRow {
  id: string
  invoiceId: string
  submissionUid: string | null
  httpStatus: number | null
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'error'
  error: string | null
  createdAt: string
}

export async function listSubmissions(invoiceId: string): Promise<SubmissionRow[]> {
  const { submissions } = await request<{ submissions: SubmissionRow[] }>(
    `/myinvois/submissions/${encodeURIComponent(invoiceId)}`,
  )
  return submissions
}

export interface DocumentDetails {
  uuid: string
  status: 'valid' | 'invalid' | 'submitted' | 'cancelled'
  longId?: string
}

export async function getDocumentDetails(uuid: string): Promise<DocumentDetails> {
  return request<DocumentDetails>(`/myinvois/document/${encodeURIComponent(uuid)}`)
}