/**
 * Cross-platform element measurement for the coachmark tour.
 *
 * The jemput web version used `getBoundingClientRect()` (DOM). On native we use
 * `measureInWindow()`. This helper branches so the tour positions the spotlight
 * + bubble the same way on web and native, in window-relative coordinates.
 *
 * Returns null when the ref isn't attached or the element has no size (e.g. a
 * conditionally-rendered target) — the tour then falls back to a centered bubble.
 */
import { Platform, View } from 'react-native'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function measureElement(
  ref: React.RefObject<View | null>,
): Promise<Rect | null> {
  return new Promise((resolve) => {
    const el = ref.current as unknown as
      | (HTMLElement & { measureInWindow?: (...a: unknown[]) => void })
      | (View & { getBoundingClientRect?: () => DOMRect })
      | null
    if (!el) return resolve(null)

    if (Platform.OS === 'web') {
      // react-native-web forwards the View ref to the underlying DOM node.
      const rect = (el as HTMLElement).getBoundingClientRect?.()
      if (!rect) return resolve(null)
      resolve({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
      return
    }

    // native: measureInWindow gives screen-relative x/y + size.
    const node = el as View & { measureInWindow: (cb: (...a: number[]) => void) => void }
    node.measureInWindow((x, y, width, height) => {
      if (width === 0 && height === 0) resolve(null)
      else resolve({ x, y, width, height })
    })
  })
}