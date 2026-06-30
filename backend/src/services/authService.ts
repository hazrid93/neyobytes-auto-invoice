/**
 * Auth service — register / login / getProfile / updateProfile / password
 * flows. Orchestrates the Supabase Auth admin client (credential verify) +
 * the profile repo (our own profile row) + JWT signing.
 *
 * - Standard failures → throw AppError (route/global-onError maps to JSON).
 * - Supabase credential mismatches and admin errors → ConflictError /
 *   ValidationError / ExternalError('supabase') as appropriate.
 */
import { supabase } from '../lib/supabase'
import { signToken } from '../lib/auth'
import { env } from '../env'
import {
  getProfile,
  upsertProfileOnRegister,
  updateProfile,
  type ProfilePatch,
  type ProfileRow,
} from '../repositories/profileRepo'
import {
  ConflictError,
  ValidationError,
  UnauthorizedError,
  ExternalError,
  DbUnavailableError,
} from '../domain/errors'

export interface AuthUserView {
  id: string
  email: string
  fullName: string | null
}

async function loadUserView(userId: string, fallbackEmail?: string): Promise<AuthUserView> {
  // Non-fatal profile read. register() calls us AFTER supabase.auth.admin.
  //createUser has committed the auth.users row, and login() calls us after
  // credentials are verified. If the pooler is unconfigured (or briefly
  // unreachable), throwing here would (a) fail registration with 503 after the
  // account exists — turning the client's retry into `email_taken` and
  // orphaning the account, and (b) turn a verified-credential login into 503.
  // `upsertProfileOnRegister` already swallows such errors for the write; this
  // mirrors it for the read so the JWT + fallback identity still ship.
  let profile: Awaited<ReturnType<typeof getProfile>> = undefined
  try {
    profile = await getProfile(userId)
  } catch (e) {
    if (!(e instanceof DbUnavailableError)) throw e
    console.warn('[auth] profile load skipped:', String((e as Error)?.message ?? e))
  }
  return {
    id: userId,
    email: profile?.email ?? fallbackEmail ?? '',
    fullName: profile?.fullName ?? null,
  }
}

export interface RegisterInput {
  email: string
  password: string
  name: string
}

export interface AuthResult {
  token: string
  user: AuthUserView
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  // Create the Supabase auth user (service role). email_confirm=true so dev
  // login works immediately — turn this off + send a verify email for prod.
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists')) {
      throw new ConflictError('email_taken', error.message)
    }
    throw new ValidationError(error.message)
  }
  const userId = created.user!.id

  // Best-effort profile row (direct Postgres). Registration still succeeds
  // (and returns a token) if the pooler isn't configured yet — the repo's
  // upsert swallows db failures by design.
  await upsertProfileOnRegister({ userId, email: input.email, fullName: input.name })

  const token = signToken(userId, input.email)
  const user = await loadUserView(userId, input.email)
  return { token, user }
}

export interface LoginInput {
  email: string
  password: string
}

export async function login(input: LoginInput): Promise<AuthResult> {
  // Verify credentials against Supabase Auth. We discard its session — the
  // frontend carries our JWT, not Supabase's access token.
  const { data, error } = await supabase.auth.signInWithPassword(input)
  if (error || !data.user) {
    throw new UnauthorizedError('invalid_credentials', 'Email or password is incorrect')
  }
  const userId = data.user.id
  const token = signToken(userId, input.email)
  const user = await loadUserView(userId, input.email)
  return { token, user }
}

export async function getMe(userId: string): Promise<ProfileRow | null> {
  return (await getProfile(userId)) ?? null
}

export async function updateMe(
  userId: string,
  patch: ProfilePatch,
): Promise<ProfileRow | undefined> {
  return updateProfile(userId, patch)
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    env.APP_URL ? { redirectTo: `${env.APP_URL}/reset-password` } : undefined,
  )
  if (error) throw new ExternalError('supabase', error.message, 400)
  // Always return ok to avoid leaking which emails exist.
}

export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) throw new ExternalError('supabase', error.message, 400)
}