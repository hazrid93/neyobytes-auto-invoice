/**
 * Receipt screen — renders the e-invoice receipt (flow-1/flow-3 "PDF or hard
 * copy" OUTPUT) in a WebView. The backend serves a self-contained HTML doc
 * with the supplier/buyer/items/total + Document ID + Validation UUID + QR;
 * the WebView's built-in print-to-PDF satisfies the PDF requirement, and the
 * same HTML is the "hard copy" view.
 *
 * Authed supplier view: GET /invoices/:id/receipt (requires a Bearer token,
 * injected into the WebView via a custom request header).
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { WebView } from 'react-native-webview'
import { GradientBackground } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { colors, font, space, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'
import { useAuthGate } from '../components/RequireAuth'
import { API_BASE_URL } from '../http/client'
import { getToken } from '../http/tokenStore'

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { top } = useSafeInsets()
  const gate = useAuthGate()
  const webRef = useRef<WebView>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    getToken().then(setToken)
  }, [])

  if (gate) return gate

  const url = `${API_BASE_URL}/invoices/${encodeURIComponent(id)}/receipt`
  // Inject the bearer token so the authed receipt route accepts the request.
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined

  return (
    <GradientBackground>
      <View style={[styles.wrap, { paddingTop: top + space.md }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.azure} />
          </Pressable>
          <Text style={styles.title}>Receipt</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.webWrap}>
          {token ? (
            <WebView
              ref={webRef}
              source={{ uri: url, headers }}
              startInLoadingState
              renderLoading={() => (
                <ActivityIndicator color={colors.azure} style={{ marginTop: 40 }} />
              )}
              style={styles.web}
            />
          ) : (
            <ActivityIndicator color={colors.azure} style={{ marginTop: 40 }} />
          )}
        </View>
      </View>
    </GradientBackground>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm, paddingHorizontal: space.xs },
  title: { fontFamily: font.displayBold, fontSize: 24, color: colors.ink },
  webWrap: { flex: 1, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', ...shadow.card },
  web: { flex: 1 },
})