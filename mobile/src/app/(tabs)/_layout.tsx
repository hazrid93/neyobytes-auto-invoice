/**
 * Main app tabs — the authenticated home. A floating glass tab bar with four
 * destinations: Home (dashboard), Settings, FAQ, Contact. Auth-only stack
 * routes (capture / review / submit / profile) live OUTSIDE this group in the
 * root Stack so they render full-screen above the tabs when pushed.
 *
 * Tab-bar shape (---/\--): a SHORT flat white bar whose height is only the
 * small-tab height (icon + label, 48px). The center Capture button is a bigger
 * white circle that rises out of a CONCAVE NOTCH scooped into the bar's top
 * edge. The bar's white DIPS DOWN in the center (it never rises above the
 * small-tab height), and the white circle's lower half fills the scoop while
 * its upper half rises above as a smooth rounded bump — continuous white,
 * part of the bar, bigger than the rest, not a tall blob. Drawn with
 * react-native-svg so the scoop is a real curve.
 */
import { useState } from 'react'
import { Tabs, router } from 'expo-router'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
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

/** Bar height = just a small tab (icon + label). The white pill is only this tall. */
const BAR_HEIGHT = 48
/** Capture circle diameter. Bigger than BAR_HEIGHT → visibly "bigger than the rest". */
const CIRCLE = 58
/** Notch radius = circle radius, so the circle's lower half fills the scoop exactly. */
const R = CIRCLE / 2
/** Pill corner radius (fully rounded ends). */
const CR = BAR_HEIGHT / 2

/** SVG path: a rounded pill with a concave semicircular notch scooped DOWN into
 *  the top-center (sweep-flag 0 = counterclockwise → arc passes below the start
 *  line, i.e. dips into the bar). The bar's white therefore never rises above
 *  the small-tab height; the white circle fills the scoop and protrudes above. */
function notchedPath(W: number, H: number): string {
  const cx = W / 2
  const left = cx - R
  const right = cx + R
  return [
    `M ${CR} 0`,
    `L ${left} 0`,
    `A ${R} ${R} 0 0 0 ${right} 0`, // notch: dips DOWN into the bar (sweep 0)
    `L ${W - CR} 0`,
    `A ${CR} ${CR} 0 0 1 ${W} ${CR}`,
    `L ${W} ${H - CR}`,
    `A ${CR} ${CR} 0 0 1 ${W - CR} ${H}`,
    `L ${CR} ${H}`,
    `A ${CR} ${CR} 0 0 1 0 ${H - CR}`,
    `L 0 ${CR}`,
    `A ${CR} ${CR} 0 0 1 ${CR} 0`,
    'Z',
  ].join(' ')
}

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

/** Bottom nav: a short notched white glass pill with the four tabs split 2–1–2,
 *  and a bigger white Capture circle rising out of the center notch. */
function GlassTabBar({ state, navigation }: any) {
  const { bottom } = useSafeInsets()
  const [width, setWidth] = useState(360)
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
      <View
        style={styles.barContainer}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width
          if (w > 0) setWidth(w)
        }}
      >
        {/* Notched white glass pill — flat top, dips DOWN in the center. */}
        <Svg width={width} height={BAR_HEIGHT} style={styles.barSvg}>
          <Path
            d={notchedPath(width, BAR_HEIGHT)}
            fill={glass.fillStrong}
            stroke={glass.border}
            strokeWidth={1}
          />
        </Svg>

        {/* Tab labels sit in the bar's row (vertically centered). */}
        <View style={styles.tabsRow}>
          {leftTabs.map((route: any, i: number) => renderTab(route, i))}
          <View style={styles.captureSlot}>
            <Text style={styles.captureLabel} numberOfLines={1}>Capture</Text>
          </View>
          {rightTabs.map((route: any, i: number) => renderTab(route, i + 2))}
        </View>

        {/* Capture bump: a bigger white circle. Its CENTER sits on the bar's
            flat top edge → the lower half fills the notch (continuous white),
            the upper half rises above as the bump. The scan icon sits in it. */}
        <Pressable
          ref={captureNavRef}
          style={styles.capturePress}
          onPress={() => router.push('/capture')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
  barSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  tabsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
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
  // ── center Capture slot (label in the bar, aligned with other labels) ──
  captureSlot: { width: CIRCLE, alignItems: 'center', justifyContent: 'center' },
  captureLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    color: colors.azure,
  },
  // ── Capture circle rising out of the notch ──
  capturePress: {
    position: 'absolute',
    top: -R, // circle CENTER on the bar's flat top edge → lower half fills notch
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
    borderRadius: R,
    backgroundColor: colors.snow,
    borderColor: glass.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})