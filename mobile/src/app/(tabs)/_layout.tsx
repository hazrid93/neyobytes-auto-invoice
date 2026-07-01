/**
 * Main app tabs — the authenticated home. A floating glass tab bar with four
 * destinations: Home (dashboard), Settings, FAQ, Contact. Auth-only stack
 * routes (capture / review / submit / profile) live OUTSIDE this group in the
 * root Stack so they render full-screen above the tabs when pushed.
 *
 * Tab-bar shape: a SHORT flat white glass pill whose height is only the
 * small-tab height (icon + label). The center Capture button is a bigger
 * white circle that floats just ABOVE the bar with a small gap (the gradient
 * shows through), so the bar's white never rises to encapsulate it — no tall
 * blob in the center. The "Capture" label sits in the bar's center, aligned
 * with the other tab labels; the circle is a distinct bump above it.
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
/** Capture circle diameter. Bigger than BAR_HEIGHT → visibly "bigger than the rest". */
const CIRCLE = 58
/** Gap between the circle's bottom and the bar's top — keeps the two whites
 *  separate (gradient shows through) so the center never reads as a tall blob. */
const GAP = 8

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

/** Bottom nav: a short flat white glass pill with the four tabs split 2–1–2,
 *  and a bigger white Capture circle floating just above the bar's center. */
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

  return (
    <View style={[styles.tabWrap, { bottom: space.lg + bottom }]} pointerEvents="box-none">
      <View style={styles.barContainer}>
        {/* Short flat white glass pill — only as tall as the small tabs. */}
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

        {/* Capture bump: a bigger white circle floating just above the bar's
            center, with a gap (gradient shows) + drop shadow so it reads as a
            distinct bump, not a tall merged blob. */}
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
    // Circle bottom sits GAP above the bar's top edge → gradient shows in the
    // gap, keeping the circle visually separate from the bar's white.
    top: -(CIRCLE + GAP),
    left: '50%',
    marginLeft: -CIRCLE / 2,
    width: CIRCLE,
    height: CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
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
    ...shadow.cardHigh,
  },
})