/**
 * Session view model — the app-wide auth state. Screens consume this to know
 * whether the user is signed in + read the profile (for the supplier TIN
 * needed at submit). Owns restore-on-boot + login/register/logout flows.
 *
 * This is a singleton-context hook so any screen reads the same session.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import * as authService from '../services/authService'
import { getToken, clearToken } from '../http/tokenStore'
import type { Profile } from '../domain/dtos'

type SessionStatus = 'restoring' | 'anonymous' | 'authenticated'

interface SessionState {
  status: SessionStatus
  profile: Profile | null
  /** Only set transiently during login/register attempts. */
  loading: boolean
  error: string | null
}

interface SessionViewModel extends SessionState {
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, name: string) => Promise<boolean>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const SessionContext = createContext<SessionViewModel | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: 'restoring',
    profile: null,
    loading: false,
    error: null,
  })

  const refreshProfile = useCallback(async () => {
    const profile = await authService.getProfile()
    setState((s) => ({ ...s, profile, status: profile ? 'authenticated' : 'anonymous' }))
  }, [])

  // Restore session on boot: if a token exists, load the profile. getToken()
  // sits inside the try/catch so a storage failure (e.g. a future web stub)
  // degrades to anonymous rather than rejecting unhandled and hanging the
  // bootstrap forever in status: 'restoring'.
  useEffect(() => {
    ;(async () => {
      try {
        const token = await getToken()
        if (!token) {
          setState({ status: 'anonymous', profile: null, loading: false, error: null })
          return
        }
        const profile = await authService.getProfile()
        setState({ status: profile ? 'authenticated' : 'anonymous', profile, loading: false, error: null })
      } catch {
        // Token invalid/expired OR storage unavailable — clear + anonymous.
        // clearToken is wrapped so a storage failure can't re-hang the
        // bootstrap: setState always fires.
        try { await clearToken() } catch { /* storage unavailable */ }
        setState({ status: 'anonymous', profile: null, loading: false, error: null })
      }
    })()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const result = await authService.login({ email, password })
      setState({ status: 'authenticated', profile: result.user as Profile, loading: false, error: null })
      return true
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errMsg(e) }))
      return false
    }
  }, [])

  const register = useCallback(
    async (email: string, password: string, name: string): Promise<boolean> => {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const result = await authService.register({ email, password, name })
        setState({ status: 'authenticated', profile: result.user as Profile, loading: false, error: null })
        return true
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: errMsg(e) }))
        return false
      }
    },
    [],
  )

  const logout = useCallback(async () => {
    await authService.logout()
    setState({ status: 'anonymous', profile: null, loading: false, error: null })
  }, [])

  return (
    <SessionContext.Provider value={{ ...state, login, register, logout, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionViewModel {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>')
  return ctx
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Something went wrong.'
}