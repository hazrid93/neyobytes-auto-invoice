/**
 * Main app tabs — the authenticated home. A floating glass tab bar with four
 * destinations: Home (dashboard), Settings, FAQ, Contact. Auth-only stack
 * routes (capture / review / submit / profile) live OUTSIDE this group in the
 * root Stack so they render full-screen above the tabs when pushed.
 *
 * Tab-bar shape: one continuous white glass pill whose height is just the
 * small-tab height (icon + label). The center Capture button is a taller
 * white rounded bump that rises out of the bar's center — it's part of the
 * bar (the white is continuous), just taller than the surrounding tabs.
 */
import { Tabs, router } from 'expo-router'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GlassCard } from '../../theme/glass'
import { useAuthGate } from '../../components/RequireAuth'
import { useSafeInsets } from '../../theme/useSafeInsets'
import { captureNavRef } from '../../theme/captureNavRef'
import { colors, font, glass, radius, shadow, space } from '../../theme/tokens'

type TabKey = 'home' | 'settings' | 'faq' | 'contact'

const TABS: { key: TabKey; icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { key: 'home', icon: 'grid-outline', label: 'Home', href: '/(tabs)/home' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings', href: '/(tabs)/settings' },
  { key: 'faq', icon: 'help-circle-outline', label: 'FAQ', href: '/(tabs)/faq' },
  { key: 'contact', icon: 'chatbubble-outline', label: 'Contact', href: '/(tabs)/contact' },
]

/** Bar height = just a small tab (icon + label). The white pill is only this tall. */
const BAR_HEIGHT = 48
/** Diameter of the raised Capture circle that bumps above the bar. */
const CIRCLE = 54
/** Reserved column width in the bar's center for the Capture bump. */
const CAPTURE_SLOT = 76

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

/** Bottom nav: a short white glass pill (small-tab height) with the four tabs
 *  split 2–1–2, and a taller white rounded Capture circle bumping out of the
 *  bar's center (the same continuous white — just taller above the bar's top
 *  edge). Constrained to maxWidth so it stays compact + centered on desktop. */
function GlassTabBar({ state, navigation }: any) {
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

  const goCapture = () => router.push('/capture')

  return (
    <View style={[styles.tabWrap, { bottom: space.lg + bottom }]} pointerEvents="box-none">
      <View style={styles.barContainer}>
        {/* The continuous white pill — only as tall as the small tabs. */}
        <GlassCard strong style={styles.tabBar}>
          <View style={styles.tabsRow}>
            {leftTabs.map((route: any, i: number) => renderTab(route, i))}
            {/* center slot reserved for the Capture bump */}
            <View style={styles.captureSlot} />
            {rightTabs.map((route: any, i: number) => renderTab(route, i + 2))}
          </View>
        </GlassCard>

        {/* The Capture bump: a single Pressable covering the in-bar label slot
            + the protruding circle. hitSlop top extends the press target over
            the part of the circle that rises above the bar's top edge. */}
        <Pressable
          ref={captureNavRef}
          style={styles.capturePress}
          onPress={goCapture}
          hitSlop={{ top: CIRCLE, bottom: 6, left: 4, right: 4 }}
        >
          {/* "Capture" label sits in the bar's center, aligned with the other
              tab labels (both vertically centered in the bar). */}
          <Text style={styles.captureLabel} numberOfLines={1}>Capture</Text>
          {/* The raised white rounded circle — bumps above the bar's top. */}
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
    alignItems: 'center',
  },
  // ── the short white pill ──
  tabBar: {
    height: BAR_HEIGHT,
    paddingHorizontal: space.sm,
    paddingVertical: 0,
    borderRadius: radius.xl,
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
  // ── center Capture bump ──
  captureSlot: { width: CAPTURE_SLOT },
  capturePress: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -CAPTURE_SLOT / 2,
    width: CAPTURE_SLOT,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    color: colors.azure,
  },
  captureCircle: {
    position: 'absolute',
    bottom: BAR_HEIGHT / 2 + 6, // sits just above the label, rises over the bar top
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: colors.snow,
    borderColor: glass.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.cardHigh,
  },
})