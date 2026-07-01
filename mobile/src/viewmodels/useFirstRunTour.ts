/**
 * useFirstRunTour — auto-open a screen's product tour the first time a user
 * lands on it, exactly once per screen.
 *
 *   const { open, handleTourOpen, handleTourClose } = useFirstRunTour('home')
 *
 *   • On mount, checks tourStore for `tour_welcome_seen_<screen>`. If unseen,
 *     `open` flips true after a short delay (so the screen's layout settles
 *     before the tour measures its targets) → the tour auto-launches.
 *   • handleTourClose marks the screen seen + closes. Reaching "Done" or
 *     "Skip" both count — we never nag again.
 *   • The user can always replay via the `?` button (handleTourOpen bypasses
 *     the seen-flag).
 *
 * One flag per screen, so we can auto-tour Home now and later auto-tour other
 * screens the first time the user reaches them, without re-touring Home.
 *
 * Storage mirrors tokenStore: localStorage on web (expo-secure-store's web
 * module is an empty stub in SDK 52), SecureStore on native.
 */
import { useEffect, useRef, useState } from 'react'
import * as SecureStore from 'expo-secure-store'

const isWeb =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

function keyFor(screen: string) {
  return `tour_welcome_seen_${screen}`
}

function hasSeen(screen: string): Promise<boolean> {
  const k = keyFor(screen)
  if (isWeb) return Promise.resolve(localStorage.getItem(k) === '1')
  return SecureStore.getItemAsync(k).then((v) => v === '1')
}

function markSeen(screen: string): Promise<void> {
  const k = keyFor(screen)
  if (isWeb) {
    localStorage.setItem(k, '1')
    return Promise.resolve()
  }
  return SecureStore.setItemAsync(k, '1')
}

export function useFirstRunTour(screen: string) {
  const [open, setOpen] = useState(false)
  // Guard against React strict-dev double-run so we never schedule two timers.
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    let cancelled = false
    hasSeen(screen).then((seen) => {
      if (cancelled || seen) return
      // let the screen's layout settle before the tour measures its targets
      const t = setTimeout(() => {
        if (!cancelled) setOpen(true)
      }, 650)
      // best-effort cleanup of the timer on unmount
      return () => clearTimeout(t)
    })
    return () => {
      cancelled = true
    }
  }, [screen])

  const handleTourOpen = () => setOpen(true)
  const handleTourClose = () => {
    setOpen(false)
    void markSeen(screen)
  }

  return { open, handleTourOpen, handleTourClose }
}