import { env } from '../env'

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
let tokenCache: TokenCache | null = null

/**
 * Get an OAuth2 client-credentials bearer token from LHDN.
 * Mock mode returns a fake token that never expires for this session.
 */
export async function getToken(): Promise<string> {
  if (isMock) {
    return `mock-token.${Buffer.from('auto-invoice-mock').toString('base64')}`
  }

  // Return cached token if it has >60s of life left.
  if (tokenCache && tokenCache.expires_at - Date.now() > 60_000) {
    return tokenCache.access_token
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.MYINVOIS_CLIENT_ID!,
    client_secret: env.MYINVOIS_CLIENT_SECRET!,
    scope: 'InvoicingAPI',
  })

  const res = await fetch(`https://${host()}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new MyInvoisError('token_failed', `LHDN token endpoint ${res.status}: ${text}`, res.status)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    access_token: json.access_token,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
  }
  return tokenCache.access_token
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
 */
export async function validateTin(tin: string): Promise<TinValidationResult> {
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

  const token = await getToken()
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
  // UBL 2.1 XML document, base64-encoded.
  invoiceXmlBase64: string
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
 * Mock mode: returns a deterministic "accepted" result with a submission UID
 * derived from the invoice id, so re-submits are traceable.
 */
export async function submitDocument(input: SubmitDocumentInput): Promise<SubmitDocumentResult> {
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

  const token = await getToken()
  const body = {
    documents: [
      {
        format: 'XML',
        document: input.invoiceXmlBase64, // base64-encoded UBL
        documentHash: await sha256Base64(Buffer.from(input.invoiceXmlBase64, 'base64')),
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

// ─── Document details (status lookup) ────────────────────────────────────
export interface DocumentDetailsResult {
  uuid: string
  status: 'valid' | 'invalid' | 'submitted' | 'cancelled'
  longId?: string
  raw: Record<string, unknown>
}

export async function getDocumentDetails(uuid: string): Promise<DocumentDetailsResult> {
  if (isMock) {
    return {
      uuid,
      status: 'valid',
      longId: `mock-long-id-${uuid.slice(0, 12)}`,
      raw: { source: 'mock', note: 'No LHDN call was made (MYINVOIS_ENV=mock).', uuid, status: 'valid' },
    }
  }

  const token = await getToken()
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

// ─── UBL 2.1 XML builder (simplified, schema-aligned) ────────────────────
export interface InvoiceParty {
  tin: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
}

export interface BuildUblInput {
  invoiceNumber: string
  issueDate: string // YYYY-MM-DD
  dueDate?: string | null
  currency: string // e.g. MYR
  supplier: InvoiceParty
  customer: InvoiceParty
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    taxRate: number // percentage, e.g. 6 for 6% SST
  }>
  // Computed totals; recomputed here to avoid caller math drift.
  subtotal?: number
  taxTotal?: number
  total?: number
}

/**
 * Build a minimal-but-valid UBL 2.1 Invoice XML.
 *
 * This is the *unsigned* document. For sandbox/prod, the XML must be
 * enveloped-XMlDSig-signed with the POS Digicert cert before submission
 * (see docs/myinvois/RESEARCH.md §6). Mock mode does not require signing.
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
        <cbc:StreetName>${esc(input.supplier.address ?? 'Malaysia')}</cbc:StreetName>
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
        <cbc:StreetName>${esc(input.customer.address ?? 'Malaysia')}</cbc:StreetName>
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

async function sha256Base64(buf: Buffer): Promise<string> {
  const { createHash } = await import('node:crypto')
  // LHDN documentHash: base64(SHA256(UTF8(document))) — see docs/myinvois/RESEARCH.md
  // §6 line 223 and signature-creation-json.md lines 965–968
  // (Convert.ToBase64String in the reference C#). NOT hex.
  return createHash('sha256').update(buf).digest('base64')
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