/**
 * myinvois_submissions audit repository. One row per submit-to-LHDN attempt,
 * including failures (status:'error') so the audit trail is complete.
 * Pure data access — no Hono, no zod, no business rules.
 */
import { eq, and, desc } from 'drizzle-orm'
import { requireDb } from '../db/client'
import { myinvoisSubmissions } from '../db/schema'
import { classifyDbError } from '../domain/errors'

export type SubmissionRow = typeof myinvoisSubmissions.$inferSelect

export type NewSubmission = {
  invoiceId: string
  userId: string
  submissionUid?: string | null
  requestBody?: Record<string, unknown> | null
  responseBody?: Record<string, unknown> | null
  httpStatus?: number | null
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'error'
  error?: string | null
}

export async function insertSubmission(input: NewSubmission): Promise<void> {
  const q = requireDb()
  try {
    await q.insert(myinvoisSubmissions).values({
      invoiceId: input.invoiceId,
      userId: input.userId,
      submissionUid: input.submissionUid ?? null,
      requestBody: input.requestBody ?? null,
      responseBody: input.responseBody ?? null,
      httpStatus: input.httpStatus ?? null,
      status: input.status,
      error: input.error ?? null,
    })
  } catch (e) {
    // An audit-write failure must never mask the real result of a submission.
    // Log and swallow — the submit service returns its own result regardless.
    console.error('[myinvois] audit write failed:', String((e as Error)?.message ?? e))
  }
}

export async function listSubmissionsForInvoice(
  invoiceId: string,
  userId: string,
): Promise<SubmissionRow[]> {
  const q = requireDb()
  try {
    return await q
      .select()
      .from(myinvoisSubmissions)
      .where(
        and(
          eq(myinvoisSubmissions.invoiceId, invoiceId),
          eq(myinvoisSubmissions.userId, userId),
        ),
      )
      .orderBy(desc(myinvoisSubmissions.createdAt))
  } catch (e) {
    throw classifyDbError(e, 'listSubmissions')
  }
}