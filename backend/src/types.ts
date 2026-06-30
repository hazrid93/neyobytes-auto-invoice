// Shared Hono environment types so route handlers and middleware agree on
// the variables attached to the context (e.g. the authenticated user).

export interface AuthUser {
  sub: string
  email?: string
  role: string
}

export interface AppEnv {
  Variables: {
    user: AuthUser
  }
}
