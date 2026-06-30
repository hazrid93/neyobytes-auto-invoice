/**
 * Invoice service — create / list / extract. Maps http responses to domain
 * DTOs; view models consume these and own UI state.
 */
import { request } from '../http/client'
import type { InvoiceSummary, InvoiceDetail, ExtractResult, InvoiceItem } from '../domain/dtos'

export async function listInvoices(): Promise<InvoiceSummary[]> {
  const { invoices } = await request<{ invoices: InvoiceSummary[] }>('/invoices')
  return invoices
}

/** Fetch a single invoice (full row incl. extractedData) for the review screen. */
export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const { invoice } = await request<{ invoice: InvoiceDetail }>(`/invoices/${id}`)
  return invoice
}

export interface CreateInvoiceInput {
  customerId?: string | null
  invoiceNumber?: string
  issueDate?: string
  currency?: string
  items: InvoiceItem[]
}

export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceSummary> {
  const { invoice } = await request<{ invoice: InvoiceSummary }>('/invoices', {
    method: 'POST',
    body: input,
  })
  return invoice
}

/**
 * Upload an invoice image for OCR extraction. Accepts a data: URL (from camera/
 * picker) or an https URL. Returns the draft invoice id + the extracted fields
 * for the review/confirm screen.
 */
export async function extractInvoice(image: string): Promise<ExtractResult> {
  return request<ExtractResult>('/invoices/extract', { method: 'POST', body: { image } })
}