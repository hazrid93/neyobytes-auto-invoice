/**
 * UBL JSON structure test — proves buildUblJson emits ALL mandatory fields the
 * MyInvois Core Fields Validator requires (docs/myinvois/SDK-ANALYSIS.md §4),
 * in the canonical element order from `1.1-Invoice-Sample.json`.
 *
 * Run: npm run ubl:verify
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildUblJson } from '../src/lib/ublJson'
import type { BuildUblInput } from '../src/lib/myinvois'

const baseInput: BuildUblInput = {
  invoiceNumber: 'INV-001',
  issueDate: '2026-06-30',
  currency: 'MYR',
  supplier: {
    tin: 'C1234567890',
    brn: '202001234567',
    sstNumber: 'A01-2345-67891012',
    ttxNumber: 'NA',
    name: 'ABC Sdn Bhd',
    email: 'supplier@abc.com',
    phone: '+60123456789',
    msicCode: '46510',
    msicDescription: 'Wholesale of computer hardware',
    address: {
      line1: 'Lot 66',
      line2: 'Bangunan Merdeka',
      city: 'Kuala Lumpur',
      postalZone: '50480',
      stateCode: '10',
      country: 'MYS',
    },
  },
  customer: {
    tin: 'C9876543210',
    brn: '202009876543',
    sstNumber: 'NA',
    name: 'XYZ Sdn Bhd',
    email: 'buyer@xyz.com',
    phone: '+60198765432',
    address: {
      line1: '1 Jalan Utama',
      city: 'Shah Alam',
      postalZone: '40000',
      stateCode: '10',
    },
  },
  items: [
    {
      description: 'Consulting Service',
      quantity: 1,
      unitPrice: 1000,
      taxRate: 8,
      taxTypeCode: '02', // Service Tax
    },
  ],
  paymentMeansCode: '03',
  paymentAccount: '1234567890123',
  paymentTerms: 'Net 30',
}

function get(path: string, obj: unknown): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined
    const a = acc as Record<string, unknown>
    // accept both array-index and object keys
    if (Array.isArray(a)) return a[Number(key)]
    return a[key]
  }, obj)
}

test('invoice top-level mandatory keys present in canonical order', () => {
  const doc = JSON.parse(buildUblJson(baseInput))
  const inv = doc.Invoice[0]
  const keys = Object.keys(inv)
  // Mandatory order from the canonical sample (subset we emit).
  const expectedOrder = [
    'ID',
    'IssueDate',
    'IssueTime',
    'InvoiceTypeCode',
    'DocumentCurrencyCode',
    'TaxCurrencyCode',
    'AccountingSupplierParty',
    'AccountingCustomerParty',
    'PaymentMeans',
    'PaymentTerms',
    'TaxTotal',
    'LegalMonetaryTotal',
    'InvoiceLine',
  ]
  const present = expectedOrder.filter((k) => keys.includes(k))
  assert.deepEqual(present, expectedOrder, 'mandatory keys present in order')
  // IssueTime defaults to UTC HH:MM:SSZ
  assert.match(get('IssueTime.0._', inv) as string, /^\d{2}:\d{2}:\d{2}Z$/)
  // InvoiceTypeCode + listVersionID 1.1
  assert.equal(get('InvoiceTypeCode.0._', inv), '01')
  assert.equal(get('InvoiceTypeCode.0.listVersionID', inv), '1.1')
  // TaxCurrencyCode present
  assert.equal(get('TaxCurrencyCode.0._', inv), 'MYR')
})

test('supplier party emits canonical mandatory structure', () => {
  const inv = JSON.parse(buildUblJson(baseInput)).Invoice[0]
  const party = get('AccountingSupplierParty.0.Party.0', inv) as Record<string, unknown>
  assert.deepEqual(Object.keys(party), [
    'IndustryClassificationCode',
    'PartyIdentification',
    'PostalAddress',
    'PartyLegalEntity',
    'Contact',
  ])
  // IndustryClassificationCode (MSIC) value + name
  assert.equal(get('IndustryClassificationCode.0._', party), '46510')
  assert.equal(get('IndustryClassificationCode.0.name', party), 'Wholesale of computer hardware')
  // PartyIdentification: TIN, BRN, SST, TTX (in order, with schemeID)
  const ids = party.PartyIdentification as Array<{ ID: Array<{ _: string; schemeID: string }> }>
  assert.deepEqual(
    ids.map((x) => ({ v: x.ID[0]._, s: x.ID[0].schemeID })),
    [
      { v: 'C1234567890', s: 'TIN' },
      { v: '202001234567', s: 'BRN' },
      { v: 'A01-2345-67891012', s: 'SST' },
      { v: 'NA', s: 'TTX' },
    ],
  )
  // PartyLegalEntity/RegistrationName (NOT PartyName)
  assert.equal(get('PartyLegalEntity.0.RegistrationName.0._', party), 'ABC Sdn Bhd')
  assert.ok(!('PartyName' in party), 'no PartyName (use PartyLegalEntity/RegistrationName)')
  // Contact: Telephone (mandatory) + ElectronicMail
  assert.equal(get('Contact.0.Telephone.0._', party), '+60123456789')
  assert.equal(get('Contact.0.ElectronicMail.0._', party), 'supplier@abc.com')
  // PostalAddress structure
  assert.equal(get('PostalAddress.0.CityName.0._', party), 'Kuala Lumpur')
  assert.equal(get('PostalAddress.0.PostalZone.0._', party), '50480')
  assert.equal(get('PostalAddress.0.CountrySubentityCode.0._', party), '10')
  const lines = get('PostalAddress.0.AddressLine', party) as Array<{ Line: unknown[] }>
  assert.deepEqual(lines[0].Line[0], { _: 'Lot 66' })
  assert.equal(get('PostalAddress.0.Country.0.IdentificationCode.0._', party), 'MYS')
  assert.equal(get('PostalAddress.0.Country.0.IdentificationCode.0.listID', party), 'ISO3166-1')
})

test('buyer party emits canonical mandatory structure (no IndustryClassificationCode)', () => {
  const inv = JSON.parse(buildUblJson(baseInput)).Invoice[0]
  const party = get('AccountingCustomerParty.0.Party.0', inv) as Record<string, unknown>
  assert.deepEqual(Object.keys(party), ['PartyIdentification', 'PostalAddress', 'PartyLegalEntity', 'Contact'])
  const ids = party.PartyIdentification as Array<{ ID: Array<{ _: string; schemeID: string }> }>
  assert.deepEqual(
    ids.map((x) => ({ v: x.ID[0]._, s: x.ID[0].schemeID })),
    [
      { v: 'C9876543210', s: 'TIN' },
      { v: '202009876543', s: 'BRN' },
      { v: 'NA', s: 'SST' },
      { v: 'NA', s: 'TTX' },
    ],
  )
  assert.equal(get('PartyLegalEntity.0.RegistrationName.0._', party), 'XYZ Sdn Bhd')
  assert.equal(get('Contact.0.Telephone.0._', party), '+60198765432')
  assert.ok(!('IndustryClassificationCode' in party), 'buyer has no IndustryClassificationCode')
})

test('invoice-level TaxTotal carries the TaxSubtotal breakdown (mandatory [1-*])', () => {
  const inv = JSON.parse(buildUblJson(baseInput)).Invoice[0]
  const sub = get('TaxTotal.0.TaxSubtotal.0', inv) as Record<string, unknown>
  assert.ok(sub.TaxableAmount, 'TaxableAmount present')
  assert.ok(sub.TaxAmount, 'TaxAmount present')
  assert.equal(get('TaxCategory.0.ID.0._', sub), '02') // Service Tax
  assert.equal(get('TaxCategory.0.TaxScheme.0.ID.0._', sub), 'OTH')
  assert.equal(get('TaxCategory.0.TaxScheme.0.ID.0.schemeID', sub), 'UN/ECE 5153')
})

test('InvoiceLine carries ItemPriceExtension + CommodityClassification + per-line TaxSubtotal', () => {
  const inv = JSON.parse(buildUblJson(baseInput)).Invoice[0]
  const line = get('InvoiceLine.0', inv) as Record<string, unknown>
  assert.deepEqual(Object.keys(line), [
    'ID',
    'InvoicedQuantity',
    'LineExtensionAmount',
    'TaxTotal',
    'Item',
    'Price',
    'ItemPriceExtension',
  ])
  // ItemPriceExtension (mandatory)
  assert.ok(get('ItemPriceExtension.0.Amount.0._', line) != null)
  // CommodityClassification[CLASS] (mandatory 3-char)
  assert.equal(get('Item.0.CommodityClassification.0.ItemClassificationCode.0._', line), '000')
  assert.equal(get('Item.0.CommodityClassification.0.ItemClassificationCode.0.listID', line), 'CLASS')
  // per-line TaxSubtotal with TaxCategory.ID + TaxScheme.OTH
  assert.equal(get('TaxTotal.0.TaxSubtotal.0.TaxCategory.0.ID.0._', line), '02')
  assert.equal(get('TaxTotal.0.TaxSubtotal.0.Percent.0._', line), 8)
  assert.equal(get('TaxTotal.0.TaxSubtotal.0.TaxCategory.0.TaxScheme.0.ID.0._', line), 'OTH')
})

test('PaymentMeans carries code + bank account (closes flow-2 bank-detail gap)', () => {
  const inv = JSON.parse(buildUblJson(baseInput)).Invoice[0]
  assert.equal(get('PaymentMeans.0.PaymentMeansCode.0._', inv), '03')
  assert.equal(get('PaymentMeans.0.PayeeFinancialAccount.0.ID.0._', inv), '1234567890123')
  assert.equal(get('PaymentTerms.0.Note.0._', inv), 'Net 30')
})

test('absent data falls back to the NA convention (still submittable)', () => {
  const minimal: BuildUblInput = {
    invoiceNumber: 'INV-002',
    issueDate: '2026-06-30',
    currency: 'MYR',
    supplier: { tin: 'C1111111110', name: 'Minimal Supplier' },
    customer: { tin: 'C2222222220', name: 'Minimal Buyer' },
    items: [{ description: 'Item', quantity: 1, unitPrice: 100, taxRate: 0 }],
  }
  const inv = JSON.parse(buildUblJson(minimal)).Invoice[0]
  const sup = get('AccountingSupplierParty.0.Party.0', inv) as Record<string, unknown>
  // SST/TTX default to 'NA'
  const ids = sup.PartyIdentification as Array<{ ID: Array<{ _: string; schemeID: string }> }>
  assert.deepEqual(
    ids.map((x) => ({ v: x.ID[0]._, s: x.ID[0].schemeID })),
    [
      { v: 'C1111111110', s: 'TIN' },
      { v: 'NA', s: 'BRN' },
      { v: 'NA', s: 'SST' },
      { v: 'NA', s: 'TTX' },
    ],
  )
  // MSIC defaults; Contact Telephone defaults to 'NA'; address uses 'NA' line + state 17
  assert.equal(get('IndustryClassificationCode.0._', sup), '00000')
  assert.equal(get('Contact.0.Telephone.0._', sup), 'NA')
  assert.equal(get('PostalAddress.0.CountrySubentityCode.0._', sup), '17')
  assert.equal(get('PostalAddress.0.AddressLine.0.Line.0._', sup), 'NA')
  // PaymentMeans omitted when no code
  assert.ok(!('PaymentMeans' in inv), 'no PaymentMeans when no code given')
  // taxType defaults to 06 (Not Applicable) at line + invoice level
  assert.equal(get('InvoiceLine.0.TaxTotal.0.TaxSubtotal.0.TaxCategory.0.ID.0._', inv), '06')
  assert.equal(get('TaxTotal.0.TaxSubtotal.0.TaxCategory.0.ID.0._', inv), '06')
})

test('credit/debit/refund notes: invoiceType + BillingReference', () => {
  const credit: BuildUblInput = {
    ...baseInput,
    invoiceType: '02',
    billingReferenceUuid: 'a8f4c2d7-9e3a-4b2f-8c1d-123456789abc',
  }
  const inv = JSON.parse(buildUblJson(credit)).Invoice[0]
  assert.equal(get('InvoiceTypeCode.0._', inv), '02')
  assert.equal(get('BillingReference.0.InvoiceDocumentReference.0.ID.0._', inv), 'a8f4c2d7-9e3a-4b2f-8c1d-123456789abc')
})

test('IssueTime can be overridden (caller supplies UTC time)', () => {
  const inv = JSON.parse(
    buildUblJson({ ...baseInput, issueTime: '00:30:00Z' }),
  ).Invoice[0]
  assert.equal(get('IssueTime.0._', inv), '00:30:00Z')
})

test('line-item codes (taxTypeCode/unitCode/classification/originCountry) thread through to the UBL', () => {
  const input: BuildUblInput = {
    ...baseInput,
    items: [
      {
        description: 'Laptop',
        quantity: 2,
        unitPrice: 2500,
        taxRate: 6,
        taxTypeCode: '01', // Sales Tax
        unitCode: 'C62',
        classification: '003',
        originCountry: 'GBR',
      },
    ],
  }
  const line = JSON.parse(buildUblJson(input)).Invoice[0].InvoiceLine[0]
  // taxTypeCode → per-line TaxCategory.ID
  assert.equal(get('TaxTotal.0.TaxSubtotal.0.TaxCategory.0.ID.0._', line), '01')
  // unitCode → InvoicedQuantity.unitCode
  assert.equal(get('InvoicedQuantity.0.unitCode', line), 'C62')
  // classification → CommodityClassification[CLASS]
  assert.equal(get('Item.0.CommodityClassification.0.ItemClassificationCode.0._', line), '003')
  // originCountry → Item.OriginCountry.IdentificationCode (NOT hardcoded MYS)
  assert.equal(get('Item.0.OriginCountry.0.IdentificationCode.0._', line), 'GBR')
  // invoice-level TaxSubtotal reflects the line's taxTypeCode too
  const inv = JSON.parse(buildUblJson(input)).Invoice[0]
  assert.equal(get('TaxTotal.0.TaxSubtotal.0.TaxCategory.0.ID.0._', inv), '01')
})

test('absent originCountry falls back to MYS (default)', () => {
  const line = JSON.parse(buildUblJson(baseInput)).Invoice[0].InvoiceLine[0]
  assert.equal(get('Item.0.OriginCountry.0.IdentificationCode.0._', line), 'MYS')
})

test('monetary aggregates always derive from line items (caller overrides ignored, internally consistent)', () => {
  // Pass deliberately-wrong stored totals — the builder must ignore them and
  // derive from the items, else MyInvois rejects a desynced document.
  const inv = JSON.parse(buildUblJson({
    ...baseInput,
    subtotal: 99999,
    taxTotal: 99999,
    total: 99999,
  })).Invoice[0]
  // LineExtensionAmount == Σ InvoiceLine.LineExtensionAmount (raw qty×price)
  const lineExt = Number(get('LegalMonetaryTotal.0.LineExtensionAmount.0._', inv))
  const sumLine = (inv.InvoiceLine as Array<{ LineExtensionAmount: Array<{ _: number }> }>)
    .reduce((s, l) => s + Number(l.LineExtensionAmount[0]._), 0)
  assert.equal(lineExt, sumLine, 'LineExtensionAmount equals sum of line LineExtensionAmounts')
  assert.notEqual(lineExt, 99999, 'stored subtotal override was ignored')
  // TaxTotal.TaxAmount == Σ TaxSubtotal.TaxAmount (raw Σ line tax)
  const taxAmt = Number(get('TaxTotal.0.TaxAmount.0._', inv))
  const sumSub = (inv.TaxTotal[0].TaxSubtotal as Array<{ TaxAmount: Array<{ _: number }> }>)
    .reduce((s, t) => s + Number(t.TaxAmount[0]._), 0)
  assert.equal(taxAmt, sumSub, 'TaxTotal.TaxAmount equals sum of TaxSubtotal.TaxAmounts')
  assert.notEqual(taxAmt, 99999, 'stored taxTotal override was ignored')
  // TaxExclusiveAmount == LineExtensionAmount (no allowance/charge yet)
  assert.equal(get('LegalMonetaryTotal.0.TaxExclusiveAmount.0._', inv), lineExt)
  // TaxInclusiveAmount == TaxExclusiveAmount + TaxTotal
  assert.equal(get('LegalMonetaryTotal.0.TaxInclusiveAmount.0._', inv), Number((lineExt + taxAmt).toFixed(2)))
  // PayableAmount == TaxInclusiveAmount (no prepaid/rounding yet)
  assert.equal(get('LegalMonetaryTotal.0.PayableAmount.0._', inv), get('LegalMonetaryTotal.0.TaxInclusiveAmount.0._', inv))
})

test('round-each-line-then-sum: sums match exactly even with fractional-cent lines', () => {
  // Values chosen so per-line net has >2dp before rounding (round2 truncates
  // each line), so round2(Σ) ≠ Σ round2() under the OLD full-precision-sum
  // approach. The builder must round each line first, then sum.
  const inv = JSON.parse(buildUblJson({
    ...baseInput,
    items: [
      { description: 'A', quantity: 3, unitPrice: 33.333, taxRate: 6 }, // net 99.999→100.00, tax 6.00
      { description: 'B', quantity: 7, unitPrice: 14.2857, taxRate: 6 }, // net 99.9999→100.00, tax 6.00
    ],
  })).Invoice[0]
  const lineExt = Number(get('LegalMonetaryTotal.0.LineExtensionAmount.0._', inv))
  const sumLine = (inv.InvoiceLine as Array<{ LineExtensionAmount: Array<{ _: number }> }>)
    .reduce((s, l) => s + Number(l.LineExtensionAmount[0]._), 0)
  assert.equal(lineExt, sumLine, 'document LineExtension == Σ rounded line nets (200.00)')
  assert.equal(lineExt, 200, 'each line net rounded to 100.00, sum = 200.00')
  // tax: each line 100×6%=6.00, sum 12.00
  const taxAmt = Number(get('TaxTotal.0.TaxAmount.0._', inv))
  const sumSub = (inv.TaxTotal[0].TaxSubtotal as Array<{ TaxAmount: Array<{ _: number }> }>)
    .reduce((s, t) => s + Number(t.TaxAmount[0]._), 0)
  assert.equal(taxAmt, sumSub, 'document TaxAmount == Σ rounded line taxes')
  assert.equal(taxAmt, 12, 'each line tax rounded to 6.00, sum = 12.00')
  assert.equal(Number(get('LegalMonetaryTotal.0.TaxInclusiveAmount.0._', inv)), 212)
  assert.equal(Number(get('LegalMonetaryTotal.0.PayableAmount.0._', inv)), 212)
})

test('multiple tax types: Σ TaxSubtotal.TaxAmount == TaxTotal.TaxAmount across types', () => {
  const inv = JSON.parse(buildUblJson({
    ...baseInput,
    items: [
      { description: 'sales', quantity: 1, unitPrice: 500, taxRate: 10, taxTypeCode: '01' },
      { description: 'service', quantity: 2, unitPrice: 250, taxRate: 8, taxTypeCode: '02' },
      { description: 'na', quantity: 1, unitPrice: 100, taxRate: 0, taxTypeCode: '06' },
    ],
  })).Invoice[0]
  const taxAmt = Number(get('TaxTotal.0.TaxAmount.0._', inv))
  const sumSub = (inv.TaxTotal[0].TaxSubtotal as Array<{ TaxAmount: Array<{ _: number }> }>)
    .reduce((s, t) => s + Number(t.TaxAmount[0]._), 0)
  assert.equal(taxAmt, sumSub, 'Σ TaxSubtotal.TaxAmount across types == invoice TaxAmount')
  // 50 (01) + 40 (02) + 0 (06) = 90
  assert.equal(taxAmt, 90)
})

test('document is JSON-stringifiable + minifiable (stable for digest)', () => {
  const a = buildUblJson(baseInput)
  const b = buildUblJson(baseInput)
  assert.equal(a, b, 'deterministic output (same input → same bytes)')
  // minify round-trips
  const min = JSON.stringify(JSON.parse(a))
  assert.equal(a, min, 'buildUblJson output is already pre-minified')
})