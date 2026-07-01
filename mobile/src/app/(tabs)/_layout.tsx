/**
 * Main app tabs — the authenticated home. A floating glass tab bar with four
 * destinations: Home (dashboard), Settings, FAQ, Contact. Auth-only stack
 * routes (capture / review / submit / profile) live OUTSIDE this group in the
 * root Stack so they render full-screen above the tabs when pushed.
 *
 * Tab bar — NATURAL layout (no SVG, no hacks):
 *   • A flat white glass pill whose height is ONLY the small-tab height
 *     (Home/Settings/FAQ/Contact = icon + label, 48px). It never grows taller.
 *   • The Capture button is a separate, bigger white circle that floats just
 *     ABOVE the bar with a small gap. A drop shadow under it lands on the bar
 *     below, so it reads as a distinct button sitting on the bar — NOT as the
 *     bar's white background extending up to cover it. The "Capture" label sits
 *     in the bar's center, aligned with the other tab labels.
 *   • Because the Capture is absolutely positioned (a floating button), it
 *     does NOT push the bar's height taller — the bar stays exactly 48px.
 *
 * IMPORTANT: expo-router caches this layout file. After changing it you MUST
 * fully restart Expo with the cache cleared (see TESTING-FLOWS) — a hot
 * reload will keep showing the old tab bar.
 */
import { Tabs, router } from 'expo-router'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GlassCard } from '../../theme/glass'
import { useAuthGate } from '../../components/RequireAuth'
import { useSafeInsets } from '../../theme/useSafeInsets'
import { captureNavRef } from '../../theme/captureNavRef'
import { colors, font, glass, radius, space } from '../../theme/tokens'

type TabKey = 'home' | 'settings' | 'faq' | 'contact'

const TABS: { key: TabKey; icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { key: 'home', icon: 'grid-outline', label: 'Home', href: '/(tabs)/home' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings', href: '/(tabs)/settings' },
  { key: 'faq', icon: 'help-circle-outline', label: 'FAQ', href: '/(tabs)/faq' },
  { key: 'contact', icon: 'chatbubble-outline', label: 'Contact', href: '/(tabs)/contact' },
]

/** Bar height = just a small tab (icon + label). The white pill is ONLY this tall. */
const BAR_HEIGHT = 48
/** Capture circle diameter. Bigger than BAR_HEIGHT → "bigger than the rest". */
const CIRCLE = 58
/** Gap between the circle's bottom and the bar's top — gradient shows through
 *  here, so the circle is clearly a separate button, not the bar's background. */
const GAP = 10

export default function TabsLayout() {
  // Auth gate: an anonymous user tapping any tab (Settings/Home/FAQ/Contact)
  // is bounced to /login instead of seeing the authenticated screens.
  const gate = useAuthGate()
  if (gate) return gate
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GlassTabBar {...props} />}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen name="faq" options={{ title: 'FAQ' }} />
      <Tabs.Screen name="contact" options={{ title: 'Contact' }} />
    </Tabs>
  )
}

/** Bottom nav: a short flat white glass pill (4 tabs + center "Capture" label)
 *  and a bigger white Capture circle floating just above the bar's center. */
export function GlassTabBar({ state, navigation }: any) {
  const { bottom } = useSafeInsets()
  const leftTabs = state.routes.slice(0, 2)
  const rightTabs = state.routes.slice(2)

  const renderTab = (route: any, i: number) => {
    const tab = TABS[i]
    const active = state.index === i
    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={() => navigation.navigate(route.name)}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <View style={[styles.tabInner, active && styles.tabInnerActive]}>
          <Ionicons
            name={active ? (tab.icon.replace('-outline', '') as any) : tab.icon}
            size={18}
            color={active ? colors.snow : colors.slate}
          />
          <Text
            style={[styles.tabLabel, active && styles.tabLabelActive]}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={[styles.tabWrap, { bottom: space.lg + bottom }]} pointerEvents="box-none">
      <View style={styles.barContainer}>
        {/* The short flat white pill — only as tall as the small tabs. */}
        <GlassCard strong style={styles.tabBar}>
          <View style={styles.tabsRow}>
            {leftTabs.map((route: any, i: number) => renderTab(route, i))}
            {/* center slot: "Capture" label, aligned with the other tab labels */}
            <View style={styles.captureSlot}>
              <Text style={styles.captureLabel} numberOfLines={1}>Capture</Text>
            </View>
            {rightTabs.map((route: any, i: number) => renderTab(route, i + 2))}
          </View>
        </GlassCard>

        {/* Capture button: a separate white circle floating just ABOVE the bar
            (GAP of gradient shows), with a drop shadow so it reads as a button
            sitting on the bar — not as the bar's background covering it.
            Absolute → does NOT affect the bar's height (bar stays 48px). */}
        <Pressable
          ref={captureNavRef}
          style={styles.capturePress}
          onPress={() => router.push('/capture')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.captureCircle}>
            <Ionicons name="scan" size={26} color={colors.azure} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tabWrap: {
    position: 'absolute',
    bottom: space.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  barContainer: {
    position: 'relative',
    width: '100%',
    maxWidth: 460,
    height: BAR_HEIGHT,
    alignItems: 'center',
  },
  // ── short flat pill ──
  tabBar: {
    height: BAR_HEIGHT,
    paddingHorizontal: space.sm,
    borderRadius: BAR_HEIGHT / 2,
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  tabInnerActive: {
    backgroundColor: colors.azure,
  },
  tabLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    color: colors.slate,
  },
  tabLabelActive: {
    color: colors.snow,
  },
  // ── center Capture slot (label in the bar) ──
  captureSlot: { width: CIRCLE, alignItems: 'center', justifyContent: 'center' },
  captureLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    color: colors.azure,
  },
  // ── Capture circle floating above the bar ──
  capturePress: {
    position: 'absolute',
    // Circle bottom sits GAP above the bar's top edge → the gradient shows in
    // the gap, so the circle is a distinct button, not the bar's background.
    top: -(CIRCLE + GAP),
    left: '50%',
    marginLeft: -CIRCLE / 2,
    width: CIRCLE,
    height: CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
    // Higher elevation so the shadow renders above the bar's content.
    elevation: 6,
    zIndex: 5,
  },
  captureCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: colors.snow,
    borderColor: glass.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Clearly-visible drop shadow lands in the gap + on the bar below → the
    // white circle reads as a floating button, not the bar's background.
    shadowColor: colors.ink,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
})