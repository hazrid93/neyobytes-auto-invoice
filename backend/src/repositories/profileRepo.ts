/**
 * Profile repository — the supplier's own profile row (profiles.id = auth.users
 * id). Pure data access; no Hono, no zod, no business rules.
 *
 * SECURITY: the LHDN client_secret lives in `myinvois_client_secret_enc` and is
 * encrypted at rest (lib/crypto.ts). It is selected ONLY by
 * getMyInvoisCredentials() (for token fetch) — NEVER by the projections
 * returned to API consumers (getProfile/updateProfile omit that column).
 */
import { eq } from 'drizzle-orm'
import { db, requireDb } from '../db/client'
import { profiles as profilesTable } from '../db/schema'
import { classifyDbError } from '../domain/errors'
import { decrypt, encrypt } from '../lib/crypto'

export type ProfileRow = typeof profilesTable.$inferSelect

/** Safe projection for API responses — omits the encrypted secret column. */
export type SafeProfile = Omit<ProfileRow, 'myinvoisClientSecretEnc'>

export async function getProfile(userId: string): Promise<SafeProfile | undefined> {
  const q = requireDb()
  try {
    const [row] = await q
      .select({
        id: profilesTable.id,
        email: profilesTable.email,
        fullName: profilesTable.fullName,
        companyName: profilesTable.companyName,
        tin: profilesTable.tin,
        brn: profilesTable.brn,
        sstNumber: profilesTable.sstNumber,
        ttxNumber: profilesTable.ttxNumber,
        msicCode: profilesTable.msicCode,
        msicDescription: profilesTable.msicDescription,
        contactNumber: profilesTable.contactNumber,
        addressLine1: profilesTable.addressLine1,
        addressLine2: profilesTable.addressLine2,
        addressLine3: profilesTable.addressLine3,
        city: profilesTable.city,
        postalZone: profilesTable.postalZone,
        stateCode: profilesTable.stateCode,
        myinvoisClientId: profilesTable.myinvoisClientId,
        myinvoisConnectedAt: profilesTable.myinvoisConnectedAt,
        createdAt: profilesTable.createdAt,
        updatedAt: profilesTable.updatedAt,
        // NOTE: myinvoisClientSecretEnc intentionally omitted — never return to client.
      })
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
  brn?: string | null
  sstNumber?: string | null
  ttxNumber?: string | null
  msicCode?: string | null
  msicDescription?: string | null
  contactNumber?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  addressLine3?: string | null
  city?: string | null
  postalZone?: string | null
  stateCode?: string | null
}

export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<SafeProfile | undefined> {
  const q = requireDb()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.fullName !== undefined) set.fullName = patch.fullName
  if (patch.companyName !== undefined) set.companyName = patch.companyName
  if (patch.tin !== undefined) set.tin = patch.tin
  if (patch.brn !== undefined) set.brn = patch.brn
  if (patch.sstNumber !== undefined) set.sstNumber = patch.sstNumber
  if (patch.ttxNumber !== undefined) set.ttxNumber = patch.ttxNumber
  if (patch.msicCode !== undefined) set.msicCode = patch.msicCode
  if (patch.msicDescription !== undefined) set.msicDescription = patch.msicDescription
  if (patch.contactNumber !== undefined) set.contactNumber = patch.contactNumber
  if (patch.addressLine1 !== undefined) set.addressLine1 = patch.addressLine1
  if (patch.addressLine2 !== undefined) set.addressLine2 = patch.addressLine2
  if (patch.addressLine3 !== undefined) set.addressLine3 = patch.addressLine3
  if (patch.city !== undefined) set.city = patch.city
  if (patch.postalZone !== undefined) set.postalZone = patch.postalZone
  if (patch.stateCode !== undefined) set.stateCode = patch.stateCode
  try {
    const [row] = await q
      .update(profilesTable)
      .set(set)
      .where(eq(profilesTable.id, userId))
      .returning({
        id: profilesTable.id,
        email: profilesTable.email,
        fullName: profilesTable.fullName,
        companyName: profilesTable.companyName,
        tin: profilesTable.tin,
        brn: profilesTable.brn,
        sstNumber: profilesTable.sstNumber,
        ttxNumber: profilesTable.ttxNumber,
        msicCode: profilesTable.msicCode,
        msicDescription: profilesTable.msicDescription,
        contactNumber: profilesTable.contactNumber,
        addressLine1: profilesTable.addressLine1,
        addressLine2: profilesTable.addressLine2,
        addressLine3: profilesTable.addressLine3,
        city: profilesTable.city,
        postalZone: profilesTable.postalZone,
        stateCode: profilesTable.stateCode,
        myinvoisClientId: profilesTable.myinvoisClientId,
        myinvoisConnectedAt: profilesTable.myinvoisConnectedAt,
        createdAt: profilesTable.createdAt,
        updatedAt: profilesTable.updatedAt,
        // myinvoisClientSecretEnc intentionally omitted.
      })
    return row
  } catch (e) {
    throw classifyDbError(e, 'updateProfile')
  }
}

// ── LHDN MyInvois credential accessors (per-user Login-as-Taxpayer-System) ──

/** The decrypted credential pair for a user, or nulls if not connected.
 *  Reads the encrypted secret column and decrypts it. Used only by the token
 *  fetch path (lib/myinvois.ts). */
export async function getMyInvoisCredentials(
  userId: string,
): Promise<{ clientId: string | null; clientSecret: string | null }> {
  const q = requireDb()
  try {
    const [row] = await q
      .select({
        clientId: profilesTable.myinvoisClientId,
        secretEnc: profilesTable.myinvoisClientSecretEnc,
      })
      .from(profilesTable)
      .where(eq(profilesTable.id, userId))
      .limit(1)
    if (!row || !row.clientId || !row.secretEnc) {
      return { clientId: null, clientSecret: null }
    }
    return { clientId: row.clientId, clientSecret: decrypt(row.secretEnc) }
  } catch (e) {
    throw classifyDbError(e, 'getMyInvoisCredentials')
  }
}

/** Store (and encrypt) a user's LHDN client_id/client_secret, marking them
 *  connected. Overwrites any prior pair on re-connect (e.g. key rotation). */
export async function setMyInvoisCredentials(
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const q = requireDb()
  try {
    await q
      .update(profilesTable)
      .set({
        myinvoisClientId: clientId,
        myinvoisClientSecretEnc: encrypt(clientSecret),
        myinvoisConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(profilesTable.id, userId))
  } catch (e) {
    throw classifyDbError(e, 'setMyInvoisCredentials')
  }
}

/** Clear the stored LHDN credentials (disconnect). Idempotent. */
export async function clearMyInvoisCredentials(userId: string): Promise<void> {
  const q = requireDb()
  try {
    await q
      .update(profilesTable)
      .set({
        myinvoisClientId: null,
        myinvoisClientSecretEnc: null,
        myinvoisConnectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(profilesTable.id, userId))
  } catch (e) {
    throw classifyDbError(e, 'clearMyInvoisCredentials')
  }
}

/** The taxpayer's own TIN (profiles.tin) — used as the `onbehalfof` value in
 *  intermediary mode (Login as Intermediary System). null if not set. */
export async function getTaxpayerTin(userId: string): Promise<string | null> {
  const q = requireDb()
  try {
    const [row] = await q
      .select({ tin: profilesTable.tin })
      .from(profilesTable)
      .where(eq(profilesTable.id, userId))
      .limit(1)
    return row?.tin ?? null
  } catch (e) {
    throw classifyDbError(e, 'getTaxpayerTin')
  }
}