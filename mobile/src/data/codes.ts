/**
 * MyInvois (LHDN) code tables — the single source of truth for every
 * classification / type / code dropdown in the app.
 *
 * All tables are sourced from the official LHDN SDK code pages
 * (https://sdk.myinvois.hasil.gov.my/codes/) and normalized to a common
 * `CodeEntry` shape: `{ code, label, description }`. The `label` is the short
 * name shown in the picker row; `description` is the longer explanation shown
 * in the help (?) popup so users understand each value before selecting.
 *
 * Field → table mapping (per invoice-v1.1 type structure + validation rules):
 *   Invoice.InvoiceTypeCode            → E_INVOICE_TYPES
 *   Invoice.DocumentCurrencyCode       → CURRENCIES
 *   PaymentMeans.PaymentMeansCode      → PAYMENT_METHODS
 *   Supplier.IndustryClassificationCode→ MSIC_CODES (5-digit)
 *   TaxCategory.ID (per line + invoice)→ TAX_TYPES
 *   Item.CommodityClassification[CLASS]→ CLASSIFICATION_CODES (3-char)
 *   Item.OriginCountry.IdentificationCode → COUNTRIES
 *   InvoicedQuantity.@unitCode         → UNIT_TYPES (UN/ECE Rec 20)
 *   PostalAddress.CountrySubentityCode → STATE_CODES (Malaysia only)
 *   PostalAddress.Country.IdentificationCode → COUNTRIES (ISO-3166-1)
 *
 * Max-char / mandatory constraints (from the v1.1 data-structure table) are
 * co-located on each table as `FIELD_RULES` so validators + pickers agree.
 */
import E_INVOICE_TYPES_RAW from './e-invoice-types.json'
import PAYMENT_METHODS_RAW from './payment-methods.json'
import MSIC_RAW from './msic-codes.json'
import COUNTRIES_RAW from './countries.json'
import CURRENCIES_RAW from './currencies.json'
import UNIT_TYPES_RAW from './unit-types.json'
import CLASSIFICATION_RAW from './classification.json'
import STATE_CODES_RAW from './state-codes.json'
import TAX_TYPES_RAW from './tax-types.json'

export interface CodeEntry {
  /** The value stored on the invoice / profile (e.g. "01", "01111", "MYS"). */
  code: string
  /** Short name shown in the picker row (e.g. "Invoice", "Growing of maize"). */
  label: string
  /** Longer explanation shown in the help (?) popup. */
  description?: string
}

// ── e-Invoice Types (8) ────────────────────────────────────────────────────
// Curated "when to use" descriptions from the SDK types page.
const E_INVOICE_TYPE_HELP: Record<string, string> = {
  '01': 'A commercial document issued by a Supplier to itemise a transaction with a Buyer. Use this for a standard sale of goods or services.',
  '02': 'Credit Note — issued by the Supplier to correct errors, apply discounts, or account for returns that reduce the value of a previously issued e-Invoice (no money returned to the Buyer).',
  '03': 'Debit Note — issued to indicate additional charges on a previously issued e-Invoice.',
  '04': 'Refund Note — issued by the Supplier to confirm a refund of the Buyer’s payment (money IS returned to the Buyer).',
  '11': 'Self-billed Invoice — issued by the Buyer (not the Supplier) for the initial self-billed transaction. Only allowed in specific circumstances (see Section 8 of the e-Invoice Specific Guideline).',
  '12': 'Self-billed Credit Note — issued by the Buyer to reduce the value of a previously issued self-billed e-Invoice (no money returned).',
  '13': 'Self-billed Debit Note — issued by the Buyer to indicate additional charges on a previously issued self-billed e-Invoice.',
  '14': 'Self-billed Refund Note — issued by the Buyer to confirm a refund of the Buyer’s payment on a self-billed transaction (money returned).',
}
export const E_INVOICE_TYPES: CodeEntry[] = (E_INVOICE_TYPES_RAW as { Code: string; Description: string }[]).map(
  (r) => ({ code: r.Code, label: r.Description, description: E_INVOICE_TYPE_HELP[r.Code] }),
)

// ── Payment Methods (8) ────────────────────────────────────────────────────
const PAYMENT_HELP: Record<string, string> = {
  '01': 'Cash — physical notes and coins handed over in person.',
  '02': 'Cheque — a paper cheque drawn on a bank account.',
  '03': 'Bank Transfer — electronic transfer between bank accounts (e.g. IBG / IBFT).',
  '04': 'Credit Card — payment by credit card.',
  '05': 'Debit Card — payment by debit card.',
  '06': 'e-Wallet / Digital Wallet — payment via an e-wallet (e.g. Touch ’n Go, GrabPay).',
  '07': 'Digital Bank — payment via a digital-bank account.',
  '08': 'Others — any payment mechanism not listed above.',
}
export const PAYMENT_METHODS: CodeEntry[] = (PAYMENT_METHODS_RAW as { Code: string; Description: string }[]).map(
  (r) => ({ code: r.Code, label: r.Description, description: PAYMENT_HELP[r.Code] }),
)

// ── State Codes (17) — Malaysia only ───────────────────────────────────────
const STATE_NAMES: Record<string, string> = STATE_CODES_RAW as Record<string, string>
export const STATE_CODES: CodeEntry[] = Object.entries(STATE_NAMES).map(([code, name]) => ({
  code,
  label: name,
  description:
    code === '17'
      ? 'Not Applicable — use when the address is outside Malaysia, or for a consolidated e-Invoice where a specific state does not apply.'
      : `${name} — the Malaysian state / federal territory identified by code ${code}.`,
}))

