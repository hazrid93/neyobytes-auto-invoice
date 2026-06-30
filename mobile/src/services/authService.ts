/**
 * Auth service — the only place that calls the /auth endpoints. View models
 * consume these and map to screen state; they never touch http/client directly.
 */
import { request } from '../http/client'
import { setToken, clearToken } from '../http/tokenStore'
import type { AuthResult, Profile } from '../domain/dtos'

export interface RegisterInput {
  email: string
  password: string
  name: string
}
export interface LoginInput {
  email: string
  password: string
}

/** Register + persist the issued JWT to secure storage. */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const result = await request<AuthResult>('/auth/register', {
    method: 'POST',
    body: input,
  })
  await setToken(result.token)
  return result
}

/** Login + persist the issued JWT to secure storage. */
export async function login(input: LoginInput): Promise<AuthResult> {
  const result = await request<AuthResult>('/auth/login', { method: 'POST', body: input })
  await setToken(result.token)
  return result
}

/** Stateless logout — clear the local token. */
export async function logout(): Promise<void> {
  await clearToken()
}

export async function getProfile(): Promise<Profile | null> {
  const { user } = await request<{ user: Profile | null }>('/auth/me')
  return user
}

export interface ProfilePatch {
  fullName?: string
  companyName?: string | null
  tin?: string | null
}

export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const { user } = await request<{ user: Profile }>('/auth/me', { method: 'PATCH', body: patch })
  return user
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request<{ ok: boolean }>('/auth/reset-password', {
    method: 'POST',
    body: { email },
  })
}