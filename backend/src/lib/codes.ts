/**
 * LHDN MyInvois code tables + pre-submit validators.
 *
 * The code sets are the authoritative values the MyInvois **Code Validator**
 * checks (sdk.myinvois.hasil.gov.my/codes/). Submitting a code outside these
 * sets is rejected. We keep them as small TS consts (the official tables are
 * short; MSIC + country + currency lists are large and only needed for UX, not
 * hard validation, so they're left in docs/myinvois/sdk-ref/ for reference).
 *
 * Field-length/format limits come from the LHDN FAQ field-validation table
 * (docs/myinvois/SDK-ANALYSIS.md §5). `validateFieldLengths` runs pre-submit to
 * fail fast with a clear message instead of an opaque LHDN rejection.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

// e-Invoice type codes (codes/e-invoice-types.txt)
export const EINVOICE_TYPES = {
  '01': 'Invoice',
  '02': 'Credit Note',
  '03': 'Debit Note',
  '04': 'Refund Note',
  '11': 'Self-billed Invoice',
  '12': 'Self-billed Credit Note',
  '13': 'Self-billed Debit Note',
  '14': 'Self-billed Refund Note',
} as const

// Tax-type codes (codes/tax-types.txt). 'E' = tax exemption.
export const TAX_TYPES = {
  '01': 'Sales Tax',
  '02': 'Service Tax',
  '03': 'Tourism Tax',
  '04': 'High-Value Goods Tax',
  '05': 'Sales Tax on Low Value Goods',
  '06': 'Not Applicable',
  E: 'Tax exemption',
} as const

// Payment-means codes (codes/payment-methods.txt)
export const PAYMENT_MEANS = {
  '01': 'Cash',
  '02': 'Cheque',
  '03': 'Bank Transfer',
  '04': 'Credit Card',
  '05': 'Debit Card',
  '06': 'e-Wallet / Digital Wallet',
  '07': 'Digital Bank',
  '08': 'Others',
} as const

// State codes (codes/state-codes.txt) — ISO-3166. '17' = Not Applicable.
export const STATE_CODES = {
  '01': 'Johor',
  '02': 'Kedah',
  '03': 'Kelantan',
  '04': 'Melaka',
  '05': 'Negeri Sembilan',
  '06': 'Pahang',
  '07': 'Pulau Pinang',
  '08': 'Perak',
  '09': 'Perlis',
  '10': 'Selangor',
  '11': 'Terengganu',
  '12': 'Sabah',
  '13': 'Sarawak',
  '14': 'Wilayah Persekutuan Kuala Lumpur',
  '15': 'Wilayah Persekutuan Labuan',
  '16': 'Wilayah Persekutuan Putrajaya',
  '17': 'Not Applicable',
} as const

// Currencies we accept (Code Validator checks against ISO 4217). Keep the
// common set; the validator only needs a sanity check (3-letter ISO 4217).
export const isCurrencyCode = (c: string): boolean => /^[A-Z]{3}$/.test(c)

export const isValidEinvoiceType = (c: string | null | undefined): boolean =>
  !!c && c in EINVOICE_TYPES
export const isValidTaxType = (c: string | null | undefined): boolean =>
  !!c && (c in TAX_TYPES || c === '06')
export const isValidPaymentMeans = (c: string | null | undefined): boolean =>
  c == null || c === '' || c in PAYMENT_MEANS
export const isValidStateCode = (c: string | null | undefined): boolean =>
  !!c && c in STATE_CODES

// ── FAQ field-length limits (docs/myinvois/SDK-ANALYSIS.md §5) ──────────────
export const FIELD_LIMITS = {
  name: 300,
  email: 320,
  phone: { min: 8, max: 20 },
  addressLine: 150,
  cityName: 50,
  postalZone: 50,
  sstNumber: 35,
  ttxNumber: 17,
  brn: 20,
} as const

/** Validate a single field's length/format per the FAQ rules. Returns an
 *  array of human-readable violations (empty = valid). */
export function fieldViolations(
  field: keyof typeof FIELD_LIMITS,
  value: string | null | undefined,
): string[] {
  const v = (value ?? '').trim()
  const out: string[] = []
  const lim = FIELD_LIMITS[field]
  if (typeof lim === 'number') {
    if (v.length > lim) out.push(`${field}: max ${lim} chars (got ${v.length})`)
  } else if (field === 'phone') {
    const p = lim as { min: number; max: number }
    if (v && v !== 'NA') {
      if (v.length < p.min || v.length > p.max) out.push(`phone: ${p.min}-${p.max} chars (got ${v.length})`)
      // optional leading + only; no spaces between digits
      if (!/^\+?\d+$/.test(v)) out.push('phone: optional leading + only, no spaces')
    }
  }
  return out
}

// ── inline tests (npx tsx src/lib/codes.ts) ────────────────────────────────
if (import.meta.url?.endsWith('codes.ts')) {
  test('code sets contain the documented values', () => {
    assert.equal(EINVOICE_TYPES['02'], 'Credit Note')
    assert.equal(TAX_TYPES['06'], 'Not Applicable')
    assert.equal(TAX_TYPES.E, 'Tax exemption')
    assert.equal(PAYMENT_MEANS['03'], 'Bank Transfer')
    assert.equal(STATE_CODES['10'], 'Selangor')
    assert.equal(STATE_CODES['17'], 'Not Applicable')
  })
  test('code validators', () => {
    assert.equal(isValidEinvoiceType('01'), true)
    assert.equal(isValidEinvoiceType('99'), false)
    assert.equal(isValidTaxType('E'), true)
    assert.equal(isValidPaymentMeans('03'), true)
    assert.equal(isValidPaymentMeans(null), true) // optional
    assert.equal(isValidPaymentMeans('99'), false)
    assert.equal(isValidStateCode('14'), true)
    assert.equal(isValidStateCode('00'), false) // 00 no longer valid
    assert.equal(isCurrencyCode('MYR'), true)
    assert.equal(isCurrencyCode('MY'), false)
  })
  test('field-length violations', () => {
    assert.deepEqual(fieldViolations('name', 'x'.repeat(301)), ['name: max 300 chars (got 301)'])
    assert.deepEqual(fieldViolations('name', 'ok'), [])
    assert.deepEqual(fieldViolations('phone', '+60123456789'), [])
    assert.deepEqual(fieldViolations('phone', '1234 5678'), ['phone: optional leading + only, no spaces'])
    assert.deepEqual(fieldViolations('phone', 'NA'), []) // 'NA' exempt
    assert.deepEqual(fieldViolations('email', 'a'.repeat(321)), ['email: max 320 chars (got 321)'])
  })
}