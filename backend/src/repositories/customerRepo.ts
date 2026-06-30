/**
 * Customer aggregate repository. Pure data access — throws DbUnavailableError
 * (via requireDb) or a classified AppError; returns undefined for not-found.
 * No Hono, no zod, no business rules.
 */
import { eq, and } from 'drizzle-orm'
import { requireDb } from '../db/client'
import { customers as customersTable } from '../db/schema'
import { classifyDbError } from '../domain/errors'

export type CustomerRow = typeof customersTable.$inferSelect

export async function findCustomerForUser(
  customerId: string,
  userId: string,
): Promise<CustomerRow | undefined> {
  const q = requireDb()
  try {
    const [row] = await q
      .select()
      .from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.userId, userId)))
      .limit(1)
    return row
  } catch (e) {
    throw classifyDbError(e, 'findCustomer')
  }
}

/** Cache a successful TIN validation timestamp. */
export async function markTinValidated(customerId: string): Promise<void> {
  const q = requireDb()
  try {
    await q
      .update(customersTable)
      .set({ tinValidatedAt: new Date() })
      .where(eq(customersTable.id, customerId))
  } catch (e) {
    throw classifyDbError(e, 'markTinValidated')
  }
}