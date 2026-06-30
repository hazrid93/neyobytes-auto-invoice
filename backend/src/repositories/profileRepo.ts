/**
 * Profile repository — the supplier's own profile row (profiles.id = auth.users
 * id). Pure data access; no Hono, no zod, no business rules.
 */
import { eq } from 'drizzle-orm'
import { db, requireDb } from '../db/client'
import { profiles as profilesTable } from '../db/schema'
import { classifyDbError } from '../domain/errors'

export type ProfileRow = typeof profilesTable.$inferSelect

export async function getProfile(userId: string): Promise<ProfileRow | undefined> {
  const q = requireDb()
  try {
    const [row] = await q
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, userId))
      .limit(1)
    return row
  } catch (e) {
    throw classifyDbError(e, 'getProfile')
  }
}

// Best-effort idempotent insert on registration (direct Postgres; supabase-js
// already created the auth.users row). Mirrors the old auth.ts fallback path.
//
// IMPORTANT: this function's contract is explicitly "swallow everything". It
// runs AFTER supabase.auth.admin.createUser has committed the auth.users row,
// so a thrown error here would (a) fail registration with a 503 after the
// account exists, and (b) turn the user's retry into an `email_taken` conflict
// — orphaning the account. We therefore do NOT use requireDb() (which throws)
// and instead null-check `db` inline so the unconfigured-pooler case bails
// silently along with race/connection errors. Other repo functions deliberately
// surface throws; this is the one exception.
export async function upsertProfileOnRegister(input: {
  userId: string
  email: string
  fullName: string
}): Promise<void> {
  if (!db) {
    console.warn('[profiles] insert skipped: DATABASE_URL not set')
    return
  }
  try {
    await db
      .insert(profilesTable)
      .values({ id: input.userId, email: input.email, fullName: input.fullName })
      .onConflictDoNothing()
  } catch (e) {
    // Non-fatal: the auth.users row exists; registration still succeeds even if
    // the profile insert races or the pooler connection hiccups.
    console.warn('[profiles] insert skipped:', String((e as Error)?.message ?? e))
  }
}

export type ProfilePatch = {
  fullName?: string
  companyName?: string | null
  tin?: string | null
}

export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<ProfileRow | undefined> {
  const q = requireDb()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.fullName !== undefined) set.fullName = patch.fullName
  if (patch.companyName !== undefined) set.companyName = patch.companyName
  if (patch.tin !== undefined) set.tin = patch.tin
  try {
    const [row] = await q
      .update(profilesTable)
      .set(set)
      .where(eq(profilesTable.id, userId))
      .returning()
    return row
  } catch (e) {
    throw classifyDbError(e, 'updateProfile')
  }
}