/**
 * Appoint Intermediary — the intermediary-mode (Step B) onboarding screen.
 *
 * The compliant LHDN flow: the taxpayer appoints OUR company as their
 * intermediary in their own MyInvois portal (by our TIN, granting View +
 * Submit). We then submit e-invoices on their behalf using our platform ERP
 * key + onbehalfof:<their TIN>. No per-user client_secret paste is needed.
 *
 * Two paths, exactly as requested:
 *   - Manual (always available, the supported fallback): step-by-step
 *     instructions + an "open portal" button + a copyable TIN.
 *   - Auto-appoint (Option B, native + beta): the user logs into the portal in
 *     an in-app WebView; injected JS adds us as their intermediary
 *     automatically. Web shows manual only (the portal can't be iframed).
 *
 * Prereq shown on screen: the user must also set their OWN TIN in their
 * profile — that's the value we send as onbehalfof.
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, Platform, Alert } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as myinvoisService from '../services/myinvoisService'
import { useSession } from '../viewmodels/useSession'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { TourButton, type TourStep } from '../components/TourButton'
import { useAuthGate } from '../components/RequireAuth'
import { IntermediaryAutoAppoint, type AppointResult } from '../components/IntermediaryAutoAppoint'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'

export default function AppointIntermediaryScreen() {
  const { top } = useSafeInsets()
  const session = useSession()
  const p = session.profile

  const [status, setStatus] = useState<myinvoisService.MyInvoisStatus | null>(null)
  const [showAuto, setShowAuto] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  useEffect(() => {
    myinvoisService.getStatus().then(setStatus).catch(() => {})
  }, [])

  const headerRef = useRef<View>(null)
  const tinRef = useRef<View>(null)
  const stepsRef = useRef<View>(null)
  const tourSteps: TourStep[] = [
    {
      id: 'appoint', targetRef: headerRef, badge: 'Intermediary',
      title: 'Appoint us once',
      description: 'In intermediary mode you add our company in your MyInvois portal. We then submit e-invoices on your behalf.',
    },
    {
      id: 'tin', targetRef: tinRef,
      title: 'Our company TIN',
      description: 'Copy this TIN and add it as your intermediary in the portal. Grant View + Submit permissions.',
    },
    {
      id: 'steps', targetRef: stepsRef,
      title: 'Follow the steps',
      description: 'Open the portal, sign in, and add us. On mobile you can also try the beta auto-appoint.',
    },
  ]

  const gate = useAuthGate()
  if (gate) return gate

  const intermediaryTin = status?.intermediaryTin ?? null
  const intermediaryRob = status?.intermediaryRob ?? null
  const portalUrl = status?.portalUrl ?? 'https://profile.myinvois.hasil.gov.my/TaxpayerProfile'
  const iapiBase = status?.iapiBase ?? 'https://api.myinvois.hasil.gov.my'
  const hasOwnTin = Boolean(p?.tin)

  const copyTin = () => {
    if (!intermediaryTin) return
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(intermediaryTin).catch(() => {})
    } else {
      Alert.alert('Our TIN', intermediaryTin)
    }
  }

  return (
    <GradientBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={[pageContentStyle, { paddingTop: space.xxxl + top, paddingBottom: 150 }]}>
        <View style={styles.header} ref={headerRef}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.azure} />
          </Pressable>
          <Text style={styles.title}>Appoint intermediary</Text>
          <TourButton steps={tourSteps} />
        </View>
        <Text style={styles.subtitle}>
          You add our company as your intermediary in your MyInvois portal. We then submit e-invoices on your behalf — no key to paste.
        </Text>

        {!hasOwnTin ? (
          <View style={styles.warnBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>Set your TIN first</Text>
              <Text style={styles.warnSub}>
                We submit on your behalf using your TIN. Add it in your profile before appointing us.
              </Text>
            </View>
            <Pressable style={styles.warnBtn} onPress={() => router.push('/profile')}>
              <Text style={styles.warnBtnText}>Set TIN</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Our company TIN card */}
        <View ref={tinRef}>
        <GlassCard strong style={styles.tinCard}>
          <Text style={styles.tinLabel}>Our company TIN (add this as your intermediary)</Text>
          <View style={styles.tinRow}>
            <Text style={styles.tinValue}>{intermediaryTin ?? '—'}</Text>
            <Pressable style={styles.copyBtn} onPress={copyTin} disabled={!intermediaryTin}>
              <Ionicons name="copy-outline" size={16} color={colors.azure} />
              <Text style={styles.copyText}>Copy</Text>
            </Pressable>
          </View>
          {intermediaryRob ? (
            <Text style={styles.robText}>ROB: {intermediaryRob}</Text>
          ) : null}
        </GlassCard>
      </View>

        {/* Manual steps */}
        <View ref={stepsRef}>
        <GlassCard style={styles.steps}>
          <Text style={styles.stepsTitle}>Steps in the MyInvois portal</Text>
          <Text style={styles.stepText}>
            <Text style={styles.stepNum}>1. </Text>
            Open the MyInvois portal and sign in with your TIN + password.
          </Text>
          <Text style={styles.stepText}>
            <Text style={styles.stepNum}>2. </Text>
            Go to your profile →{' '}
            <Text style={styles.stepEmph}>Intermediaries</Text> →{' '}
            <Text style={styles.stepEmph}>Add Intermediary</Text>.
          </Text>
          <Text style={styles.stepText}>
            <Text style={styles.stepNum}>3. </Text>
            Enter our TIN above (and our ROB if prompted).
          </Text>
          <Text style={styles.stepText}>
            <Text style={styles.stepNum}>4. </Text>
            Grant at least <Text style={styles.stepEmph}>View Document</Text> and{' '}
            <Text style={styles.stepEmph}>Submit Document</Text> permissions.
          </Text>
          <Text style={styles.stepText}>
            <Text style={styles.stepNum}>5. </Text>
            Confirm. Then submit an invoice here — we'll act on your behalf.
          </Text>
          <Pressable style={styles.portalBtn} onPress={() => Linking.openURL(portalUrl)}>
            <Ionicons name="open-outline" size={16} color={colors.azure} />
            <Text style={styles.portalText}>
              {Platform.OS === 'web' ? 'Open profile.myinvois.hasil.gov.my' : 'Open MyInvois portal'}
            </Text>
          </Pressable>
        </GlassCard>
      </View>

        {/* Option B: native auto-appoint */}
        {Platform.OS !== 'web' && intermediaryTin ? (
          <Pressable
            style={({ pressed }) => [styles.autoBtn, pressed && styles.autoPressed]}
            onPress={() => { setResultMsg(null); setShowAuto(true) }}
          >
            <Ionicons name="flash-outline" size={18} color={colors.snow} />
            <Text style={styles.autoText}>Auto-appoint (beta)</Text>
          </Pressable>
        ) : (
          <Text style={styles.autoNote}>
            {Platform.OS === 'web'
              ? 'Auto-appoint is available in the mobile app. On web, follow the steps above.'
              : 'Configure the intermediary TIN in the backend to enable auto-appoint.'}
          </Text>
        )}

        {resultMsg ? (
          <View style={styles.resultRow}>
            <Ionicons name="information-circle-outline" size={15} color={colors.azure} />
            <Text style={styles.resultText}>{resultMsg}</Text>
          </View>
        ) : null}
      </ScrollView>

      <IntermediaryAutoAppoint
        open={showAuto}
        portalUrl={portalUrl}
        iapiBase={iapiBase}
        intermediaryTin={intermediaryTin ?? ''}
        intermediaryRob={intermediaryRob}
        onClose={() => setShowAuto(false)}
        onResult={(r: AppointResult) => {
          setResultMsg(
            r.ok
              ? `Appointed automatically (HTTP ${r.status}). You can now submit invoices.`
              : `Auto-appoint returned HTTP ${r.status}. If it didn't work, follow the manual steps above.`,
          )
        }}
      />
    </GradientBackground>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { fontFamily: font.displayBold, fontSize: 26, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginBottom: space.lg, lineHeight: 20 },
  warnBanner: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.danger + '12', borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md, marginBottom: space.lg,
  },
  warnTitle: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.danger },
  warnSub: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 2, lineHeight: 17 },
  warnBtn: { backgroundColor: colors.danger, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  warnBtnText: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.snow },
  tinCard: { padding: space.lg, gap: space.sm, marginBottom: space.lg },
  tinLabel: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate },
  tinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tinValue: { fontFamily: font.displayBold, fontSize: 22, color: colors.ink, letterSpacing: 0.5 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.azure + '14', borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  copyText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.azure },
  robText: { fontFamily: font.body, fontSize: 13, color: colors.slate },
  steps: { padding: space.lg, gap: space.sm, marginBottom: space.lg },
  stepsTitle: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink, marginBottom: space.xs },
  stepText: { fontFamily: font.body, fontSize: 13, color: colors.slate, lineHeight: 19 },
  stepNum: { fontFamily: font.bodyMedium, color: colors.azure },
  stepEmph: { fontFamily: font.bodyMedium, color: colors.ink },
  portalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm,
    alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: colors.azure + '14', borderRadius: radius.md,
  },
  portalText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.azure },
  autoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.azure, borderRadius: radius.md, paddingVertical: space.lg,
    ...shadow.card,
  },
  autoPressed: { opacity: 0.9 },
  autoText: { fontFamily: font.displayBold, fontSize: 15, color: colors.snow },
  autoNote: { fontFamily: font.body, fontSize: 12, color: colors.silver, textAlign: 'center', marginTop: space.md, lineHeight: 17 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md },
  resultText: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.slate, lineHeight: 18 },
})