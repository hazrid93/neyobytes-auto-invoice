/**
 * useAuthGate — redirects anonymous users to /login.
 *
 * Call it at the TOP of an authenticated screen/layout (before any early
 * return), then `if (gate) return gate`. Handles the three session states:
 *   restoring     → returns null        (splash still showing; don't flash /login
 *                                        while the stored token is being checked)
 *   anonymous     → returns <Redirect>   (leaves the screen for /login)
 *   authenticated → returns null         (render the screen normally)
 *
 * The whole `(tabs)` group + the auth-only stack screens (capture / review /
 * submit / profile) use this so an anonymous user can never land on an
 * authenticated screen via the tab bar, the Capture FAB, or a direct URL.
 * (The `/` index route does its own redirect on boot; this is defense-in-depth
 * for direct navigation.)
 */
import { Redirect } from 'expo-router'
import { useSession } from '../viewmodels/useSession'

export function useAuthGate(): null | React.ReactElement {
  const { status } = useSession()
  if (status === 'restoring') return null
  if (status === 'anonymous') return <Redirect href="/login" />
  return null
}