// ── Tax Types (7) ───────────────────────────────────────────────────────────
const TAX_NAMES: Record<string, string> = TAX_TYPES_RAW as Record<string, string>
const TAX_HELP: Record<string, string> = {
  '01': 'Sales Tax — domestic sales tax under the Sales Tax Act 2018.',
  '02': 'Service Tax — domestic service tax under the Service Tax Act 2018.',
  '03': 'Tourism Tax — tax on accommodation charged by hotel / travel operators.',
  '04': 'High-Value Goods Tax — tax on specified high-value goods.',
  '05': 'Sales Tax on Low Value Goods — sales tax on low-value goods imported/sold.',
  '06': 'Not Applicable — no tax applies to this line / invoice.',
  E: 'Tax exemption — use when the line / invoice is exempt from tax (set the tax amount to 0).',
}
export const TAX_TYPES: CodeEntry[] = Object.entries(TAX_NAMES).map(([code, name]) => ({
  code,
  label: name,
  description: TAX_HELP[code],
}))

// ── Classification Codes (45) — Item.CommodityClassification[CLASS] ───────
export const CLASSIFICATION_CODES: CodeEntry[] = (CLASSIFICATION_RAW as { Code: string; Description: string }[]).map(
  (r) => ({
    code: r.Code,
    label: r.Description,
    description: `Classification ${r.Code} — ${r.Description}. Applied at the line-item level to categorise the type of goods or service.`,
  }),
)

// ── MSIC Codes (1175) — Supplier.IndustryClassificationCode ───────────────
interface MsicRaw { Code: string; Description: string; 'MSIC Category Reference'?: string }
export const MSIC_CODES: CodeEntry[] = (MSIC_RAW as MsicRaw[]).map((r) => ({
  code: r.Code,
  label: r.Description,
  description: r['MSIC Category Reference']
    ? `${r.Description} (MSIC category ${r['MSIC Category Reference']}). 5-digit code representing the supplier’s business nature and activity.`
    : `${r.Description}. 5-digit Malaysia Standard Industrial Classification code representing the supplier’s business nature and activity.`,
}))

// ── Country Codes (253) — ISO-3166-1 ───────────────────────────────────────
interface CountryRaw { Code: string; Country: string }
export const COUNTRIES: CodeEntry[] = (COUNTRIES_RAW as CountryRaw[]).map((r) => ({
  code: r.Code,
  label: r.Country.charAt(0) + r.Country.slice(1).toLowerCase(),
  description: `${r.Country} — ISO-3166-1 alpha-3 country code ${r.Code}. Used for the address country and the line-item Country of Origin.`,
}))

// ── Currency Codes (180) ───────────────────────────────────────────────────
export const CURRENCIES: CodeEntry[] = (CURRENCIES_RAW as { Code: string; Description: string }[]).map((r) => ({
  code: r.Code,
  label: `${r.Code} — ${r.Description}`,
  description: `${r.Description} (ISO 4217 currency code ${r.Code}). MyInvois accepts this as the invoice DocumentCurrencyCode.`,
}))

// ── Unit of Measurement (UN/ECE Rec 20) ────────────────────────────────────
export const UNIT_TYPES: CodeEntry[] = (UNIT_TYPES_RAW as { Code: string; Description: string }[]).map((r) => ({
  code: r.Code,
  label: `${r.Code} — ${r.Description}`,
  description: `${r.Description}. Unit code ${r.Code} from UN/ECE Recommendation 20, used as InvoicedQuantity @unitCode on a line item.`,
}))

// ── Field rules (max chars / required) from the v1.1 data-structure table ──
/** Co-located so the ValidatedField max-length and the picker agree with LHDN. */
export const FIELD_RULES = {
  tin:          { max: 14,  required: true,  label: 'TIN' },
  brn:          { max: 20,  required: true,  label: 'BRN / SSM' },
  nric:         { max: 12,  required: false, label: 'NRIC / Passport' },
  sst:          { max: 35,  required: false, label: 'SST number' },
  ttx:          { max: 17,  required: false, label: 'Tourism Tax (TTX)' },
  msic:         { max: 5,   required: true,  label: 'MSIC code' },
  contact:      { max: 20,  required: true,  label: 'Contact number' },
  email:        { max: 320, required: false, label: 'Email' },
  addressLine:  { max: 150, required: false, label: 'Address line' },
  city:         { max: 50,  required: true,  label: 'City' },
  postalZone:   { max: 50,  required: false, label: 'Postal zone' },
  invoiceNumber:{ max: 50,  required: true,  label: 'Invoice number' },
  paymentAccount:{ max: 150, required: false, label: 'Bank account no' },
  paymentTerms: { max: 300, required: false, label: 'Payment terms' },
  description:  { max: 300, required: true,  label: 'Description' },
  // login / connect
  clientEmail:  { max: 320, required: true,  label: 'Email' },
  clientSecret: { max: 200, required: true,  label: 'Client secret' }, // generous upper bound
} as const

// ── Lookup helpers ──────────────────────────────────────────────────────────
/** Find the label for a code (e.g. "01" → "Invoice"). Falls back to the raw code. */
export function codeLabel(table: CodeEntry[], code: string | null | undefined): string {
  if (!code) return '—'
  const hit = table.find((e) => e.code === code)
  return hit ? hit.label : code
}

/** Find the full entry for a code, or null. */
export function findEntry(table: CodeEntry[], code: string | null | undefined): CodeEntry | null {
  if (!code) return null
  return table.find((e) => e.code === code) ?? null
}