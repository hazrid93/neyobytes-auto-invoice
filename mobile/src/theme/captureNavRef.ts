/**
 * captureNavRef — a shared ref to the Capture button in the bottom tab bar.
 *
 * The Capture button lives in (tabs)/_layout.tsx's GlassTabBar (the center
 * circle), but the Home screen's product tour needs to spotlight it. Since the
 * tab bar persists across tab switches (it's the group layout), a module-level
 * ref is the simplest way for the tour (in home.tsx) to point at the nav button
 * without threading a ref through navigation.
 *
 * Set by the tab bar: <Pressable ref={captureNavRef} ... />
 * Read by the tour: { targetRef: captureNavRef, ... }
 */
import { createRef } from 'react'
import { View } from 'react-native'

export const captureNavRef = createRef<View>()