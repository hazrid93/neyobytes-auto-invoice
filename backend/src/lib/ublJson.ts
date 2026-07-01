/**
 * UBL 2.1 JSON builder — the LHDN MyInvois JSON document variant.
 *
 * WHY JSON (not XML): the only LHDN signing documentation (the 7-step
 * "Securing JSON Files with Digital Signatures" guide + PDF) operates on the
 * JSON UBL variant (Step 1 minifies a JSON doc; Step 7 "Create the signed JSON
 * document"). The submit API accepts `format: "JSON"` (RESEARCH.md §3/§5), so
 * building the document in JSON makes the *documented* signing path applicable.
 *
 * Shape: OASIS UBL Invoice encoded as JSON with namespace prefixes (`_D`,`_A`,
 * `_B`) and every scalar wrapped as `[ { "_": <value> } ]` — mirrors the canonical
 * `docs/myinvois/invoice-v1.1-sample.json` (== the official
 * `1.1-Invoice-Sample.json` from sdk.myinvois.hasil.gov.my). The `_` convention
 * is mandated by LHDN (FAQ: "In the UBL JSON, every attribute value should be
 * paired with a key `_`").
 *
 * This builder emits ALL fields the MyInvois **Core Fields Validator** requires
 * (docs/myinvois/SDK-ANALYSIS.md §4): IssueTime, TaxCurrencyCode, the invoice-
 * level TaxSubtotal breakdown, PartyLegalEntity/RegistrationName (NOT PartyName),
 * PartyIdentification[TIN,BRN,SST,TTX], IndustryClassificationCode/MSIC
 * (supplier), structured PostalAddress (CityName + CountrySubentityCode +
 * AddressLine[] + Country), Contact/Telephone, and per-line ItemPriceExtension +
 * CommodityClassification + TaxSubtotal. Absent optional data falls back to the
 * MyInvois 'NA' convention so the document is still submittable.
 *
 * This is the UNSIGNED document. For sandbox/prod it must be signed
 * (enveloped XAdES, see lib/signing.ts) before submission.
 */
import type { BuildUblInput, InvoiceParty, PartyAddress, UblLineItem } from './myinvois'

// Every scalar UBL basic-component is wrapped as [ { "_": <value> } ]. Attributes
// sit beside "_" in the same object (e.g. { "_":"01", "listVersionID":"1.1" }).
const v = (value: string | number | boolean): Array<{ _: string | number | boolean }> => [
  { _: value },
]

/** Monetary amount: [{ _: n, currencyID }] — numbers, 2-dp (stable for digest). */
const money = (n: number, currency: string): Array<{ _: number; currencyID: string }> => [
  { _: round2(n), currencyID: currency },
]

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Normalize a party address input (structured object or legacy string) into
 *  the canonical PostalAddress pieces. Absent city/state fall back so the doc
 *  still carries the mandatory CityName + CountrySubentityCode ('NA' convention
 *  from the LHDN address table: 'NA' for AddressLine0 + state 17 = Not Applicable). */
function normalizeAddress(
  addr: PartyAddress | string | null | undefined,
  fallbackCity = '',
): {
  line1: string
  line2: string
  line3: string
  city: string
  postalZone: string
  stateCode: string
  country: string
} {
  if (addr && typeof addr === 'object') {
    const lines = [addr.line1, addr.line2, addr.line3].map((l) => (l && l.trim()) || '')
    return {
      line1: lines[0],
      line2: lines[1],
      line3: lines[2],
      city: (addr.city && addr.city.trim()) || fallbackCity,
      postalZone: (addr.postalZone && String(addr.postalZone).trim()) || '',
      stateCode: (addr.stateCode && String(addr.stateCode).trim()) || '17',
      country: (addr.country && addr.country.trim()) || 'MYS',
    }
  }
  // Legacy single-string address: shove it on line 1; city/state default.
  const line1 = (typeof addr === 'string' && addr.trim()) || ''
  return {
    line1,
    line2: '',
    line3: '',
    city: fallbackCity,
    postalZone: '',
    stateCode: '17',
    country: 'MYS',
  }
}

/** PostalAddress per the canonical sample. Always emits CityName +
 *  CountrySubentityCode + Country (mandatory). AddressLine[] is omitted when
 *  all lines are blank (the sample always has ≥1, but the validator only
 *  requires AddressLine when AddressLine0 is provided; an empty address uses
 *  the 'NA' convention). */
