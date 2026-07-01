/**
 * Main app tabs — the authenticated home. A floating glass tab bar with four
 * destinations: Home (dashboard), Settings, FAQ, Contact. Auth-only stack
 * routes (capture / review / submit / profile) live OUTSIDE this group in the
 * root Stack so they render full-screen above the tabs when pushed.
 *
 * Tab bar — NOTCHED-BUMP layout (`---/-\--`), no SVG:
 *   • A flat white glass pill whose height is ONLY the small-tab height
 *     (Home/Settings/FAQ/Contact = icon + label, 48px) on the left and right.
 *     It NEVER grows taller — so the eye reads a SHORT bar with a bump, not a
 *     tall blob.
 *   • The Capture button is a bigger white circle (58px) whose CENTER sits on
 *     the bar's top edge. Its bottom half overlaps the bar (white-on-white →
 *     merges seamlessly, no seam) and its top half rises 29px above the bar
 *     as the `/-\` bump against the page gradient. The bump silhouette + the
 *     blue scan icon read as a circular button that is PART of the bar — not
 *     floating above it. No text label (the bump is icon-only).
 *   • Absolute positioning → the circle does NOT push the bar taller.
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
import { colors, font, radius, space } from '../../theme/tokens'

type TabKey = 'home' | 'settings' | 'faq' | 'contact'

const TABS: { key: TabKey; icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { key: 'home', icon: 'grid-outline', label: 'Home', href: '/(tabs)/home' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings', href: '/(tabs)/settings' },
  { key: 'faq', icon: 'help-circle-outline', label: 'FAQ', href: '/(tabs)/faq' },
  { key: 'contact', icon: 'chatbubble-outline', label: 'Contact', href: '/(tabs)/contact' },
]

/** Bar height = a small tab stacked vertically (icon over label). Taller than
 *  the old 48px side-by-side so the icon + label both fit without clipping;
 *  still a compact pill on the left/right, only the center bump rises. */
const BAR_HEIGHT = 56
/** Capture circle diameter. Bigger than BAR_HEIGHT → the `/-\` bump rises
 *  CIRCLE/2 (=29px) above the bar; its bottom half merges into the bar. */
const CIRCLE = 58

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

/** Bottom nav: a short flat white glass pill (4 side tabs + a center gap for
 *  the bump) and a bigger white Capture circle whose center sits on the bar's
 *  top edge — bottom half merges into the bar, top half rises as the bump. */
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
        {/* The short flat white pill — only as tall as the small tabs.
            The center gap reserves room for the Capture bump. */}
        <GlassCard strong style={styles.tabBar}>
          <View style={styles.tabsRow}>
            {leftTabs.map((route: any, i: number) => renderTab(route, i))}
            {/* center gap: empty spacer so the 4 tabs stay evenly spaced and the
                circle's lower half has white bar (no tab label) under it. */}
            <View style={styles.captureSlot} />
            {rightTabs.map((route: any, i: number) => renderTab(route, i + 2))}
          </View>
        </GlassCard>

        {/* Capture bump: a bigger white circle whose CENTER sits on the bar's
            top edge. Bottom half overlaps the bar (white-on-white, seamless
            merge → part of the bar); top half rises as the `/-\` bump against
            the page gradient. No border (would draw a seam across the bar); a
            subtle shadow gives depth so it reads as a raised circular button.
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
    // Vertical: icon on top, label centered below — both horizontally centered.
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 4,
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
  // ── center gap (empty spacer for the Capture bump) ──
  captureSlot: { width: CIRCLE },
  // ── Capture bump (circle whose center sits on the bar's top edge) ──
  capturePress: {
    position: 'absolute',
    // Center the circle on the bar's TOP edge: top = -CIRCLE/2 means the circle
    // spans from -29 (29px above the bar) to +29 (29px into the bar). The bottom
    // half overlaps the bar (seamless merge); the top half is the bump.
    top: -CIRCLE / 2,
    left: '50%',
    marginLeft: -CIRCLE / 2,
    width: CIRCLE,
    height: CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    zIndex: 5,
  },
  captureCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: colors.snow,
    alignItems: 'center',
    justifyContent: 'center',
    // No border: a border would trace the full circle outline, drawing a seam
    // across the bar where the bottom half overlaps it. The bump silhouette
    // (top half against the page gradient) + the blue icon already delineate
    // the circle. A subtle shadow gives it a raised, button-like depth.
    shadowColor: colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
})