/**
 * UBL 2.1 JSON builder — the LHDN MyInvois JSON document variant.
 *
 * WHY JSON (not XML): the only LHDN signing documentation (the 7-step
 * "Securing JSON Files with Digital Signatures" guide + PDF) operates on the
 * JSON UBL variant (Step 1 minifies a JSON doc; Step 7 "Create the signed JSON
 * document"). The submit API accepts `format: "JSON"` (RESEARCH.md §3/§5), so
 * building the document in JSON makes the *documented* signing path applicable.
 * The XML builder (buildUbl) is kept for reference but is NOT the submit path.
 *
 * Shape: OASIS UBL Invoice encoded as JSON with namespace prefixes (`_D`,`_A`,
 * `_B`) and every field wrapped as `[ { "_": "value" } ]` — mirrors the canonical
 * `docs/myinvois/invoice-v1.1-sample.json`. Use InvoiceTypeCode listVersionID
 * "1.1" (per RESEARCH.md §5).
 *
 * This is the UNSIGNED document. For sandbox/prod it must be signed
 * (enveloped XAdES, see lib/signing.ts) before submission.
 */
import type { BuildUblInput } from './myinvois'

// Every scalar UBL basic-component is wrapped as [ { "_": <value> } ]. Attributes
// sit beside "_" in the same object (e.g. { "_":"01", "listVersionID":"1.1" }).
const v = (value: string | number | boolean): Array<{ _: string | number | boolean }> => [{ _: value }]

/** Build a minimal-but-valid UBL 2.1 Invoice as the JSON variant. Deterministic
 *  key order (insertion order) — required so transformDocument's minify is stable. */
export function buildUblJson(input: BuildUblInput): string {
  const currency = input.currency
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

  // Monetary amounts are emitted as numbers (the canonical sample uses numbers,
  // e.g. "Amount":[{"_":100,"currencyID":"MYR"}]). 2-dp keeps them stable across
  // re-serialization, which matters for the document digest.
  const money = (n: number, c: string = currency) => [{ _: round2(n), currencyID: c }]

  const invoice: Record<string, unknown> = {
    ID: v(input.invoiceNumber),
    IssueDate: v(input.issueDate),
    InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
    DocumentCurrencyCode: v(currency),
    AccountingSupplierParty: [
      {
        Party: [
          {
            PartyIdentification: [
              { ID: [{ _: input.supplier.tin, schemeID: 'TIN' }] },
            ],
            PartyName: [{ Name: v(input.supplier.name) }],
            PostalAddress: [
              {
                StreetName: v(input.supplier.address ?? 'Malaysia'),
                Country: [{ IdentificationCode: v('MYS') }],
              },
            ],
            PartyTaxScheme: [
              { CompanyID: v(input.supplier.tin), TaxScheme: [{ ID: v('TAX') }] },
            ],
          },
        ],
      },
    ],
    AccountingCustomerParty: [
      {
        Party: [
          {
            PartyIdentification: [
              { ID: [{ _: input.customer.tin, schemeID: 'TIN' }] },
            ],
            PartyName: [{ Name: v(input.customer.name) }],
            PostalAddress: [
              {
                StreetName: v(input.customer.address ?? 'Malaysia'),
                Country: [{ IdentificationCode: v('MYS') }],
              },
            ],
          },
        ],
      },
    ],
    TaxTotal: [{ TaxAmount: money(tax) }],
    LegalMonetaryTotal: [
      {
        LineExtensionAmount: money(subtotal),
        TaxExclusiveAmount: money(subtotal),
        TaxInclusiveAmount: money(total),
        PayableAmount: money(total),
      },
    ],
    InvoiceLine: items.map((it, i) => {
      const lineNet = it.quantity * it.unitPrice
      const lineTax = lineNet * (it.taxRate / 100)
      return {
        ID: v(String(i + 1)),
        InvoicedQuantity: [{ _: it.quantity, unitCode: 'C62' }],
        LineExtensionAmount: money(lineNet),
        TaxTotal: [{ TaxAmount: money(lineTax) }],
        Item: [{ Description: v(it.description), Name: v(it.description) }],
        Price: [{ PriceAmount: money(it.unitPrice) }],
      }
    }),
  }
  if (input.dueDate) invoice.DueDate = v(input.dueDate)

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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}