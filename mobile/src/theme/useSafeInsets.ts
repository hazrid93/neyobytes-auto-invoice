/**
 * useSafeInsets — the safe-area (status bar / notch / home indicator) insets
 * for the current device, from react-native-safe-area-context.
 *
 * On web, safe-area-context returns all-zero insets (no status bar), so adding
 * these to padding/positioning is a no-op there → no web regression, no
 * Platform.OS branches needed in screens.
 *
 * Requires <SafeAreaProvider> wrapping the app (added in _layout.tsx). Without
 * it the hook returns zeros everywhere.
 *
 * Use:
 *   const { top } = useSafeInsets()
 *   paddingTop: space.xxxl + top      // 48 on web, 48 + status-bar on native
 */
import { useSafeAreaInsets as useRNInsets } from 'react-native-safe-area-context'

export function useSafeInsets() {
  const insets = useRNInsets()
  return { top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right }
}