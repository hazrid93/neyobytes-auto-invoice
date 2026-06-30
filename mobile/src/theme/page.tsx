/**
 * PageContainer — the shared width + centering wrapper for screen content.
 *
 * On desktop the app would otherwise stretch edge-to-edge (just
 * `paddingHorizontal`). This wraps content in a centered column with a
 * max-width + horizontal padding so every screen reads as a focused app
 * column on large screens, and full-width-with-padding on phones.
 *
 * Drop it inside a ScrollView/FlatList contentContainerStyle as the single
 * child (or wrap each screen's body). Horizontal padding lives HERE so screens
 * don't each reinvent it.
 */
import { View, StyleSheet, type ViewStyle } from 'react-native'
import { space } from './tokens'

const MAX_WIDTH = 680

export function PageContainer({
  children,
  style,
  gap,
}: {
  children: React.ReactNode
  style?: ViewStyle
  gap?: number
}) {
  return (
    <View style={[styles.page, style]}>
      <View style={[styles.inner, gap != null && { gap }]}>{children}</View>
    </View>
  )
}

// Shared contentContainer padding for screens that use a raw ScrollView/FlatList
// (instead of <PageContainer>) — keeps the column centered + padded identically.
export const pageContentStyle: ViewStyle = {
  maxWidth: MAX_WIDTH,
  width: '100%',
  alignSelf: 'center' as const,
  paddingHorizontal: space.xl,
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    alignItems: 'center',
    width: '100%',
  },
  inner: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    paddingHorizontal: space.xl,
  },
})