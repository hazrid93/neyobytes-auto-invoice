/**
 * Main app tabs — the authenticated home. A floating glass tab bar with four
 * destinations: Home (dashboard), Settings, FAQ, Contact. Auth-only stack
 * routes (capture / review / submit / profile) live OUTSIDE this group in the
 * root Stack so they render full-screen above the tabs when pushed.
 */
import { Tabs } from 'expo-router'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GlassCard } from '../../theme/glass'
import { colors, font, space, radius } from '../../theme/tokens'

type TabKey = 'home' | 'settings' | 'faq' | 'contact'

const TABS: { key: TabKey; icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { key: 'home', icon: 'grid-outline', label: 'Home', href: '/(tabs)/home' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings', href: '/(tabs)/settings' },
  { key: 'faq', icon: 'help-circle-outline', label: 'FAQ', href: '/(tabs)/faq' },
  { key: 'contact', icon: 'chatbubble-outline', label: 'Contact', href: '/(tabs)/contact' },
]

export default function TabsLayout() {
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

/** Floating glass tab bar — one card pinned bottom-center with 4 pill tabs. */
function GlassTabBar({ state, navigation }: any) {
  return (
    <View style={styles.tabWrap} pointerEvents="box-none">
      <GlassCard strong style={styles.tabBar}>
        {state.routes.map((route: any, i: number) => {
          const tab = TABS[i]
          const active = state.index === i
          return (
            <Pressable
              key={route.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => navigation.navigate(route.name)}
            >
              <View style={[styles.tabInner, active && styles.tabInnerActive]}>
                <Ionicons
                  name={active ? (tab.icon.replace('-outline', '') as any) : tab.icon}
                  size={22}
                  color={active ? colors.snow : colors.slate}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </View>
            </Pressable>
          )
        })}
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
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.xl,
  },
  tab: { flex: 1 },
  tabActive: {},
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
  },
  tabInnerActive: {
    backgroundColor: colors.azure,
  },
  tabLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 13,
    color: colors.slate,
  },
  tabLabelActive: {
    color: colors.snow,
  },
})