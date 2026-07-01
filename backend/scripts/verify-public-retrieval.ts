/**
 * Public retrieval e2e — proves the flow-1 customer retrieval loop works:
 * after a mock submit populates longId + validation_uuid, an UNAUTHENTICATED
 * GET /public/invoices/:ref returns the public invoice view (by longId OR uuid),
 * and POST /public/invoices/qr resolves a scanned validation link.
 *
 * Run: APP_ENV=stg MYINVOIS_ENV=mock npx tsx scripts/verify-public-retrieval.ts
 */
import '../src/load-env'
import { env } from '../src/env'
import { db, requireDb } from '../src/db/client'
import { profiles, invoices as invoicesTable } from '../src/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  requireDb()
  if (env.MYINVOIS_ENV !== 'mock') {
    console.error('Set MYINVOIS_ENV=mock.')
    process.exit(1)
  }
  const { supabase } = await import('../src/lib/supabase')
  const email = `pub-retrieve-test+${Date.now()}@neyobytes.test`
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: 'test-password-1234', email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  const userId = data.user.id
  await db!.insert(profiles).values({
    id: userId, email, fullName: 'Pub Retrieve Supplier', companyName: 'Pub Retrieve Sdn Bhd',
    tin: 'C1234567890', brn: '202001234567',
  })

  const { createDraftInvoice } = await import('../src/services/invoiceService')
  const submissionService = await import('../src/services/invoiceSubmissionService')
  const inv = await createDraftInvoice({
    userId, customerId: null, invoiceNumber: `PUB-${Date.now().toString(36)}`,
    issueDate: new Date().toISOString().slice(0, 10), currency: 'MYR',
    subtotal: 1000, taxTotal: 80, total: 1080, status: 'confirmed', kind: 'sales',
    items: [{ description: 'Service', quantity: 1, unitPrice: 1000, taxRate: 8, amount: 1000, sortOrder: 0 }],
  })
  await db!.update(invoicesTable).set({
    extractedData: { buyer: { name: 'Pub Buyer Sdn Bhd', tin: 'C9876543210' } },
  }).where(eq(invoicesTable.id, inv.id))

  const result = await submissionService.submitInvoice(inv.id, userId)
  if (!result.accepted) throw new Error('mock submit not accepted')

  // Reload to get the persisted longId + qrUrl.
  const { getInvoiceById } = await import('../src/repositories/invoiceRepo')
  const submitted = await getInvoiceById(inv.id, userId)
  const longId = submitted?.myinvoisDocId
  const uuid = submitted?.validationUuid
  const qrUrl = submitted?.qrUrl
  console.log('submitted:', { longId, uuid, qrUrl })

  const base = `http://localhost:${env.PORT}`
  const assert = (ok: boolean, msg: string) => {
    if (!ok) { console.error('❌', msg); process.exitCode = 1 } else console.log('✅', msg)
  }

  // 1. GET /public/invoices/:longId (unauthenticated)
  const r1 = await fetch(`${base}/public/invoices/${encodeURIComponent(longId!)}`)
  assert(r1.status === 200, `GET by longId → 200 (got ${r1.status})`)
  const j1 = await r1.json()
  assert(j1.invoice.supplierName === 'Pub Retrieve Sdn Bhd', 'public view exposes supplier name')
  assert(j1.invoice.supplierTin === 'C1234567890', 'public view exposes supplier TIN')
  assert(j1.invoice.supplierBrn === '202001234567', 'public view exposes supplier SSM/BRN')
  assert(j1.invoice.buyerName === 'Pub Buyer Sdn Bhd', 'public view exposes buyer name')
  assert(j1.invoice.documentId === longId, 'documentId == longId')
  assert(j1.invoice.validationUuid === uuid, 'validationUuid present')
  assert(j1.invoice.qrUrl === qrUrl, 'qrUrl present')
  assert(j1.invoice.items.length === 1, 'items present')
  assert(!('extractedData' in j1.invoice), 'raw extractedData NOT exposed')

  // 2. GET /public/invoices/:uuid (unauthenticated)
  const r2 = await fetch(`${base}/public/invoices/${uuid!}`)
  assert(r2.status === 200, `GET by uuid → 200 (got ${r2.status})`)

  // 3. POST /public/invoices/qr with the full validation link
  const r3 = await fetch(`${base}/public/invoices/qr`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr: qrUrl }),
  })
  assert(r3.status === 200, `POST qr with link → 200 (got ${r3.status})`)
  const j3 = await r3.json()
  assert(j3.invoice.documentId === longId, 'qr decode resolves to the invoice')

  // 4. Not-found
  const r4 = await fetch(`${base}/public/invoices/does-not-exist`)
  assert(r4.status === 404, 'unknown ref → 404')

  // cleanup
  await db!.delete(invoicesTable).where(eq(invoicesTable.id, inv.id))
  await db!.delete(profiles).where(eq(profiles.id, userId))
  await supabase.auth.admin.deleteUser(userId)
  console.log('cleanup done')
}

main().catch((e) => { console.error(e); process.exit(1) })