function postalAddress(addr: PartyAddress | string | null | undefined, fallbackCity: string) {
  const a = normalizeAddress(addr, fallbackCity)
  const out: Record<string, unknown> = {
    CityName: v(a.city),
    CountrySubentityCode: v(a.stateCode),
  }
  if (a.postalZone) out.PostalZone = v(a.postalZone)
  const lines = [a.line1, a.line2, a.line3].filter((l) => l.length > 0)
  if (lines.length > 0) {
    out.AddressLine = lines.map((l) => ({ Line: v(l) }))
  } else {
    // Mandatory AddressLine0 → emit 'NA' (the portal's own convention).
    out.AddressLine = [{ Line: v('NA') }]
  }
  out.Country = [
    {
      IdentificationCode: [{ _: a.country, listID: 'ISO3166-1', listAgencyID: '6' }],
    },
  ]
  return [out]
}

/** PartyIdentification per the canonical sample: an array of ID entries, one
 *  per scheme (TIN, BRN, SST, TTX). 'NA' when a party doesn't have the ID — the
 *  sample's convention (SST/TTX default to 'NA' when not registered). */
function partyIds(p: InvoiceParty, includeTtx: boolean) {
  const ids: Array<{ ID: Array<{ _: string; schemeID: string }> }> = [
    { ID: [{ _: p.tin, schemeID: 'TIN' }] },
    { ID: [{ _: p.brn && p.brn.trim() ? p.brn.trim() : 'NA', schemeID: p.brnScheme || 'BRN' }] },
    { ID: [{ _: p.sstNumber && p.sstNumber.trim() ? p.sstNumber.trim() : 'NA', schemeID: 'SST' }] },
  ]
  if (includeTtx) {
    ids.push({
      ID: [{ _: p.ttxNumber && p.ttxNumber.trim() ? p.ttxNumber.trim() : 'NA', schemeID: 'TTX' }],
    })
  }
  return ids
}

/** Contact (Telephone mandatory; ElectronicMail optional). */
function contact(p: InvoiceParty) {
  const out: Record<string, unknown> = {
    Telephone: v(p.phone && p.phone.trim() ? p.phone.trim() : 'NA'),
  }
  if (p.email && p.email.trim()) out.ElectronicMail = v(p.email.trim())
  return [out]
}

/** Build a UBL 2.1 Invoice as the JSON variant, matching the canonical v1.1
 *  sample structure so it passes the MyInvois Core Fields Validator. Deterministic
 *  key order (insertion order) — required so transformDocument's minify is stable. */
