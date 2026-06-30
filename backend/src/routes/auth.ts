import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import type { AppEnv } from '../types'
import * as authService from '../services/authService'

export const auth = new Hono<AppEnv>()

// Shared response shape: { token, user: { id, email, fullName } }
// Both register and login load the profile so the frontend gets the same
// fields either way — no need for a follow-up /me call.
//
// Thrown errors propagate to app.onError → mapDomainError; no try/catch here
// (none of these handlers have a success-path deviation that onError can't
// express — they either return a parsed-validation 400 or call a service).

// POST /auth/register  { email, password, name }
auth.post('/register', async (c) => {
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(8, 'password must be at least 8 characters'),
      name: z.string().trim().min(1, 'name is required'),
    })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }
  const result = await authService.register(parsed.data)
  return c.json(result, 201)
})

// POST /auth/login  { email, password }
auth.post('/login', async (c) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }
  const result = await authService.login(parsed.data)
  return c.json(result)
})

// POST /auth/logout — stateless JWT; the client discards the token.
auth.post('/logout', (c) => c.json({ ok: true }))

// GET /auth/me  (requires Authorization: Bearer <jwt>)
auth.get('/me', requireAuth, async (c) => {
  const user = await authService.getMe(c.get('user').sub)
  return c.json({ user })
})

// PATCH /auth/me  { fullName?, companyName?, tin? } — update the supplier's
// own profile. Required before submitting to LHDN: the supplier TIN +
// company name are mandatory fields in the UBL document.
auth.patch('/me', requireAuth, async (c) => {
  const parsed = z
    .object({
      fullName: z.string().min(1).max(200).optional(),
      companyName: z.string().min(1).max(200).nullable().optional(),
      tin: z.string().min(1).max(20).nullable().optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }
  const user = await authService.updateMe(c.get('user').sub, parsed.data)
  return c.json({ user })
})

// POST /auth/reset-password  { email } — sends Supabase's reset email.
auth.post('/reset-password', async (c) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(
    await c.req.json().catch(() => ({})),
  )
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }
  await authService.requestPasswordReset(parsed.data.email)
  return c.json({ ok: true })
})

// POST /auth/update-password  { newPassword }  (authed)
auth.post('/update-password', requireAuth, async (c) => {
  const parsed = z
    .object({ newPassword: z.string().min(8, 'password must be at least 8 characters') })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400)
  }
  await authService.updatePassword(c.get('user').sub, parsed.data.newPassword)
  return c.json({ ok: true })
})