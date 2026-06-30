/**
 * Main app tabs — the authenticated home. A floating glass tab bar with four
 * destinations: Home (dashboard), Settings, FAQ, Contact. Auth-only stack
 * routes (capture / review / submit / profile) live OUTSIDE this group in the
 * root Stack so they render full-screen above the tabs when pushed.
 */
import { Tabs, router } from 'expo-router'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GlassCard } from '../../theme/glass'
import { useAuthGate } from '../../components/RequireAuth'
import { useSafeInsets } from '../../theme/useSafeInsets'
import { captureNavRef } from '../../theme/captureNavRef'
import { colors, font, space, radius } from '../../theme/tokens'

type TabKey = 'home' | 'settings' | 'faq' | 'contact'

const TABS: { key: TabKey; icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { key: 'home', icon: 'grid-outline', label: 'Home', href: '/(tabs)/home' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings', href: '/(tabs)/settings' },
  { key: 'faq', icon: 'help-circle-outline', label: 'FAQ', href: '/(tabs)/faq' },
  { key: 'contact', icon: 'chatbubble-outline', label: 'Contact', href: '/(tabs)/contact' },
]

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

/** Bottom nav with a center Capture circle. The 4 tab destinations split
 * 2-1-2 around a bigger circular Capture button (scan icon + label below),
 * which navigates to the /capture stack route. Constrained to maxWidth so it
 * stays a compact centered bar on desktop. */
function GlassTabBar({ state, navigation }: any) {
  const { bottom } = useSafeInsets()
  // Split the 4 tabs around the center capture button: first 2, then capture, then last 2.
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
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <View style={[styles.tabInner, active && styles.tabInnerActive]}>
          <Ionicons
            name={active ? (tab.icon.replace('-outline', '') as any) : tab.icon}
            size={20}
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
      <GlassCard strong style={styles.tabBar}>
        {leftTabs.map((route: any, i: number) => renderTab(route, i))}
        <Pressable
          ref={captureNavRef}
          style={styles.captureTab}
          onPress={() => router.push('/capture')}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <View style={styles.captureCircle}>
            <Ionicons name="scan-outline" size={26} color={colors.snow} />
          </View>
          <Text style={styles.captureLabel} numberOfLines={1}>Capture</Text>
        </Pressable>
        {rightTabs.map((route: any, i: number) => renderTab(route, i + 2))}
      </GlassCard>
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
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: 460,
    width: '100%',
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.xl,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabActive: {},
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
  },
  tabInnerActive: {
    backgroundColor: colors.azure,
  },
  tabLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 12,
    color: colors.slate,
  },
  tabLabelActive: {
    color: colors.snow,
  },
  // ── center Capture circle ──
  captureTab: { alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: space.xs, paddingTop: space.xs },
  captureCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.azure,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: colors.azure,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  captureLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    color: colors.azure,
    marginTop: 2,
  },
})