export function buildUblJson(input: BuildUblInput): string {
  const currency = input.currency
  const taxCurrency = input.taxCurrency || currency || 'MYR'
  const invoiceType = input.invoiceType || '01'
  const items = input.items
  const lineExt = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
  const taxTotal = items.reduce(
    (s, it) => s + it.quantity * it.unitPrice * (it.taxRate / 100),
    0,
  )
  // Always derive the monetary aggregates from the line items — never accept
  // a caller-supplied subtotal/taxTotal/total override. MyInvois rejects a
  // document where TaxTotal.TaxAmount ≠ Σ TaxSubtotal.TaxAmount or where
  // LegalMonetaryTotal.LineExtensionAmount ≠ Σ InvoiceLine.LineExtensionAmount,
  // and the per-line amounts are ALWAYS computed from raw items below (in
  // buildLine), so the invoice-level aggregates must come from the same raw
  // computation to stay consistent. (The BuildUblInput.subtotal/taxTotal/total
  // fields remain on the type for source-compat but are intentionally ignored.)
  const subtotal = lineExt
  const tax = taxTotal
  const total = lineExt + taxTotal

  // IssueTime: UTC HH:MM:SSZ. Default to now (LHDN requires issuance within 72h
  // of submission; IssueTime "must be the current time").
  const issueTime =
    input.issueTime && input.issueTime.trim()
      ? input.issueTime
      : new Date().toISOString().slice(11, 19) + 'Z'

  const supplier = input.supplier
  const customer = input.customer

  // Per-line TaxSubtotal + ItemPriceExtension (both mandatory).
  const buildLine = (it: UblLineItem, i: number) => {
    const lineNet = it.quantity * it.unitPrice
    const lineTax = lineNet * (it.taxRate / 100)
    const taxTypeCode = it.taxTypeCode || '06' // 06 = Not Applicable
    const unitCode = it.unitCode || 'C62'
    const classification = it.classification || '000'
    const originCountry = it.originCountry || 'MYS'
    return {
      ID: v(String(i + 1)),
      InvoicedQuantity: [{ _: it.quantity, unitCode }],
      LineExtensionAmount: money(lineNet, currency),
      TaxTotal: [
        {
          TaxAmount: money(lineTax, currency),
          TaxSubtotal: [
            {
              TaxableAmount: money(lineNet, currency),
              TaxAmount: money(lineTax, currency),
              Percent: v(round2(it.taxRate)),
              TaxCategory: [
                {
                  ID: v(taxTypeCode),
                  TaxScheme: [
                    {
                      ID: [{ _: 'OTH', schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      Item: [
        {
          Description: v(it.description),
          CommodityClassification: [
            { ItemClassificationCode: [{ _: classification, listID: 'CLASS' }] },
          ],
          OriginCountry: [{ IdentificationCode: v(originCountry) }],
        },
      ],
      Price: [{ PriceAmount: money(it.unitPrice, currency) }],
      ItemPriceExtension: [{ Amount: money(lineNet, currency) }],
    }
  }

  // Aggregate invoice-level TaxSubtotal by tax type (Code Validator wants the
  // breakdown; the sample has one TaxSubtotal per tax type).
  const taxByType = new Map<string, { taxable: number; tax: number; percent: number }>()
  for (const it of items) {
    const code = it.taxTypeCode || '06'
    const lineNet = it.quantity * it.unitPrice
    const lineTax = lineNet * (it.taxRate / 100)
    const cur = taxByType.get(code) ?? { taxable: 0, tax: 0, percent: round2(it.taxRate) }
    cur.taxable += lineNet
    cur.tax += lineTax
    cur.percent = round2(it.taxRate)
    taxByType.set(code, cur)
  }
  const invoiceTaxSubtotals = [...taxByType.entries()].map(([code, x]) => ({
    TaxableAmount: money(x.taxable, currency),
    TaxAmount: money(x.tax, currency),
    Percent: v(x.percent),
    TaxCategory: [
      {
        ID: v(code),
        TaxScheme: [{ ID: [{ _: 'OTH', schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }] }],
      },
    ],
  }))

  // Build the invoice object with keys in the canonical element order
  // (matches 1.1-Invoice-Sample.json), inserting optional sections only when
  // present. JS preserves string-key insertion order, so this is the on-wire
  // order after JSON.stringify.
  const invoice: Record<string, unknown> = {}
  invoice.ID = v(input.invoiceNumber)
  invoice.IssueDate = v(input.issueDate)
  invoice.IssueTime = v(issueTime)
  invoice.InvoiceTypeCode = [{ _: invoiceType, listVersionID: '1.1' }]
  invoice.DocumentCurrencyCode = v(currency)
  invoice.TaxCurrencyCode = v(taxCurrency)
  if (input.dueDate) invoice.DueDate = v(input.dueDate)
  if (input.billingReferenceUuid) {
    invoice.BillingReference = [
      { InvoiceDocumentReference: [{ ID: v(input.billingReferenceUuid) }] },
    ]
  }
  invoice.AccountingSupplierParty = [
    {
      Party: [
        {
          IndustryClassificationCode: [
            { _: supplier.msicCode || '00000', name: supplier.msicDescription || 'Not Available' },
          ],
          PartyIdentification: partyIds(supplier, true),
          PostalAddress: postalAddress(supplier.address, supplier.name),
          PartyLegalEntity: [{ RegistrationName: v(supplier.name) }],
          Contact: contact(supplier),
        },
      ],
    },
  ]
  invoice.AccountingCustomerParty = [
    {
      Party: [
        {
          PartyIdentification: partyIds(customer, true),
          PostalAddress: postalAddress(customer.address, customer.name),
          PartyLegalEntity: [{ RegistrationName: v(customer.name) }],
          Contact: contact(customer),
        },
      ],
    },
  ]
  // Payment means (PaymentMeansCode + PayeeFinancialAccount) closes the flow-2
  // "bank detail" gap. Emitted only when a code is provided (optional [0-1]).
  if (input.paymentMeansCode) {
    const pm: Record<string, unknown> = { PaymentMeansCode: v(input.paymentMeansCode) }
    if (input.paymentAccount) pm.PayeeFinancialAccount = [{ ID: v(input.paymentAccount) }]
    invoice.PaymentMeans = [pm]
  }
  if (input.paymentTerms) invoice.PaymentTerms = [{ Note: v(input.paymentTerms) }]
  invoice.TaxTotal = [
    {
      TaxAmount: money(tax, currency),
      TaxSubtotal: invoiceTaxSubtotals,
    },
  ]
  invoice.LegalMonetaryTotal = [
    {
      LineExtensionAmount: money(subtotal, currency),
      TaxExclusiveAmount: money(subtotal, currency),
      TaxInclusiveAmount: money(total, currency),
      PayableAmount: money(total, currency),
    },
  ]
  invoice.InvoiceLine = items.map(buildLine)

  const doc = {
    _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    Invoice: [invoice],
  }
  // Pre-minified (no whitespace). The submit body carries the SIGNED doc (with
  // UBLExtensions), built by signing.assembleSignedDocument; this returns the
  // bare document transformDocument will sign.
  return JSON.stringify(doc)
}