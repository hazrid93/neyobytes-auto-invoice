/**
 * Invoice aggregate repository — invoices + invoice_items, joined where
 * the use case needs them. Grouped by aggregate (not one-file-per-table) to
 * stay lean. Every method throws DbUnavailableError (via requireDb) or a
 * classified AppError (via classifyDbError); returns undefined for not-found.
 *
 * No Hono, no zod, no business rules — pure data access.
 */
import { eq, and, desc } from 'drizzle-orm'
import { requireDb } from '../db/client'
import {
  invoices as invoicesTable,
  invoiceItems,
  customers as customersTable,
  profiles as profilesTable,
} from '../db/schema'
import { classifyDbError } from '../domain/errors'

export type InvoiceRow = typeof invoicesTable.$inferSelect
export type InvoiceItemRow = typeof invoiceItems.$inferSelect

// ── list: summary projection (no extractedData blob) for the dashboard ──
export type InvoiceSummary = Pick<
  InvoiceRow,
  'id' | 'invoiceNumber' | 'issueDate' | 'total' | 'currency' | 'status' | 'kind' | 'createdAt'
>

export async function listInvoicesByUser(userId: string): Promise<InvoiceSummary[]> {
  const q = requireDb()
  try {
    return await q
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        issueDate: invoicesTable.issueDate,
        total: invoicesTable.total,
        currency: invoicesTable.currency,
        status: invoicesTable.status,
        kind: invoicesTable.kind,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.userId, userId))
      .orderBy(desc(invoicesTable.createdAt))
  } catch (e) {
    throw classifyDbError(e, 'listInvoices')
  }
}

export type NewInvoiceItem = {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  amount: number
  sortOrder: number
}

export type NewInvoiceInput = {
  userId: string
  customerId: string | null
  invoiceNumber: string | null
  issueDate: string | null
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  status: string
  kind: string
  rawImagePath?: string | null
  extractedData?: Record<string, unknown> | null
  items: NewInvoiceItem[]
}

// create runs invoice + items atomically in one tx. Returns the summary of the
// created invoice (no extractedData blob).
export async function createInvoice(
  input: NewInvoiceInput,
): Promise<Pick<InvoiceRow, 'id' | 'invoiceNumber' | 'total' | 'currency' | 'status' | 'createdAt'>> {
  const q = requireDb()
  const { items, ...head } = input
  try {
    return await q.transaction(async (tx) => {
      const [inv] = await tx
        .insert(invoicesTable)
        .values({
          userId: head.userId,
          customerId: head.customerId,
          invoiceNumber: head.invoiceNumber,
          issueDate: head.issueDate,
          currency: head.currency,
          subtotal: head.subtotal,
          taxTotal: head.taxTotal,
          total: head.total,
          status: head.status,
          kind: head.kind,
          rawImagePath: head.rawImagePath,
          extractedData: head.extractedData,
        })
        .returning({
          id: invoicesTable.id,
          invoiceNumber: invoicesTable.invoiceNumber,
          total: invoicesTable.total,
          currency: invoicesTable.currency,
          status: invoicesTable.status,
          createdAt: invoicesTable.createdAt,
        })

      if (items.length) {
        await tx.insert(invoiceItems).values(items.map((it) => ({ ...it, invoiceId: inv.id })))
      }
      return inv
    })
  } catch (e) {
    throw classifyDbError(e, 'createInvoice')
  }
}

// Draft from extraction: a single insert (no items) carrying the raw OCR blob.
export async function createDraftFromExtraction(input: {
  userId: string
  invoiceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  kind: string
  rawImagePath: string | null
  extractedData: Record<string, unknown>
}): Promise<{ id: string; createdAt: Date }> {
  const q = requireDb()
  try {
    const [inv] = await q
      .insert(invoicesTable)
      .values({
        userId: input.userId,
        invoiceNumber: input.invoiceNumber,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        currency: input.currency,
        subtotal: input.subtotal,
        taxTotal: input.taxTotal,
        total: input.total,
        status: 'draft',
        kind: input.kind,
        rawImagePath: input.rawImagePath,
        extractedData: input.extractedData,
      })
      .returning({ id: invoicesTable.id, createdAt: invoicesTable.createdAt })
    return inv
  } catch (e) {
    throw classifyDbError(e, 'createDraftFromExtraction')
  }
}

// ── get one: full invoice row (including extractedData) for the review screen ──
// Unlike listInvoicesByUser (a summary projection that omits the extractedData
// blob), this returns the whole row so the review/confirm screen can render the
// model's extracted fields + the persisted line items.
export async function getInvoiceById(
  invoiceId: string,
  userId: string,
): Promise<InvoiceRow | undefined> {
  const q = requireDb()
  try {
    const [row] = await q
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.userId, userId)))
      .limit(1)
    return row
  } catch (e) {
    throw classifyDbError(e, 'getInvoiceById')
  }
}

