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
import { profiles } from '../src/db/schema'
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

  // cleanup
  await db!.delete((await import('../src/db/schema')).invoices).where(eq((await import('../src/db/schema')).invoices.id, inv.id))
  await db!.delete(profiles).where(eq(profiles.id, userId))
  await supabase.auth.admin.deleteUser(userId)
  console.log('cleanup done')
}

main().catch((e) => { console.error(e); process.exit(1) })