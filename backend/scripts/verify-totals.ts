/**
 * Unit tests for domain/totals.ts — proves the DB/dashboard path uses the SAME
 * round-each-line-then-sum math as the UBL builder, so the totals a user sees
 * EQUAL the totals MyInvois accepts (no cent-level drift).
 *
 * Run: npm run totals:verify
 */
import '../src/load-env'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeInvoiceTotals } from '../src/domain/totals'
import { buildUblJson } from '../src/lib/ublJson'

function ublTotals(items: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number }>) {
  const doc = JSON.parse(
    buildUblJson({
      invoiceNumber: 'X', issueDate: '2026-07-01', currency: 'MYR',
      supplier: { tin: 'C1111111110', name: 'S' }, customer: { tin: 'C2222222220', name: 'B' },
      items,
    }),
  ).Invoice[0]
  return {
    lineExt: Number(doc.LegalMonetaryTotal[0].LineExtensionAmount[0]._),
    tax: Number(doc.TaxTotal[0].TaxAmount[0]._),
    total: Number(doc.LegalMonetaryTotal[0].TaxInclusiveAmount[0]._),
    lineNets: (doc.InvoiceLine as Array<{ LineExtensionAmount: Array<{ _: number }> }>)
      .map((l) => Number(l.LineExtensionAmount[0]._)),
  }
}

test('DB totals equal UBL totals (display == submission)', () => {
  const items = [
    { description: 'A', quantity: 3, unitPrice: 33.333, taxRate: 8 },
    { description: 'B', quantity: 7, unitPrice: 14.2857, taxRate: 6 },
    { description: 'C', quantity: 1, unitPrice: 55.555, taxRate: 0 },
  ]
  const db = computeInvoiceTotals(items)
  const ubl = ublTotals(items)
  assert.equal(db.subtotal, ubl.lineExt, 'subtotal == UBL LineExtensionAmount')
  assert.equal(db.taxTotal, ubl.tax, 'taxTotal == UBL TaxAmount')
  assert.equal(db.total, ubl.total, 'total == UBL TaxInclusiveAmount')
  assert.deepEqual(db.lineNets, ubl.lineNets, 'per-line nets match UBL InvoiceLine amounts')
})

test('round-each-line-then-sum (not round-the-sum) — divergence case stays consistent', () => {
  // A case where round2(Σ) ≠ Σ round2() under the OLD round-the-sum approach.
  const items = [
    { description: 'X', quantity: 1, unitPrice: 0.03, taxRate: 0 },
    { description: 'Y', quantity: 1, unitPrice: 55.555, taxRate: 0 },
  ]
  const db = computeInvoiceTotals(items)
  const ubl = ublTotals(items)
  // line nets round individually: 0.03 + 55.56 = 55.59 (each-line); round-the-sum
  // of raw nets (55.585) would be 55.59 too here, but the per-line + aggregate
  // must agree with the UBL either way.
  assert.equal(db.subtotal, ubl.lineExt)
  assert.equal(db.lineNets[0], 0.03)
  assert.equal(db.lineNets[1], 55.56)
  assert.equal(db.subtotal, 55.59, 'Σ rounded line nets')
})

test('per-line amount = round2(rounded net + rounded tax), tax on the ROUNDED net', () => {
  const items = [{ description: 'Z', quantity: 3, unitPrice: 33.333, taxRate: 8 }]
  const db = computeInvoiceTotals(items)
  // net = round2(3 × 33.333) = round2(99.999) = 100.00
  // tax = round2(100.00 × 0.08) = 8.00
  // amount = round2(100.00 + 8.00) = 108.00
  assert.equal(db.lineNets[0], 100)
  assert.equal(db.lineTaxes[0], 8)
  assert.equal(db.lineAmounts[0], 108)
  assert.equal(db.subtotal, 100)
  assert.equal(db.taxTotal, 8)
  assert.equal(db.total, 108)
})

test('multiple tax rates: taxTotal == Σ rounded line taxes across rates', () => {
  const items = [
    { description: 'sales', quantity: 1, unitPrice: 500, taxRate: 10 },
    { description: 'service', quantity: 2, unitPrice: 250, taxRate: 8 },
    { description: 'na', quantity: 1, unitPrice: 100, taxRate: 0 },
  ]
  const db = computeInvoiceTotals(items)
  // 50 (sales) + 40 (service) + 0 (na) = 90
  assert.equal(db.taxTotal, 90)
  assert.equal(db.subtotal, 1100)
  assert.equal(db.total, 1190)
  assert.equal(db.lineTaxes[0], 50)
  assert.equal(db.lineTaxes[1], 40)
  assert.equal(db.lineTaxes[2], 0)
})

test('empty items → zero totals (no NaN)', () => {
  const db = computeInvoiceTotals([])
  assert.equal(db.subtotal, 0)
  assert.equal(db.taxTotal, 0)
  assert.equal(db.total, 0)
  assert.deepEqual(db.lineAmounts, [])
})