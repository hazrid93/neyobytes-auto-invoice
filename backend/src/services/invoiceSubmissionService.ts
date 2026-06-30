/**
 * Invoice submission service — orchestrates submission of an invoice to LHDN
 * (or the mock provider). This is the high-value extraction from the old
 * submit route: 6 steps that previously lived inline as HTTP handlers.
 *
 * Boundary behavior (resolved up front, see advisory notes):
 *   - Standard failures (invoice not found, supplier/customer TIN missing,
 *     signing not configured, db unavailable) → throw AppError (route maps).
 *   - On submitDocument() throwing: write the `status:'error'` audit row HERE
 *     (side-effect must not be lost), then rethrow as ExternalError('lhdn').
 *   - Returns a normal result (incl. LHDN httpStatus) so the route can pick
 *     201-vs-200 — a non-200 success status can't go through onError.
 */
import { env } from '../env'
import {
  NotFoundError,
  ValidationError,
  SigningNotConfiguredError,
  ExternalError,
} from '../domain/errors'
import { loadInvoiceForSubmission, markInvoiceSubmitted } from '../repositories/invoiceRepo'
import { insertSubmission } from '../repositories/submissionRepo'
import {
  buildUbl,
  isMock,
  submitDocument,
  getDocumentDetails,
  validateTin,
  type SubmitDocumentResult,
  type TinValidationResult,
} from '../lib/myinvois'

export interface SubmitResult {
  mode: string
  submissionUid: string
  accepted: boolean
  documentUuid: string | null
  documents: SubmitDocumentResult['documents']
  raw: Record<string, unknown>
  httpStatus: number
}

export async function submitInvoice(invoiceId: string, userId: string): Promise<SubmitResult> {
  // ── 1. Load the full aggregate (invoice + items + customer + supplier) ──
  const agg = await loadInvoiceForSubmission(invoiceId, userId)
  if (!agg) throw new NotFoundError('invoice_not_found')

  const { invoice: inv, items, customer, supplier } = agg

  // ── Supplier & customer TINs are mandatory for LHDN submission ──
  if (!supplier.tin) {
    throw new ValidationError('Set your TIN in your profile first.')
  }
  if (!customer?.tin) {
    throw new ValidationError("Add the buyer's TIN on the Review screen first.")
  }

  const supplierName = supplier.companyName || supplier.fullName || 'Unknown Supplier'
  const customerName = customer.name || 'Unknown Customer'
  const issueDate = inv.issueDate ?? new Date().toISOString().slice(0, 10)
  const invoiceNumber = inv.invoiceNumber ?? `INV-${inv.id.slice(0, 8)}`

  // ── 2. Build + base64-encode the UBL document ──
  // buildUbl sources the monetary aggregates from the stored round-each-step
  // totals (Number(inv.subtotal) etc.) and recomputes per-line LineExtensionAmount
  // independently at emission — see domain/totals.ts docstring. Do NOT feed the
  // stored gross `amount` into the per-line slot.
  const xml = buildUbl({
    invoiceNumber,
    issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    supplier: { tin: supplier.tin, name: supplierName, email: supplier.email ?? null },
    customer: {
      tin: customer.tin,
      name: customerName,
      email: customer.email ?? null,
      address: customer.address ?? null,
    },
    items: items.map((it) => ({
      description: it.description,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      taxRate: Number(it.taxRate),
    })),
    subtotal: Number(inv.subtotal),
    taxTotal: Number(inv.taxTotal),
    total: Number(inv.total),
  })
  const xmlBase64 = Buffer.from(xml, 'utf8').toString('base64')

  // ── 3. (sandbox/prod) signing gate ──
  // The cert is required for real submissions; mock skips it. Signing itself
  // (enveloped XMLDSig) is cert-blocked — see docs/myinvois/RESEARCH.md §6.
  if (!isMock && (!env.MYINVOIS_CERT_PEM || !env.MYINVOIS_KEY_PEM)) {
    throw new SigningNotConfiguredError(
      'MYINVOIS_CERT_PEM/MYINVOIS_KEY_PEM are not set. Real LHDN submission requires a POS Digicert/LHDNM signing cert. Set MYINVOIS_ENV=mock to exercise the flow without it.',
    )
  }
  // TODO(sandbox/prod): enveloped XMLDSig signing with MYINVOIS_CERT_PEM/KEY_PEM.

  // ── 4. Submit (LHDN or mock) ──
  let result: SubmitDocumentResult
  try {
    result = await submitDocument({ invoiceId, invoiceXmlBase64: xmlBase64 }, userId)
  } catch (e) {
    // Audit-on-failure side-effect: write the error row BEFORE rethrowing so the
    // trail is complete even when the route returns 502.
    const msg = String((e as Error)?.message ?? e)
    await insertSubmission({
      invoiceId,
      userId,
      requestBody: { invoiceNumber, xmlBase64Bytes: xmlBase64.length },
      responseBody: { error: msg },
      httpStatus: 502,
      status: 'error',
      error: msg,
    })
    throw new ExternalError('lhdn', msg, 502)
  }

  // ── 5. Audit row (success / rejection) ──
  const accepted = result.documents.some((d) => d.status === 'accepted' || d.status === 'valid')
  const docUuid = result.documents[0]?.uuid ?? null
  await insertSubmission({
    invoiceId,
    userId,
    submissionUid: result.submissionUid,
    requestBody: { invoiceNumber, xmlBase64Bytes: xmlBase64.length },
    responseBody: result.raw,
    httpStatus: result.httpStatus,
    status: accepted ? 'accepted' : 'rejected',
  })

  // ── 6. Update invoice status + LHDN doc id on acceptance ──
  if (accepted) {
    await markInvoiceSubmitted(invoiceId, docUuid)
  }

  return {
    mode: isMock ? 'mock' : env.MYINVOIS_ENV,
    submissionUid: result.submissionUid,
    accepted,
    documentUuid: docUuid,
    documents: result.documents,
    raw: result.raw,
    httpStatus: result.httpStatus,
  }
}

/** Validate a bare TIN string against LHDN (or mock heuristic). */
export async function validateTinString(
  tin: string,
  userId: string,
): Promise<TinValidationResult> {
  try {
    return await validateTin(tin, userId)
  } catch (e) {
    throw new ExternalError('lhdn', String((e as Error)?.message ?? e))
  }
}

/** Validate a customer's stored TIN and cache the result on the customer row. */
export async function validateCustomerTin(
  customerId: string,
  userId: string,
): Promise<TinValidationResult & { customerId: string; customerName: string }> {
  // Local import to keep the service's static deps lean; this path is the only
  // one that touches the customer repo.
  const { findCustomerForUser, markTinValidated } = await import('../repositories/customerRepo')
  const customer = await findCustomerForUser(customerId, userId)
  if (!customer) throw new NotFoundError('customer_not_found')
  if (!customer.tin) throw new ValidationError('customer_has_no_tin')

  const result = await validateTinString(customer.tin, userId)
  if (result.valid) await markTinValidated(customerId)
  return { ...result, customerId, customerName: customer.name }
}

/** Fresh document status from LHDN (or mock) for a submitted doc uuid. */
export async function getDocumentStatus(uuid: string, userId: string) {
  try {
    return await getDocumentDetails(uuid, userId)
  } catch (e) {
    throw new ExternalError('lhdn', String((e as Error)?.message ?? e))
  }
}