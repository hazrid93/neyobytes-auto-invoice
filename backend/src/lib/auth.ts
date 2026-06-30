import jwt from 'jsonwebtoken'
import { env } from '../env'

export interface JwtPayload {
  sub: string
  email: string
}

// Backend-issued HS256 JWT (jemput-style). The frontend authenticates with the
// backend and carries this token in `Authorization: Bearer <jwt>`; the backend
// validates it with the shared JWT_SECRET. We do NOT return or validate
// Supabase's own access tokens — the frontend never holds a Supabase token.
export function signToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, env.JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload
}
