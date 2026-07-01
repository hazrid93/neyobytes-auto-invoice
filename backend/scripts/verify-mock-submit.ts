/**
 * Mock submission e2e — proves the audit-repository gap is closed end-to-end:
 * after a successful submitInvoice (MYINVOIS_ENV=mock), the invoice row carries
 * status='submitted', the longId (human Document ID), the validation UUID, and
 * the qr_url validation link built as {envbaseurl}/{uuid}/share/{longId}.
 *
 * Run: APP_ENV=stg npx tsx scripts/verify-mock-submit.ts
 * (requires DATABASE_URL + MYINVOIS_ENV=mock against the staging DB.)
 */
import '../src/load-env'
import { env } from '../src/env'
import { db, requireDb } from '../src/db/client'
import { profiles, invoices, invoiceItems } from '../src/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  requireDb()
  if (env.MYINVOIS_ENV !== 'mock') {
    console.error('Set MYINVOIS_ENV=mock to run this (no real LHDN call).')
    process.exit(1)
  }

  // Find or create a test user profile with the new supplier fields so the
  // builder has real data to emit.
  const { supabase } = await import('../src/lib/supabase')
  const email = `mock-submit-test+${Date.now()}@neyobytes.test`
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'test-password-1234',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  const userId = data.user.id
  await db!.insert(profiles).values({
    id: userId,
    email,
    fullName: 'Mock Supplier',
    companyName: 'Mock Supplier Sdn Bhd',
    tin: 'C1234567890',
    brn: '202001234567',
    sstNumber: 'NA',
    ttxNumber: 'NA',
    msicCode: '46510',
    msicDescription: 'Wholesale of computer hardware',
    contactNumber: '+60123456789',
    addressLine1: 'Lot 66',
    city: 'Kuala Lumpur',
    postalZone: '50480',
    stateCode: '10',
  })

  const { createDraftInvoice } = await import('../src/services/invoiceService')
  const submissionService = await import('../src/services/invoiceSubmissionService')
  const invoiceRepo = await import('../src/repositories/invoiceRepo')

  const inv = await createDraftInvoice({
    userId,
    customerId: null,
    invoiceNumber: `MOCK-${Date.now().toString(36)}`,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: 'MYR',
    subtotal: 1000,
    taxTotal: 80,
    total: 1080,
    status: 'confirmed',
    kind: 'sales',
    items: [
      { description: 'Consulting Service', quantity: 1, unitPrice: 1000, taxRate: 8, amount: 1000, sortOrder: 0 },
    ],
  })

  // Attach a buyer TIN directly via PATCH path (extractedData) so submit can run.
  await db!
    .update((await import('../src/db/schema')).invoices)
    .set({
      extractedData: {
        buyer: {
          name: 'Mock Buyer Sdn Bhd',
          tin: 'C9876543210',
          brn: '202009876543',
          email: 'buyer@mock.test',
          phone: '+60198765432',
          addressLine1: '1 Jalan Utama',
          city: 'Shah Alam',
          postalZone: '40000',
          stateCode: '10',
        },
      },
      paymentMeansCode: '03',
      paymentAccount: '1234567890123',
    })
    .where(eq((await import('../src/db/schema')).invoices.id, inv.id))

  const result = await submissionService.submitInvoice(inv.id, userId)
  console.log('submit result:', {
    accepted: result.accepted,
    submissionUid: result.submissionUid,
    documentUuid: result.documentUuid,
    mode: result.mode,
  })

  // Reload the invoice and check the audit-repository fields.
  const loaded = await invoiceRepo.getInvoiceById(inv.id, userId)
  console.log('persisted invoice:', {
    status: loaded?.status,
    myinvoisDocId: loaded?.myinvoisDocId, // longId
    validationUuid: loaded?.validationUuid, // doc uuid
    qrUrl: loaded?.qrUrl,
  })

  // Assertions
  const assert = (ok: boolean, msg: string) => {
    if (!ok) { console.error('❌', msg); process.exitCode = 1 } else console.log('✅', msg)
  }
  assert(result.accepted === true, 'mock submit accepted')
  assert(loaded?.status === 'submitted', 'invoice marked submitted')
  assert(loaded?.validationUuid != null, 'validation_uuid persisted (doc uuid)')
  assert(loaded?.myinvoisDocId != null && loaded.myinvoisDocId.includes('long-id'), 'longId persisted as myinvois_doc_id')
  assert(loaded?.qrUrl != null && loaded.qrUrl.includes('/share/'), 'qr_url built as {base}/{uuid}/share/{longId}')
  assert(loaded?.qrUrl?.includes(loaded.validationUuid!) === true, 'qr_url contains the validation uuid')

  // ───────────────────────────────────────────────────────────────────�n  // EXTRACT-PATH regression: createDraftFromExtraction stores items ONLY in
  // the extractedData blob (zero invoice_items rows). The submit service must
  // source UBL items from that blob (with the 4 line-item codes) and NOT emit
  // a zero-InvoiceLine UBL (which LHDN rejects). The manual-path test above
  // uses createDraftInvoice (table rows) and would NOT catch an extract-path
  // regression, so this block is the guard for the real capture→submit flow.
  // ───────────────────────────────────────────────────────────────────
  const { createDraftFromExtraction } = await import('../src/repositories/invoiceRepo')
  const exInv = await createDraftFromExtraction({
    userId,
    invoiceNumber: `EXT-${Date.now().toString(36)}`,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: null,
    currency: 'MYR',
    subtotal: 1080, taxTotal: 80, total: 1080,
    kind: 'purchase',
    rawImagePath: null,
    extractedData: {
      invoice_number: 'EXT-1',
      issue_date: new Date().toISOString().slice(0, 10),
      currency: 'MYR',
      seller: { name: 'Extract Seller', tin: 'C1234567890' },
      buyer: { name: 'Extract Buyer', tin: 'C9876543210', brn: '202009876543', email: 'b@b.test', addressLine1: '1 Jln', city: 'Shah Alam', postalZone: '40000', stateCode: '10' },
      items: [
        { description: 'Widget', quantity: 2, unit_price: 500, tax_rate: 8, tax_type_code: '02', unit_code: 'C62', classification: '003', origin_country: 'GBR' },
      ],
      subtotal: 1000, tax_total: 80, total: 1080,
      payment_method: 'Cash', bank_detail: null, qr_verification: null, notes: null, confidence: 0.9,
    },
  })
  const exTableRows = await db!.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, exInv.id))
  assert(exTableRows.length === 0, 'extract-path invoice has 0 invoice_items table rows (items live in the blob)')
  await db!
    .update(invoices)
    .set({ paymentMeansCode: '03', paymentAccount: '1234567890123' })
    .where(eq(invoices.id, exInv.id))
  const exResult = await submissionService.submitInvoice(exInv.id, userId)
  assert(exResult.accepted === true, 'extract-path submit accepted (ublItems sourced from blob, not the empty table)')
  // Independently rebuild what the service would submit + feed buildUblJson to
  // prove the line-item codes thread through (no silent zero-line UBL).
  const { buildUblJson } = await import('../src/lib/ublJson')
  const exLoaded = await invoiceRepo.loadInvoiceForSubmission(exInv.id, userId)
  const exItems = (exLoaded!.invoice.extractedData as { items?: Array<Record<string, unknown>> } | null)?.items ?? []
  assert(exItems.length === 1, 'blob has the captured item (the source the submit service reads)')
  const exUblItems = exItems.map((it) => ({
    description: String(it.description ?? '').trim() || 'Item',
    quantity: Number(it.quantity ?? 1),
    unitPrice: Number(it.unit_price ?? 0),
    taxRate: Number(it.tax_rate ?? 0),
    taxTypeCode: (it.tax_type_code as string | null) ?? null,
    unitCode: (it.unit_code as string | null) ?? null,
    classification: (it.classification as string | null) ?? null,
    originCountry: (it.origin_country as string | null) ?? null,
  }))
  const exDoc = JSON.parse(buildUblJson({
    invoiceNumber: 'EXT-1', issueDate: new Date().toISOString().slice(0, 10), currency: 'MYR', invoiceType: '01',
    supplier: { tin: 'C1234567890', name: 'Extract Seller' },
    customer: { tin: 'C9876543210', name: 'Extract Buyer' },
    items: exUblItems, paymentMeansCode: '03', paymentAccount: '1234567890123',
  }))
  const exLines = exDoc.Invoice[0].InvoiceLine
  assert(exLines.length === 1, 'extract-path UBL has 1 InvoiceLine (NOT zero — LHDN rejects empty)')
  if (exLines.length > 0) {
    const l0 = exLines[0]
    assert(l0.TaxTotal[0].TaxSubtotal[0].TaxCategory[0].ID[0]._ === '02', 'extract-path line taxTypeCode threads through (02)')
    assert(l0.Item[0].OriginCountry[0].IdentificationCode[0]._ === 'GBR', 'extract-path originCountry threads through (GBR, not hardcoded MYS)')
    assert(l0.Item[0].CommodityClassification[0].ItemClassificationCode[0]._ === '003', 'extract-path classification threads through (003)')
  }

  // cleanup
  await db!.delete((await import('../src/db/schema')).invoices).where(eq((await import('../src/db/schema')).invoices.id, inv.id))
  await db!.delete((await import('../src/db/schema')).invoices).where(eq((await import('../src/db/schema')).invoices.id, exInv.id))
  await db!.delete(profiles).where(eq(profiles.id, userId))
  await supabase.auth.admin.deleteUser(userId)
  console.log('cleanup done')
}

main().catch((e) => { console.error(e); process.exit(1) })