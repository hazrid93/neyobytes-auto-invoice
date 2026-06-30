/**
 * Index route — auth gate. Redirects to /dashboard when authenticated, /login
 * otherwise. Sits under SessionProvider so it can read the session status.
 */
import { Redirect } from 'expo-router'
import { useSession } from '../viewmodels/useSession'

export default function Index() {
  const { status } = useSession()
  if (status === 'restoring') return null // splash still showing
  if (status === 'authenticated') return <Redirect href="/dashboard" />
  return <Redirect href="/login" />
}