/**
 * Cross-check lockstep test — proves the THREE independent totals
 * implementations always agree, so the review screen (mobile calc.ts) shows
 * EXACTLY the totals MyInvois accepts (backend ublJson.ts) and what the DB
 * stores (backend domain/totals.ts). calc.ts's header promises it "mirrors
 * the backend UBL builder's math"; this test ENFORCES that promise.
 *
 * Each path computes tax via EN 16931 BR-CO-18 (round2 of the aggregated Σ net
 * × rate/100 per type, NOT Σ per-line rounded tax). A silent future edit to one
 * that reverts to per-line-sum tax would pass that path's own tests but fail
 * here — catching the exact bug class that previously made display ≠ submission.
 *
 * Run: npm run lockstep:verify
 */
import '../src/load-env'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeInvoiceTotals } from '../src/domain/totals'
import { buildUblJson } from '../src/lib/ublJson'
// calc.ts is import-free, so node can load it straight from the mobile tree.
import { computeTotals } from '../../mobile/src/lib/calc'

type Line = { description: string; quantity: number; unitPrice: number; taxRate: number; taxTypeCode?: string }

function backendUblTotals(items: Line[]) {
  const inv = JSON.parse(
    buildUblJson({
      invoiceNumber: 'X', issueDate: '2026-07-01', currency: 'MYR',
      supplier: { tin: 'C1111111110', name: 'S' }, customer: { tin: 'C2222222220', name: 'B' },
      items,
    }),
  ).Invoice[0]
  return {
    lineExt: Number(inv.LegalMonetaryTotal[0].LineExtensionAmount[0]._),
    tax: Number(inv.TaxTotal[0].TaxAmount[0]._),
    total: Number(inv.LegalMonetaryTotal[0].TaxInclusiveAmount[0]._),
    payable: Number(inv.LegalMonetaryTotal[0].PayableAmount[0]._),
  }
}

function assertLockstep(label: string, items: Line[]) {
  const calc = computeTotals(items.map((it) => ({ quantity: it.quantity, unit_price: it.unitPrice, tax_rate: it.taxRate, tax_type_code: it.taxTypeCode })))
  const db = computeInvoiceTotals(items.map((it) => ({ quantity: it.quantity, unitPrice: it.unitPrice, taxRate: it.taxRate })))
  const ubl = backendUblTotals(items)
  test(label, () => {
    assert.equal(calc.subtotal, ubl.lineExt, 'calc.subtotal == UBL LineExtensionAmount')
    assert.equal(calc.taxTotal, ubl.tax, 'calc.taxTotal == UBL TaxAmount')
    assert.equal(calc.total, ubl.total, 'calc.total == UBL TaxInclusiveAmount')
    assert.equal(db.subtotal, ubl.lineExt, 'DB.subtotal == UBL LineExtensionAmount')
    assert.equal(db.taxTotal, ubl.tax, 'DB.taxTotal == UBL TaxAmount')
    assert.equal(db.total, ubl.total, 'DB.total == UBL TaxInclusiveAmount')
    // the three-way invariant
    assert.equal(calc.taxTotal, db.taxTotal, 'calc.taxTotal == DB.taxTotal')
    assert.equal(calc.total, db.total, 'calc.total == DB.total')
  })
}

test('BR-CO-18 divergence case: 3×RM0.08 @6% (per-line tax rounds to 0, aggregate to 0.01)', () => {
  const items = [
    { description: 'a', quantity: 1, unitPrice: 0.08, taxRate: 6, taxTypeCode: '02' },
    { description: 'b', quantity: 1, unitPrice: 0.08, taxRate: 6, taxTypeCode: '02' },
    { description: 'c', quantity: 1, unitPrice: 0.08, taxRate: 6, taxTypeCode: '02' },
  ]
  const calc = computeTotals(items.map((it) => ({ quantity: it.quantity, unit_price: it.unitPrice, tax_rate: it.taxRate, tax_type_code: it.taxTypeCode })))
  const ubl = backendUblTotals(items)
  // per-line tax rounds to 0.00 each, but the document tax is 0.01 — all three agree on 0.01
  assert.equal(calc.taxTotal, 0.01, 'calc shows 0.01 (NOT Σ per-line 0.00)')
  assert.equal(ubl.tax, 0.01, 'UBL carries 0.01')
  assert.equal(calc.total, 0.25, 'calc total 0.25 (NOT 0.24)')
  assert.equal(ubl.total, 0.25, 'UBL total 0.25')
  assert.equal(calc.taxTotal, ubl.tax, 'lockstep')
  assert.equal(calc.total, ubl.total, 'lockstep')
})

test('same tax-type code, different rates → separate breakdown rows, each BR-CO-18', () => {
  const items = [
    { description: 'a', quantity: 1, unitPrice: 100, taxRate: 5, taxTypeCode: '04' },
    { description: 'b', quantity: 1, unitPrice: 200, taxRate: 8, taxTypeCode: '04' },
  ]
  const calc = computeTotals(items.map((it) => ({ quantity: it.quantity, unit_price: it.unitPrice, tax_rate: it.taxRate, tax_type_code: it.taxTypeCode })))
  // two distinct code:rate groups
  assert.equal(calc.breakdown.length, 2, 'two breakdown rows (keyed by code:rate)')
  assert.equal(calc.taxTotal, 21, '100×5%=5 + 200×8%=16 = 21')
  assert.equal(calc.total, 321)
  // each row's tax = round2(taxable × rate/100)
  for (const r of calc.breakdown) {
    const expected = Math.round((r.taxable + Number.EPSILON) * (r.rate / 100) * 100) / 100
    assert.equal(r.tax, expected, `row ${r.code}@${r.rate}%: tax == round2(taxable × rate/100)`)
  }
})

assertLockstep('fractional-cent multi-line (round-each-line divergence)', [
  { description: 'A', quantity: 3, unitPrice: 33.333, taxRate: 8 },
  { description: 'B', quantity: 7, unitPrice: 14.2857, taxRate: 6 },
  { description: 'C', quantity: 1, unitPrice: 55.555, taxRate: 0 },
])

assertLockstep('multiple tax types with clean values', [
  { description: 'sales', quantity: 1, unitPrice: 500, taxRate: 10, taxTypeCode: '01' },
  { description: 'service', quantity: 2, unitPrice: 250, taxRate: 8, taxTypeCode: '02' },
  { description: 'na', quantity: 1, unitPrice: 100, taxRate: 0, taxTypeCode: '06' },
])

test('≥1000-line stress: lockstep holds under accumulation (no float dust drift)', () => {
  // many fractional-cent lines across tax types — float accumulation must not
  // desync the three paths; round-each-line + BR-CO-18 keep them identical.
  const items: Line[] = []
  for (let i = 0; i < 1000; i++) {
    items.push({ description: 'x', quantity: 1, unitPrice: 0.07 + (i % 7) * 0.001, taxRate: 6, taxTypeCode: '02' })
  }
  const calc = computeTotals(items.map((it) => ({ quantity: it.quantity, unit_price: it.unitPrice, tax_rate: it.taxRate, tax_type_code: it.taxTypeCode })))
  const ubl = backendUblTotals(items)
  const db = computeInvoiceTotals(items.map((it) => ({ quantity: it.quantity, unitPrice: it.unitPrice, taxRate: it.taxRate })))
  assert.equal(calc.subtotal, ubl.lineExt)
  assert.equal(calc.taxTotal, ubl.tax)
  assert.equal(calc.total, ubl.total)
  assert.equal(calc.taxTotal, db.taxTotal)
  assert.equal(calc.total, db.total)
})