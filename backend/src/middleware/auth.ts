import { createMiddleware } from 'hono/factory'
import { verifyToken } from '../lib/auth'
import type { AppEnv } from '../types'

// Reads "Authorization: Bearer <jwt>", validates it against our JWT_SECRET
// (HS256, self-issued — not Supabase's), and attaches the user to the context.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null

  if (!token) {
    return c.json({ error: 'missing_token' }, 401)
  }

  try {
    const payload = verifyToken(token)
    c.set('user', { sub: payload.sub, email: payload.email, role: 'user' })
    await next()
  } catch {
    return c.json({ error: 'invalid_token' }, 401)
  }
})
