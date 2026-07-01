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
  AppError,
  NotFoundError,
  ValidationError,
  SigningNotConfiguredError,
  ExternalError,
} from '../domain/errors'
import { loadInvoiceForSubmission, markInvoiceSubmitted } from '../repositories/invoiceRepo'
import { insertSubmission } from '../repositories/submissionRepo'
import {
  isMock,
  submitDocument,
  getDocumentDetails,
  validateTin,
  type SubmitDocumentResult,
  type TinValidationResult,
} from '../lib/myinvois'
import { buildUblJson } from '../lib/ublJson'
import {
  transformDocument,
  documentDigest,
  assembleSignedDocument,
  SigningTargetUnverifiedError,
} from '../lib/signing'

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

  // ── 2. Build the UBL document (JSON variant) ──
  // The submit path uses the JSON UBL variant + format:"JSON" because the only
  // LHDN signing documentation (signature-creation-json.md + the PDF "Securing
  // JSON Files with Digital Signatures") operates on JSON; on XML the signing
  // mechanism is undocumented. buildUblJson mirrors docs/myinvois/invoice-v1.1-
  // sample.json. The old XML builder (buildUbl) is retired from the submit path.
  const documentJson = buildUblJson({
    invoiceNumber,
    issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    supplier: { tin: supplier.tin, brn: supplier.brn ?? null, name: supplierName, email: supplier.email ?? null },
    customer: {
      tin: customer.tin,
      brn: customer.brn ?? null,
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

  // ── 3. (sandbox/prod) sign the document + compute documentHash ──
  // Two gates, both honest about what's unverified (see docs/myinvois/
  // RESEARCH.md §6 + TESTING-FLOWS.md §4):
  //   a) cert procurement  — MYINVOIS_CERT_PEM/KEY_PEM must be set (POS Digicert).
  //   b) signing target     — SignatureValue signs the bare doc digest (prose) OR
  //      c14n(SignedInfo) (standard XAdES); LHDN accepts exactly one. This is
  //      UNVERIFIED until a real round-trip, so we DO NOT ship a guessed default:
  //      assembleSignedDocument throws SigningTargetUnverifiedError unless
  //      MYINVOIS_SIGN_TARGET is explicitly set (operator opts in after a
  //      round-trip). The deterministic steps (1,2,4,5,6) + documentHash are
  //      cert-independent and unit-tested (scripts/verify-signing.ts).
  let documentBase64: string
  let documentHash: string
  if (isMock) {
    // Mock: submit as-is (no signing). documentHash is the real Step-2 digest
    // of the transformed (stripped+minified) doc so the audit body is realistic.
    const transformed = transformDocument(documentJson)
    documentBase64 = Buffer.from(documentJson, 'utf8').toString('base64')
    documentHash = documentDigest(transformed)
  } else {
    if (!env.MYINVOIS_CERT_PEM || !env.MYINVOIS_KEY_PEM) {
      throw new SigningNotConfiguredError(
        'MYINVOIS_CERT_PEM/MYINVOIS_KEY_PEM are not set. Real LHDN submission requires a POS Digicert/LHDNM signing cert. Set MYINVOIS_ENV=mock to exercise the flow without it.',
      )
    }
    const signTarget = env.MYINVOIS_SIGN_TARGET
    if (signTarget !== 'docdigest' && signTarget !== 'signedinfo') {
      throw new SigningTargetUnverifiedError(
        'MYINVOIS_SIGN_TARGET is not set. The LHDN signing target (bare doc digest vs c14n(SignedInfo)) is unverified until a real round-trip — see docs/myinvois/TESTING-FLOWS.md §4b. Set MYINVOIS_SIGN_TARGET=docdigest (prose) or =signedinfo (standard XAdES) once confirmed.',
      )
    }
    const signedJson = assembleSignedDocument({
      config: { certPem: env.MYINVOIS_CERT_PEM!, keyPem: env.MYINVOIS_KEY_PEM! },
      documentJson,
      signingTime: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      signTarget,
    })
    // documentHash = Step-2 digest of the TRANSFORMED (stripped+minified) doc.
    // NB: the exact minified byte serialization is itself unverified against
    // LHDN for arbitrary invoices (see RESEARCH.md §6 / verify-signature.py);
    // this is the deterministic candidate. If LHDN rejects the hash, the
    // minification is the next thing to reverse-engineer (TESTING-FLOWS §4c4).
    documentBase64 = Buffer.from(signedJson, 'utf8').toString('base64')
    documentHash = documentDigest(transformDocument(signedJson))
  }

  // ── 4. Submit (LHDN or mock) ──
  let result: SubmitDocumentResult
  try {
    result = await submitDocument({ invoiceId, documentBase64, documentHash }, userId)
  } catch (e) {
    // A friendly AppError (e.g. MyInvoisNotConnectedError 409, or the signing
    // gate above) means NO LHDN call was made — rethrow it as-is so the route
    // returns its real status/code, and skip the audit row (nothing was sent).
    if (e instanceof AppError) throw e
    // Otherwise this is a MyInvoisError — a real LHDN call failed. Audit the
    // failure BEFORE rethrowing so the trail is complete even on 502.
    const msg = String((e as Error)?.message ?? e)
    await insertSubmission({
      invoiceId,
      userId,
      requestBody: { invoiceNumber, documentBytes: documentBase64.length },
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
    requestBody: { invoiceNumber, documentBytes: documentBase64.length },
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
    // Preserve friendly AppErrors (e.g. MyInvoisNotConnectedError 409); only
    // wrap genuine LHDN/network failures (MyInvoisError) as 502.
    if (e instanceof AppError) throw e
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
    if (e instanceof AppError) throw e
    throw new ExternalError('lhdn', String((e as Error)?.message ?? e))
  }
}