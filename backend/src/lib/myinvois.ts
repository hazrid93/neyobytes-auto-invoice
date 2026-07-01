import { env } from '../env'
import { getMyInvoisCredentials, getTaxpayerTin } from '../repositories/profileRepo'
import { MyInvoisNotConnectedError, ValidationError } from '../domain/errors'

/**
 * LHDN MyInvois e-Invoicing client.
 *
 * Two operating modes, selected by MYINVOIS_ENV:
 *   - 'mock'    : no network — every call returns a deterministic canned response.
 *                 Use this for local dev & CI. Requires NO client creds, NO cert.
 *   - 'sandbox' : preprod-api.myinvois.hasil.gov.my (client creds required).
 *   - 'prod'    : api.myinvois.hasil.gov.my (client creds + prod cert required).
 *
 * The real submit path (sandbox/prod) requires XML signing with a cert issued
 * under LHDNM's Sub CA via POS Digicert — see docs/myinvois/RESEARCH.md §6.
 * That cert is not yet in hand; mock mode lets the whole product flow
 * (capture → review → submit → status) be exercised without it.
 *
 * Every public function is `async` and resolves to the same shape in both
 * modes, so routes don't branch on MYINVOIS_ENV.
 */

export const isMock = env.MYINVOIS_ENV === 'mock'

// ─── LHDN API base URLs ────────────────────────────────────────────────────
const HOSTS = {
  sandbox: 'preprod-api.myinvois.hasil.gov.my',
  prod: 'api.myinvois.hasil.gov.my',
} as const

function host(): string {
  return HOSTS[env.MYINVOIS_ENV as 'sandbox' | 'prod']
}

// ─── Token cache (sandbox/prod only) ───────────────────────────────────────
interface TokenCache {
  access_token: string
  expires_at: number // epoch ms
}
// Per-user/per-taxpayer token cache. The key depends on the credential mode:
//   - taxpayer mode: the userId (creds come from that user's stored pair)
//   - intermediary mode: `interm:<taxpayerTIN>` (creds come from the env-level
//     platform pair, but the token is scoped per taxpayer via onbehalfof).
// '__global__' is the optional single-tenant fallback in taxpayer mode. Mock
// mode never touches this map.
const tokenCache = new Map<string, TokenCache>()

// Sentinel key for the env-level fallback credential pair (taxpayer mode).
const GLOBAL_KEY = '__global__'

/** The credential mode the backend is configured for (see env.ts). */
export const credMode = env.MYINVOIS_CRED_MODE // 'taxpayer' | 'intermediary'

/** Resolve the OAuth2 credentials + onbehalfof to use for a user, by mode.
 *
 *  taxpayer (default): use the user's OWN stored client_id/secret (Login as
 *    Taxpayer System, 07). No onbehalfof — the token is already scoped to them.
 *    Falls back to the env-level global pair (single-tenant) if set.
 *
 *  intermediary: use the PLATFORM's env client_id/secret (Login as
 *    Intermediary System, 08) + header `onbehalfof: <taxpayer TIN>`. Requires
 *    the user's supplier TIN (profiles.tin) to be set, since onbehalfof must
 *    identify the taxpayer we represent. (Per the SDK, onbehalfof is sent on the
 *    /connect/token request; the resulting token embeds the taxpayer binding.)
 */
async function resolveCreds(
  userId: string,
): Promise<{ key: string; clientId: string; clientSecret: string; onbehalfof?: string }> {
  if (credMode === 'intermediary') {
    // Platform ERP key (env) — required for this mode (env.ts enforces it).
    if (!env.MYINVOIS_CLIENT_ID || !env.MYINVOIS_CLIENT_SECRET) {
      throw new MyInvoisNotConnectedError(
        'Intermediary mode is misconfigured: platform LHDN credentials are not set. Ask the admin to set MYINVOIS_CLIENT_ID/SECRET.',
      )
    }
    // onbehalfof needs the taxpayer's TIN. Without it, the intermediary token
    // can't be scoped — the user must set their TIN in their profile first.
    const tin = await getTaxpayerTin(userId)
    if (!tin) {
      throw new ValidationError('Set your TIN in your profile first so we can submit on your behalf.')
    }
    return {
      key: `interm:${tin}`,
      clientId: env.MYINVOIS_CLIENT_ID,
      clientSecret: env.MYINVOIS_CLIENT_SECRET,
      onbehalfof: tin,
    }
  }
  // taxpayer mode: user's own stored creds first, then the env global fallback.
  const userCreds = await getMyInvoisCredentials(userId)
  if (userCreds.clientId && userCreds.clientSecret) {
    return { key: userId, clientId: userCreds.clientId, clientSecret: userCreds.clientSecret }
  }
  if (env.MYINVOIS_CLIENT_ID && env.MYINVOIS_CLIENT_SECRET) {
    return {
      key: GLOBAL_KEY,
      clientId: env.MYINVOIS_CLIENT_ID,
      clientSecret: env.MYINVOIS_CLIENT_SECRET,
    }
  }
  throw new MyInvoisNotConnectedError(
    'Connect your LHDN MyInvois account in Settings first, then retry.',
  )
}

