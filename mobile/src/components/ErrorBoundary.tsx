/**
 * ErrorBoundary — the one safety net that stops a render throw from turning
 * into a blank white page. Wraps the app shell; any uncaught error in a child
 * renders a glass error card with a Reload button instead of an empty screen.
 *
 * (React still requires class components for error boundaries — no hook API.)
 */
import { Component, type ReactNode } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, font, space, radius, shadow } from '../theme/tokens'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Surface to the browser console so it's visible alongside network logs.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reload = () => {
    this.setState({ error: null })
    // Hard reload from server (bypass cache) so a stale bundle can't persist.
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
          <View style={styles.card}>
            <View style={styles.iconBadge}>
              <Ionicons name="warning-outline" size={28} color={colors.danger} />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              The app hit an unexpected error. Reloading usually fixes it.
            </Text>
            <View style={styles.errBox}>
              <Text style={styles.errText}>{error.message || String(error)}</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.btn, pressed && styles.pressed]} onPress={this.reload}>
              <Ionicons name="refresh-outline" size={18} color={colors.snow} style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Reload</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mist, minHeight: '100%' },
  scroll: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xl },
  card: {
    backgroundColor: colors.snow,
    borderRadius: radius.lg,
    padding: space.xl,
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
    gap: space.md,
    ...shadow.card,
  },
  iconBadge: {
    width: 56, height: 56, borderRadius: radius.md,
    backgroundColor: colors.danger + '15', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: font.displayBold, fontSize: 20, color: colors.ink },
  message: { fontFamily: font.body, fontSize: 14, color: colors.slate, textAlign: 'center', lineHeight: 20 },
  errBox: {
    width: '100%',
    backgroundColor: colors.silver + '33',
    borderRadius: radius.md,
    padding: space.md,
  },
  errText: { fontFamily: font.body, fontSize: 12, color: colors.slate, lineHeight: 18 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.azure, borderRadius: radius.md,
    paddingVertical: space.md, paddingHorizontal: space.xl, marginTop: space.xs, ...shadow.card,
  },
  pressed: { opacity: 0.9 },
  btnText: { fontFamily: font.displayBold, fontSize: 15, color: colors.snow },
})