// ── update: edit a draft's scalar columns + the extractedData blob ──
// Only the keys present in `patch` are written (undefined keys are skipped so
// a partial PATCH doesn't null out untouched fields). extractedData is replaced
// wholesale when provided (the review screen sends the full edited object).
export async function updateInvoice(
  invoiceId: string,
  userId: string,
  patch: {
    invoiceNumber?: string | null
    issueDate?: string | null
    dueDate?: string | null
    currency?: string
    subtotal?: number
    taxTotal?: number
    total?: number
    extractedData?: Record<string, unknown> | null
  },
): Promise<InvoiceRow | undefined> {
  const q = requireDb()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.invoiceNumber !== undefined) set.invoiceNumber = patch.invoiceNumber
  if (patch.issueDate !== undefined) set.issueDate = patch.issueDate
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate
  if (patch.currency !== undefined) set.currency = patch.currency
  if (patch.subtotal !== undefined) set.subtotal = patch.subtotal
  if (patch.taxTotal !== undefined) set.taxTotal = patch.taxTotal
  if (patch.total !== undefined) set.total = patch.total
  if (patch.extractedData !== undefined) set.extractedData = patch.extractedData
  try {
    const [row] = await q
      .update(invoicesTable)
      .set(set)
      .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.userId, userId)))
      .returning()
    return row
  } catch (e) {
    throw classifyDbError(e, 'updateInvoice')
  }
}

// ── delete: remove an invoice (cascades to invoice_items + myinvois_submissions
// via FK onDelete: 'cascade'). Returns true if a row was actually removed. ──
export async function deleteInvoice(invoiceId: string, userId: string): Promise<boolean> {
  const q = requireDb()
  try {
    const [row] = await q
      .delete(invoicesTable)
      .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.userId, userId)))
      .returning({ id: invoicesTable.id })
    return Boolean(row)
  } catch (e) {
    throw classifyDbError(e, 'deleteInvoice')
  }
}

// The full aggregate needed for submission: invoice + items + customer + supplier.
// `customer` is narrowed to the four fields submission actually reads (TIN,
// name, email, address) so we can synthesize it from the OCR-extracted buyer
// when no `customers` row is linked — capture stores the buyer TIN/name/email
// in `extractedData.buyer` even though no customer row is created.
export interface SubmissionCustomer {
  tin: string | null
  name: string | null
  email: string | null
  address: string | null
}

export type InvoiceAggregate = {
  invoice: InvoiceRow
  items: InvoiceItemRow[]
  customer: SubmissionCustomer | null
  supplier: {
    tin: string | null
    companyName: string | null
    fullName: string | null
    email: string | null
  }
}

export async function loadInvoiceForSubmission(
  invoiceId: string,
  userId: string,
): Promise<InvoiceAggregate | undefined> {
  const q = requireDb()
  try {
    const [invoice] = await q
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.userId, userId)))
      .limit(1)
    if (!invoice) return undefined

    const items = await q
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId))
      .orderBy(invoiceItems.sortOrder)

    let customer: SubmissionCustomer | null = null
    if (invoice.customerId) {
      const [cust] = await q
        .select({
          tin: customersTable.tin,
          name: customersTable.name,
          email: customersTable.email,
          address: customersTable.address,
        })
        .from(customersTable)
        .where(and(eq(customersTable.id, invoice.customerId), eq(customersTable.userId, userId)))
        .limit(1)
      customer = cust ?? null
    }
    // Fallback: if no linked customer (or it has no TIN), use the buyer the
    // OCR stage extracted into extractedData.buyer. This is the common path —
    // a captured invoice has its buyer TIN in extractedData, not a customers row.
    if (!customer?.tin) {
      const fromExtraction = customerFromExtracted(invoice.extractedData)
      if (fromExtraction?.tin) customer = fromExtraction
    }

    const [supplier] = await q
      .select({
        tin: profilesTable.tin,
        companyName: profilesTable.companyName,
        fullName: profilesTable.fullName,
        email: profilesTable.email,
      })
      .from(profilesTable)
      .where(eq(profilesTable.id, userId))
      .limit(1)

    return {
      invoice,
      items,
      customer,
      supplier: supplier ?? { tin: null, companyName: null, fullName: null, email: null },
    }
  } catch (e) {
    throw classifyDbError(e, 'loadInvoiceForSubmission')
  }
}

// After a successful submit, mark the invoice submitted + store the LHDN doc id.
export async function markInvoiceSubmitted(invoiceId: string, myinvoisDocId: string | null): Promise<void> {
  const q = requireDb()
  try {
    await q
      .update(invoicesTable)
      .set({ status: 'submitted', myinvoisDocId, updatedAt: new Date() })
      .where(eq(invoicesTable.id, invoiceId))
  } catch (e) {
    throw classifyDbError(e, 'markInvoiceSubmitted')
  }
}

/**
 * Pull the buyer (customer) fields from an invoice's `extractedData` JSON blob.
 * The extraction stage writes `buyer: { name, tin, email, address }`; this reads
 * them defensively (the blob is `unknown`) and returns null if the shape is
 * wrong or no buyer was extracted. Used as the submission customer fallback
 * when no `customers` row is linked to the invoice.
 */
function customerFromExtracted(data: unknown): SubmissionCustomer | null {
  if (!data || typeof data !== 'object') return null
  const buyer = (data as { buyer?: unknown }).buyer
  if (!buyer || typeof buyer !== 'object') return null
  const b = buyer as {
    name?: unknown
    tin?: unknown
    email?: unknown
    address?: unknown
  }
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null
  const name = str(b.name)
  const tin = str(b.tin)
  if (!tin && !name) return null
  return {
    tin,
    name,
    email: str(b.email),
    address: str(b.address),
  }
}