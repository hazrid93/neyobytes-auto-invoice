/**
 * Unit test for `buildSubmitItems` — the pure mapper that resolves the UBL
 * line items for submission from the extractedData blob + invoice_items table.
 *
 * WHY THIS EXISTS (not redundant with verify-ubl): the UBL builder
 * (buildUblJson) always supported the four line-item codes with defaults — it
 * was NEVER the bug. The bug was the submission-service mapping stripping the
 * codes when sourcing items from the blob. verify-ubl proves the builder
 * threads codes; THIS test proves the SERVICE passes them through, so a
 * regression that re-strips the codes here fails fast without needing a DB or
 * mock env.
 *
 * Run: npm run items:verify
 */
import '../src/load-env'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSubmitItems } from '../src/services/invoiceSubmissionService'
import type { InvoiceItemRow } from '../src/repositories/invoiceRepo'

const tableRows = (over: Partial<InvoiceItemRow> = {}): InvoiceItemRow =>
  ({
    id: '00000000-0000-0000-0000-000000000000',
    invoiceId: '00000000-0000-0000-0000-000000000000',
    description: 'Table Item',
    quantity: '5' as unknown as number,
    unitPrice: '50' as unknown as number,
    taxRate: '6' as unknown as number,
    amount: '265' as unknown as number,
    sortOrder: 0,
    ...over,
  }) as InvoiceItemRow

test('blob items carry all four LHDN codes through to UblLineItem', () => {
  const items = buildSubmitItems(
    {
      items: [
        { description: 'Widget', quantity: 2, unit_price: 500, tax_rate: 8,
          tax_type_code: '02', unit_code: 'C62', classification: '003', origin_country: 'GBR' },
      ],
    },
    [],
  )
  assert.equal(items.length, 1)
  const it = items[0]
  assert.equal(it.description, 'Widget')
  assert.equal(it.quantity, 2)
  assert.equal(it.unitPrice, 500)
  assert.equal(it.taxRate, 8)
  assert.equal(it.taxTypeCode, '02', 'taxTypeCode threads through')
  assert.equal(it.unitCode, 'C62', 'unitCode threads through')
  assert.equal(it.classification, '003', 'classification threads through')
  assert.equal(it.originCountry, 'GBR', 'originCountry threads through (not hardcoded)')
})

test('blob is preferred over the table (blob has items, table ignored)', () => {
  const items = buildSubmitItems(
    { items: [{ description: 'Blob', quantity: 1, unit_price: 10, tax_rate: 0 }] },
    tableRows({ description: 'Should be ignored' }),
  )
  assert.equal(items.length, 1)
  assert.equal(items[0].description, 'Blob')
  // table row never used → codes are null (the blob item had none)
  assert.equal(items[0].taxTypeCode, null)
})

test('table fallback used when blob has NO items (manual invoices)', () => {
  const items = buildSubmitItems({ items: [] }, [tableRows({ description: 'Manual', quantity: '3' as unknown as number, unitPrice: '7' as unknown as number, taxRate: '6' as unknown as number })])
  assert.equal(items.length, 1)
  assert.equal(items[0].description, 'Manual')
  assert.equal(items[0].quantity, 3)
  assert.equal(items[0].unitPrice, 7)
  assert.equal(items[0].taxRate, 6)
  // manual path carries no codes → undefined (builder defaults them to 06/C62/000/MYS)
  assert.equal(items[0].taxTypeCode, undefined)
  assert.equal(items[0].originCountry, undefined)
})

test('table fallback used when extractedData is null', () => {
  const items = buildSubmitItems(null, [tableRows()])
  assert.equal(items.length, 1)
  assert.equal(items[0].description, 'Table Item')
})

test('empty blob + empty table throws (never an empty InvoiceLine[] UBL)', () => {
  assert.throws(
    () => buildSubmitItems({ items: [] }, []),
    /no line items/i,
    'ValidationError thrown when neither source yields items',
  )
  assert.throws(
    () => buildSubmitItems(null, []),
    /no line items/i,
  )
})

test('stringified blob numerics coerce (line + codes kept, not dropped)', () => {
  // An older draft or manual JSONB edit could carry "2" instead of 2.
  // A plain z.number() safeParse would DROP the whole line (nuking the codes).
  const items = buildSubmitItems(
    {
      items: [
        { description: 'Coerced', quantity: '2', unit_price: '500', tax_rate: '8',
          tax_type_code: '02', classification: '003', origin_country: 'GBR' },
      ],
    },
    [],
  )
  assert.equal(items.length, 1, 'line kept (not dropped by a hard parse failure)')
  assert.equal(items[0].quantity, 2, 'stringified quantity coerced to 2')
  assert.equal(items[0].taxTypeCode, '02', 'codes preserved across coercion')
  assert.equal(items[0].originCountry, 'GBR')
})

test('a malformed blob item is skipped, valid siblings still submit', () => {
  const items = buildSubmitItems(
    {
      items: [
        { description: 'Good', quantity: 1, unit_price: 100, tax_rate: 0, tax_type_code: '06' },
        // not an object — safeParse fails, filtered out
        null as unknown as Record<string, unknown>,
        'garbage' as unknown as Record<string, unknown>,
      ],
    },
    [],
  )
  assert.equal(items.length, 1, 'only the valid item survives')
  assert.equal(items[0].description, 'Good')
  assert.equal(items[0].taxTypeCode, '06')
})

test('blank description falls back to "Item" (never an empty UBL Description)', () => {
  const items = buildSubmitItems(
    { items: [{ description: '   ', quantity: 1, unit_price: 10, tax_rate: 0 }] },
    [],
  )
  assert.equal(items[0].description, 'Item')
})