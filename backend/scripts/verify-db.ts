// Verifies the Drizzle schema matches the migrated Supabase tables and that
// the transaction path (invoice + items) works against the live pooler.
// Run:  npm run db:verify   (uses .env.local/.env.stg/.env.prod via load-env; APP_ENV picks which)
import '../src/load-env'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { profiles, customers, invoices, invoiceItems } from '../src/db/schema'
import { supabase } from '../src/lib/supabase'

let passed = 0
let failed = 0
const ok = (m: string) => {
  passed++
  console.log(`  ✅ ${m}`)
}
const bad = (m: string, e?: unknown) => {
  failed++
  console.error(`  ❌ ${m}: ${e ? String((e as Error)?.message ?? e) : ''}`)
}

async function main() {
  if (!db) {
    console.error('❌ DATABASE_URL not set — cannot verify. Set it in .env.local/.env.stg/.env.prod and retry.')
    process.exit(1)
  }

  console.log('\n1) Schema match — real SELECT against each table:')
  try {
    await db.select().from(profiles).limit(1)
    ok('profiles')
  } catch (e) {
    bad('profiles', e)
  }
  try {
    await db.select().from(customers).limit(1)
    ok('customers')
  } catch (e) {
    bad('customers', e)
  }
  try {
    await db.select().from(invoices).limit(1)
    ok('invoices')
  } catch (e) {
    bad('invoices', e)
  }
  try {
    await db.select().from(invoiceItems).limit(1)
    ok('invoice_items')
  } catch (e) {
    bad('invoice_items', e)
  }

  console.log('\n2) Column-shape probe (catches silent rename/type drift):')
  try {
    const row = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        total: invoices.total,
        currency: invoices.currency,
        status: invoices.status,
        kind: invoices.kind,
        issueDate: invoices.issueDate,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .limit(1)
    ok(`invoices column probe (${row.length} row)`)
  } catch (e) {
    bad('invoices column probe', e)
  }
  try {
    const row = await db
      .select({
        description: invoiceItems.description,
        quantity: invoiceItems.quantity,
        unitPrice: invoiceItems.unitPrice,
        taxRate: invoiceItems.taxRate,
        amount: invoiceItems.amount,
        sortOrder: invoiceItems.sortOrder,
      })
      .from(invoiceItems)
      .limit(1)
    ok(`invoice_items column probe (${row.length} row)`)
  } catch (e) {
    bad('invoice_items column probe', e)
  }

  console.log('\n3) Round-trip write (insert → read → delete) via db.transaction():')
  const email = `verify-${Date.now()}@test.neyobytes.local`
  let userId: string | null = null
  try {
    const { data: u, error } = await supabase.auth.admin.createUser({
      email,
      password: 'verify-test-1234',
      email_confirm: true,
    })
    if (error || !u.user) throw new Error(error?.message ?? 'createUser returned no user')
    userId = u.user.id

    await db.insert(profiles).values({ id: userId, email })
    ok('insert profile (FK to auth.users valid)')

    const created = await db.transaction(async (tx) => {
      const [inv] = await tx
        .insert(invoices)
        .values({
          userId,
          invoiceNumber: 'VERIFY-001',
          currency: 'MYR',
          subtotal: 100,
          taxTotal: 8,
          total: 108,
          status: 'draft',
          kind: 'sales',
        })
        .returning({ id: invoices.id, total: invoices.total })
      await tx.insert(invoiceItems).values({
        invoiceId: inv.id,
        description: 'verify line',
        quantity: 2,
        unitPrice: 50,
        taxRate: 8,
        amount: 108,
        sortOrder: 0,
      })
      const items = await tx.select().from(invoiceItems).where(sql`invoice_id = ${inv.id}`)
      return { invId: inv.id, total: inv.total, itemCount: items.length }
    })
    ok(`transaction committed: invoice ${created.invId} total=${created.total}, items=${created.itemCount}`)

    const back = await db
      .select({ total: invoices.total, status: invoices.status })
      .from(invoices)
      .where(sql`id = ${created.invId}`)
    if (back.length === 1 && back[0].status === 'draft') ok('read-back matches')
    else bad('read-back mismatch', new Error(JSON.stringify(back)))

    // Runtime type check: money() must yield a real JS number, not the string
    // postgres-js would otherwise return for numeric columns. This is the
    // regression guard for swapping money() back to numeric().$type<number>().
    const t = typeof back[0].total
    if (t === 'number') ok(`invoices.total is number (${back[0].total}) — money() works`)
    else bad(`invoices.total is ${t} (${JSON.stringify(back[0].total)}) — money() regression`)
  } catch (e) {
    bad('round-trip write', e)
  } finally {
    if (userId) {
      try {
        await supabase.auth.admin.deleteUser(userId)
        ok('cleanup: deleted throwaway auth user (cascades invoice/items/profile)')
      } catch (e) {
        bad('cleanup failed — orphaned test user may remain', e)
      }
    }
  }

  console.log(`\n────────────────────────────────────────`)
  console.log(`  PASS=${passed}  FAIL=${failed}`)
  console.log(`────────────────────────────────────────`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error('verify crashed:', e)
  process.exit(1)
})