/**
 * Get an OAuth2 client-credentials bearer token from LHDN, scoped to the user
 * (taxpayer mode: their own creds; intermediary mode: platform creds +
 * onbehalfof). Mock mode returns a fake token and ignores `userId` entirely.
 */
export async function getToken(userId: string): Promise<string> {
  if (isMock) {
    return `mock-token.${Buffer.from('auto-invoice-mock').toString('base64')}`
  }

  const { key, clientId, clientSecret, onbehalfof } = await resolveCreds(userId)

  // Return cached token if it has >60s of life left.
  const cached = tokenCache.get(key)
  if (cached && cached.expires_at - Date.now() > 60_000) {
    return cached.access_token
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'InvoicingAPI',
  })

  // Intermediary mode: add the onbehalfof header on the token request (per the
  // SDK's Login-as-Intermediary-System docs). The resulting token embeds the
  // taxpayer binding; subsequent API calls use Bearer only — no per-call header.
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (onbehalfof) headers.onbehalfof = onbehalfof

  const res = await fetch(`https://${host()}/connect/token`, {
    method: 'POST',
    headers,
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new MyInvoisError('token_failed', `LHDN token endpoint ${res.status}: ${text}`, res.status)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache.set(key, {
    access_token: json.access_token,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
  })
  return json.access_token
}

/** Drop a user's cached token (e.g. after they update or disconnect their
 *  credentials, so the next call re-fetches with the new pair). Clears both the
 *  taxpayer-mode key (userId) and any intermediary-mode key (interm:<tin>) since
 *  the latter is derived from the user's TIN, which may have changed. */
export function invalidateToken(userId: string): void {
  tokenCache.delete(userId)
  for (const k of [...tokenCache.keys()]) {
    if (k.startsWith('interm:')) tokenCache.delete(k)
  }
}

// ─── TIN validation (Taxpayer Identification Number) ──────────────────────
export interface TinValidationResult {
  tin: string
  valid: boolean
  // Present when valid — the taxpayer's registered name from LHDN.
  taxpayerName?: string
  // Raw LHDN response (mock mode includes a note explaining the source).
  raw: Record<string, unknown>
}

/**
 * Validate a TIN against LHDN. In mock mode, TINs matching the Malaysian format
 * (10–14 digits/letters) are reported valid with a canned taxpayer name.
 * `userId` selects the caller's own LHDN credentials for the token (ignored in mock).
 */
export async function validateTin(tin: string, userId: string): Promise<TinValidationResult> {
  const clean = tin.replace(/[\s-]/g, '').toUpperCase()

  if (isMock) {
    // Malaysian TIN format: starts with letters (e.g. SG, OG, C, D, T) + digits,
    // typically 10–14 chars. Treat anything matching that as valid.
    const looksValid = /^[A-Z]{0,2}\d{6,12}$/.test(clean) || /^\d{10,14}$/.test(clean)
    return {
      tin: clean,
      valid: looksValid,
      taxpayerName: looksValid ? `MOCK TAXPAYER (${clean})` : undefined,
      raw: {
        source: 'mock',
        note: 'No LHDN call was made (MYINVOIS_ENV=mock). Format-based heuristic only.',
        tin: clean,
        valid: looksValid,
      },
    }
  }

  const token = await getToken(userId)
  const res = await fetch(`https://${host()}/api/v1.0/taxpayer/validate/${encodeURIComponent(clean)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return {
      tin: clean,
      valid: false,
      raw: { ...raw, http_status: res.status },
    }
  }
  return {
    tin: clean,
    valid: Boolean(raw.valid ?? true),
    taxpayerName: typeof raw.name === 'string' ? raw.name : undefined,
    raw,
  }
}

// ─── Document submission ─────────────────────────────────────────────────
export interface SubmitDocumentInput {
  // The invoice UUID (our DB id) — used to build a stable submission UID in mock.
  invoiceId: string
  // Signed UBL 2.1 document (JSON variant), base64-encoded. The submit body
  // carries format:"JSON"; documentHash is the SHA256 of the TRANSFORMED
  // (stripped+minified) document per the signing guide Step 2 — supplied by
  // the caller (invoiceSubmissionService) alongside the signed doc so both
  // agree on what was hashed.
  documentBase64: string
  // base64( SHA256( UTF8( transformDocument( signedJson ) ) ) ) — Step 2 digest.
  documentHash: string
}

export interface SubmitDocumentResult {
  // LHDN's unique submission identifier.
  submissionUid: string
  // Per-document acceptance/rejection details.
  documents: Array<{
    uuid: string
    status: 'accepted' | 'rejected' | 'valid' | 'invalid' | 'submitted'
    longId?: string
    errorMessage?: string
  }>
  raw: Record<string, unknown>
  httpStatus: number
}

/**
 * Submit a signed UBL document to LHDN.
 *
 * `userId` selects the caller's own LHDN credentials (per-user Login-as-
 * Taxpayer-System). Mock mode: returns a deterministic "accepted" result with a
 * submission UID derived from the invoice id, so re-submits are traceable.
 */
export async function submitDocument(
  input: SubmitDocumentInput,
  userId: string,
): Promise<SubmitDocumentResult> {
  if (isMock) {
    // Derive a stable-ish submission UID from the invoice id so the audit row
    // is traceable across re-submits within the same mock session.
    const docUuid = input.invoiceId
    const submissionUid = `mock-submission-${input.invoiceId.slice(0, 8)}`
    return {
      submissionUid,
      documents: [
        {
          uuid: docUuid,
          status: 'accepted',
          longId: `mock-long-id-${input.invoiceId.slice(0, 12)}`,
        },
      ],
      raw: {
        source: 'mock',
        note: 'No LHDN call was made (MYINVOIS_ENV=mock). Document auto-accepted.',
        submissionUid,
      },
      httpStatus: 202,
    }
  }

  const token = await getToken(userId)
  const body = {
    documents: [
      {
        format: 'JSON',
        document: input.documentBase64, // base64-encoded signed UBL JSON
        documentHash: input.documentHash,
        codeNumber: input.invoiceId,
      },
    ],
  }

  const res = await fetch(`https://${host()}/api/v1.0/documentsubmissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const docs = Array.isArray(raw.acceptedDocuments)
    ? raw.acceptedDocuments.map((d: Record<string, unknown>) => ({
        uuid: String(d.uuid ?? ''),
        status: 'accepted' as const,
        longId: typeof d.longId === 'string' ? d.longId : undefined,
      }))
    : Array.isArray(raw.rejectedDocuments)
      ? raw.rejectedDocuments.map((d: Record<string, unknown>) => {
          const err = d.error
          return {
            uuid: String(d.uuid ?? ''),
            status: 'rejected' as const,
            errorMessage: err && typeof err === 'object' && 'message' in err && typeof (err as Record<string, unknown>).message === 'string'
              ? ((err as Record<string, string>).message)
              : undefined,
          }
        })
      : []

  return {
    submissionUid: typeof raw.submissionUid === 'string' ? raw.submissionUid : '',
    documents: docs,
    raw,
    httpStatus: res.status,
  }
}

// ─── Get Submission (06) — fetches documentSummary incl. the longId ──────
// The submit response (02) returns submissionUid + acceptedDocuments[{uuid,
// invoiceCodeNumber}] but NOT the longId. The longId ("unique long temporary
// Id that can be used to query document data anonymously, returned only for
// valid documents") comes from Get Submission (06) in documentSummary[].longId.
// We use it to build the validation link + QR. See docs/myinvois/SDK-ANALYSIS.md §3.
export interface SubmissionDocumentSummary {
  uuid: string
  longId?: string
  status?: string
  internalId?: string
  totalPayableAmount?: number
}
export interface SubmissionResult {
  submissionUid: string
  overallStatus?: string
  documents: SubmissionDocumentSummary[]
  raw: Record<string, unknown>
}

export async function getSubmission(
  submissionUid: string,
  userId: string,
): Promise<SubmissionResult> {
  if (isMock) {
    const docUuid = submissionUid.replace(/^mock-submission-/, '')
    return {
      submissionUid,
      overallStatus: 'valid',
      documents: [
        { uuid: docUuid, longId: `mock-long-id-${docUuid.slice(0, 12)}`, status: 'valid' },
      ],
      raw: { source: 'mock', submissionUid, overallStatus: 'valid' },
    }
  }
  const token = await getToken(userId)
  const res = await fetch(
    `https://${host()}/api/v1.0/documentsubmissions/${encodeURIComponent(submissionUid)}`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
  )
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const docs = Array.isArray(raw.documentSummary) ? raw.documentSummary : []
  const documents: SubmissionDocumentSummary[] = docs.map((d: Record<string, unknown>) => ({
    uuid: String(d.uuid ?? ''),
    longId: typeof d.longId === 'string' ? d.longId : undefined,
    status: typeof d.status === 'string' ? d.status : undefined,
    internalId: typeof d.internalId === 'string' ? d.internalId : undefined,
    totalPayableAmount: typeof d.totalPayableAmount === 'number' ? d.totalPayableAmount : undefined,
  }))
  return {
    submissionUid: typeof raw.submissionUid === 'string' ? raw.submissionUid : submissionUid,
    overallStatus: typeof raw.overallStatus === 'string' ? raw.overallStatus : undefined,
    documents,
    raw,
  }
}

/** Build the MyInvois validation link + QR target.
 *  Format (FAQ + Get Document): `{envbaseurl}/{uuid}/share/{longId}` where
 *  envbaseurl is the portal base URL (prod myinvois.hasil.gov.my, sandbox
 *  preprod.myinvois.hasil.gov.my). Returns null if either id is missing. */
export function buildValidationLink(uuid: string | null, longId: string | null): string | null {
  if (!uuid || !longId) return null
  const portalBase =
    env.MYINVOIS_ENV === 'prod'
      ? 'https://myinvois.hasil.gov.my'
      : 'https://preprod.myinvois.hasil.gov.my'
  return `${portalBase}/${uuid}/share/${longId}`
}

// ─── Document details (status lookup) ────────────────────────────────────
export interface DocumentDetailsResult {
  uuid: string
  status: 'valid' | 'invalid' | 'submitted' | 'cancelled'
  longId?: string
  raw: Record<string, unknown>
}

export async function getDocumentDetails(
  uuid: string,
  userId: string,
): Promise<DocumentDetailsResult> {
  if (isMock) {
    return {
      uuid,
      status: 'valid',
      longId: `mock-long-id-${uuid.slice(0, 12)}`,
      raw: { source: 'mock', note: 'No LHDN call was made (MYINVOIS_ENV=mock).', uuid, status: 'valid' },
    }
  }

  const token = await getToken(userId)
  const res = await fetch(`https://${host()}/api/v1.0/documents/${encodeURIComponent(uuid)}/details`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return {
    uuid,
    status: (raw.status as DocumentDetailsResult['status']) ?? 'submitted',
    longId: typeof raw.longId === 'string' ? raw.longId : undefined,
    raw,
  }
}

// ─── UBL 2.1 builder inputs (JSON variant is the live submit path) ────────
// Field shapes mirror the MyInvois v1.1 structure (sdk.myinvois.hasil.gov.my/
// types/invoice-v1-1) so buildUblJson emits a document that passes the Core
// Fields Validator. See docs/myinvois/SDK-ANALYSIS.md §4. Fields absent on the
// source data fall back to the MyInvois 'NA' convention inside buildUblJson.
export interface PartyAddress {
  line1?: string | null // AddressLine[0]
  line2?: string | null // AddressLine[1]
  line3?: string | null // AddressLine[2]
  city?: string | null // CityName (mandatory)
  postalZone?: string | null
  stateCode?: string | null // 01-17 (17 = Not Applicable)
  country?: string | null // ISO-3166-1, default MYS
}

export interface InvoiceParty {
  tin: string
  brn?: string | null // Business Registration Number (SSM/NRIC/PASSPORT/ARMY)
  brnScheme?: string | null // schemeID for brn: BRN|NRIC|PASSPORT|ARMY (default BRN)
  sstNumber?: string | null // 'NA' if not SST-registered
  ttxNumber?: string | null // 'NA' if not tourism-tax-registered (supplier only)
  name: string // PartyLegalEntity/RegistrationName
  email?: string | null // Contact/ElectronicMail (optional)
  phone?: string | null // Contact/Telephone (mandatory; 'NA' for consolidated buyer)
  address?: PartyAddress | string | null // structured (preferred) or legacy single string
  msicCode?: string | null // supplier only: IndustryClassificationCode value (5-digit)
  msicDescription?: string | null // supplier only: IndustryClassificationCode/@name
}

export interface UblLineItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number // percentage, e.g. 6 for 6% SST
  taxTypeCode?: string | null // tax-type code 01-06|E; default '06' (Not Applicable)
  unitCode?: string | null // UN/ECE Rec 20 unit code; default 'C62' (unit)
  classification?: string | null // Item.CommodityClassification[CLASS] (3-char); default '000'
}

export interface BuildUblInput {
  invoiceNumber: string
  issueDate: string // YYYY-MM-DD
  issueTime?: string | null // UTC HH:MM:SSZ; defaults to now at build time
  dueDate?: string | null
  currency: string // e.g. MYR
  taxCurrency?: string | null // defaults to currency (or MYR for foreign)
  invoiceType?: string | null // e-Invoice type code 01-04|11-14; default '01'
  supplier: InvoiceParty
  customer: InvoiceParty
  items: UblLineItem[]
  // Payment means (optional; closes the bank-detail gap from flow 2).
  paymentMeansCode?: string | null // PaymentMeansCode 01-08
  paymentAccount?: string | null // PayeeFinancialAccount/ID (supplier bank account no)
  paymentTerms?: string | null // PaymentTerms/Note
  // Billing reference for credit/debit/refund notes (original invoice UUID).
  billingReferenceUuid?: string | null
  // Computed totals; recomputed here to avoid caller math drift.
  subtotal?: number
  taxTotal?: number
  total?: number
}

/**
 * Build a minimal-but-valid UBL 2.1 Invoice XML.
 *
 * ⚠️ RETIRED from the submit path. The submit flow now uses the JSON variant
 * (buildUblJson) + format:"JSON" because the only LHDN signing documentation
 * operates on JSON; on XML the signing mechanism is undocumented. This XML
 * builder is retained for reference/fallback only and has NO live caller.
 * See lib/ublJson.ts + lib/signing.ts + docs/myinvois/RESEARCH.md §6.
 */
export function buildUbl(input: BuildUblInput): string {
  const items = input.items
  const lineExt = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
  const taxTotal = items.reduce(
    (s, it) => s + it.quantity * it.unitPrice * (it.taxRate / 100),
    0,
  )
  const grandTotal = lineExt + taxTotal
  const subtotal = input.subtotal ?? lineExt
  const tax = input.taxTotal ?? taxTotal
  const total = input.total ?? grandTotal

  const lineXml = items
    .map((it, i) => {
      const lineNet = it.quantity * it.unitPrice
      const lineTax = lineNet * (it.taxRate / 100)
      return `      <cac:InvoiceLine>
        <cbc:ID>${i + 1}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="C62">${it.quantity}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="${input.currency}">${lineNet.toFixed(2)}</cbc:LineExtensionAmount>
        <cbc:TaxTotal>
          <cbc:TaxAmount currencyID="${input.currency}">${lineTax.toFixed(2)}</cbc:TaxAmount>
        </cbc:TaxTotal>
        <cac:Item>
          <cbc:Description>${esc(it.description)}</cbc:Description>
          <cbc:Name>${esc(it.description)}</cbc:Name>
        </cac:Item>
        <cac:Price>
          <cbc:PriceAmount currencyID="${input.currency}">${it.unitPrice.toFixed(2)}</cbc:PriceAmount>
        </cac:Price>
      </cac:InvoiceLine>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${esc(input.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${input.issueDate}</cbc:IssueDate>
  ${input.dueDate ? `<cbc:DueDate>${input.dueDate}</cbc:DueDate>` : ''}
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:IndustryClassificationCode name="${esc(input.supplier.name)}"/>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${esc(input.supplier.tin)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${esc(input.supplier.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(typeof input.supplier.address === 'string' ? input.supplier.address : (input.supplier.address?.line1 ?? 'Malaysia'))}</cbc:StreetName>
        <cac:Country><cbc:IdentificationCode>MYS</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(input.supplier.tin)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>TAX</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${esc(input.customer.tin)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${esc(input.customer.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(typeof input.customer.address === 'string' ? input.customer.address : (input.customer.address?.line1 ?? 'Malaysia'))}</cbc:StreetName>
        <cac:Country><cbc:IdentificationCode>MYS</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${input.currency}">${tax.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${input.currency}">${subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${input.currency}">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${input.currency}">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lineXml}
</Invoice>`
}

// ─── helpers ──────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Thrown by real-mode calls; caught by the route and logged to the audit row. */
export class MyInvoisError extends Error {
  code: string
  httpStatus?: number
  constructor(code: string, message: string, httpStatus?: number) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
    this.name = 'MyInvoisError'
  }
}