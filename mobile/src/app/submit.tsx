/**
 * Submit screen — run the LHDN submission for a confirmed invoice and show
 * the result + audit trail. Surfaces the active MyInvois mode, the
 * accept/reject outcome, and the submission history (including error rows
 * the backend writes on failure, so the trail is always complete).
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Linking } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSubmit } from '../viewmodels/useSubmit'
import { useSession } from '../viewmodels/useSession'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { TourButton, type TourStep } from '../components/TourButton'
import { QRCode } from '../components/QRCode'
import { useAuthGate } from '../components/RequireAuth'
import { getInvoice } from '../services/invoiceService'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'

export default function SubmitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { top } = useSafeInsets()
  const vm = useSubmit()
  const session = useSession()
  const gate = useAuthGate()
  // The authoritative validation link + Document ID come from the invoice row
  // (persisted server-side after a successful submit). Fetch it after each
  // submit so we can render the "Scan to Verify" QR.
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [docId, setDocId] = useState<string | null>(null)

  const headerRef = useRef<View>(null)
  const submitRef = useRef<View>(null)
  const historyRef = useRef<Text>(null)
  const tourSteps: TourStep[] = [
    {
      id: 'submit', targetRef: headerRef, badge: 'Submit',
      title: 'Send to LHDN',
      description: 'This is step 3, the final step. Your invoice is validated against LHDN rules and every attempt is recorded here.',
    },
    {
      id: 'button', targetRef: submitRef,
      title: 'Submit button',
      description: 'Tap to send. You’ll see whether LHDN accepted or rejected it, plus the submission UID. If it’s greyed out, your profile or LHDN connection isn’t complete yet.',
    },
    {
      id: 'history', targetRef: historyRef,
      title: 'Audit trail',
      description: 'Every attempt is logged here — including failures — so there’s always a record of what happened and when.',
    },
  ]

  useEffect(() => {
    if (id) vm.loadSubmissions(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // After a successful submit, pull the persisted qrUrl + Document ID (longId)
  // from the invoice row for the QR + "Document ID" display.
  useEffect(() => {
    if (id && vm.lastResult?.accepted) {
      getInvoice(id)
        .then((inv) => {
          setQrUrl(inv.qrUrl ?? null)
          setDocId(inv.myinvoisDocId ?? null)
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, vm.lastResult?.accepted])

  const supplierReady = Boolean(session.profile?.tin && session.profile?.companyName)
  // Auth gate — an anonymous user hitting /submit directly goes to /login.
  if (gate) return gate
  const last = vm.lastResult
  const lastIsOk = last?.accepted

  return (
    <GradientBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={[pageContentStyle, { paddingTop: space.xxxl + top, paddingBottom: 150 }]}>
        <View style={styles.header} ref={headerRef}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.azure} />
          </Pressable>
          <Text style={styles.title}>Submit</Text>
          <TourButton steps={tourSteps} />
        </View>
        <Text style={styles.subtitle}>Send this invoice to LHDN for validation.</Text>

        {vm.mode && (
          <View style={[styles.badge, vm.mode === 'mock' ? styles.badgeMock : styles.badgeProd]}>
            <View style={[styles.badgeDot, vm.mode === 'mock' ? styles.dotMock : styles.dotProd]} />
            <Text style={styles.badgeText}>{vm.mode.toUpperCase()} MODE</Text>
          </View>
        )}

        {!supplierReady ? (
          <GlassCard style={styles.warn}>
            <Ionicons name="warning-outline" size={20} color={colors.amber} />
            <Text style={styles.warnText}>
              Your profile needs a TIN & company name before you can submit.
            </Text>
            <Pressable onPress={() => router.push('/profile')}>
              <Text style={styles.warnLink}>Edit profile →</Text>
            </Pressable>
          </GlassCard>
        ) : null}

        <Pressable
          ref={submitRef}
          style={({ pressed }) => [
            styles.submitBtn,
            !supplierReady && styles.disabled,
            pressed && styles.submitPressed,
          ]}
          disabled={!supplierReady || vm.submitting || !id}
          onPress={() => id && vm.submit(id)}
        >
          {vm.submitting ? (
            <ActivityIndicator color={colors.snow} />
          ) : (
            <>
              <Ionicons name="paper-plane-outline" size={18} color={colors.snow} style={{ marginRight: 6 }} />
              <Text style={styles.submitText}>Submit to LHDN</Text>
            </>
          )}
        </Pressable>

        {vm.error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <Text style={styles.error}>{vm.error}</Text>
          </View>
        ) : null}

        {last ? (
          <GlassCard style={[styles.resultCard, lastIsOk ? styles.resultOk : styles.resultBad]}>
            <View style={styles.resultHead}>
              <Ionicons name={lastIsOk ? 'checkmark-circle' : 'close-circle'} size={26} color={lastIsOk ? colors.success : colors.danger} />
              <Text style={styles.resultStatus}>{lastIsOk ? 'Accepted' : 'Rejected'}</Text>
            </View>
            <Text style={styles.resultMeta}>UID: {last.submissionUid}</Text>
            {last.documentUuid ? (
              <Text style={styles.resultMeta}>Doc: {last.documentUuid.slice(0, 8)}…</Text>
            ) : null}

            {/* Accepted → show the Document ID (longId) + the validation-link QR
                (flow 1 OUTPUT + flow 3 “Scan to Verify”). */}
            {lastIsOk ? (
              <View style={styles.qrBox}>
                {docId ? (
                  <Text style={styles.docIdLabel}>Document ID</Text>
                ) : null}
                {docId ? (
                  <Text style={styles.docIdValue}>{docId}</Text>
                ) : null}
                {qrUrl ? (
                  <View style={styles.qrWrap}>
                    <QRCode value={qrUrl} size={180} label="Scan to Verify" />
                    <Pressable onPress={() => qrUrl && Linking.openURL(qrUrl)} hitSlop={8}>
                      <Text style={styles.qrLink}>Open validation link</Text>
                    </Pressable>
                  </View>
                ) : null}
                {/* View the printable receipt (PDF / hard copy) — flow 1 + flow 3 OUTPUT. */}
                <Pressable
                  style={styles.receiptBtn}
                  onPress={() => id && router.push({ pathname: '/receipt', params: { id } })}
                >
                  <Ionicons name="document-text-outline" size={16} color={colors.azure} style={{ marginRight: 6 }} />
                  <Text style={styles.receiptBtnText}>View receipt / PDF</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Rejected → route back to the review screen to fix & resubmit
                (the flow 1 “Fix & Resubmit” loop). */}
            {!lastIsOk ? (
              <Pressable
                style={styles.fixBtn}
                onPress={() => id && router.push({ pathname: '/review', params: { id } })}
              >
                <Ionicons name="create-outline" size={16} color={colors.snow} style={{ marginRight: 6 }} />
                <Text style={styles.fixBtnText}>Fix & resubmit</Text>
              </Pressable>
            ) : null}
          </GlassCard>
        ) : null}

        <Text style={styles.sectionTitle} ref={historyRef}>Submission history</Text>
        {vm.loadingSubmissions ? (
          <ActivityIndicator color={colors.slate} style={{ marginVertical: space.lg }} />
        ) : vm.submissions.length === 0 ? (
          <GlassCard style={styles.emptyHistory}>
            <Text style={styles.muted}>No attempts yet.</Text>
          </GlassCard>
        ) : (
          vm.submissions.map((s) => (
            <GlassCard key={s.id} style={styles.auditRow}>
              <View style={styles.auditHead}>
                <Text style={[styles.auditStatus, s.status === 'accepted' && styles.auditOk, s.status === 'error' && styles.auditErr]}>
                  {s.status}
                </Text>
                <Text style={styles.auditTime}>{new Date(s.createdAt).toLocaleString()}</Text>
              </View>
              {s.submissionUid ? <Text style={styles.auditMeta}>UID: {s.submissionUid}</Text> : null}
              {s.error ? <Text style={styles.auditMeta}>err: {s.error}</Text> : null}
            </GlassCard>
          ))
        )}

        <Pressable style={styles.back} onPress={() => router.push('/home')}>
          <Text style={styles.backText}>Back to home</Text>
        </Pressable>
      </ScrollView>
    </GradientBackground>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginTop: space.xs, marginBottom: space.lg, lineHeight: 20 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.xs, marginBottom: space.lg },
  badgeMock: { backgroundColor: colors.amber + '22' },
  badgeProd: { backgroundColor: colors.success + '22' },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  dotMock: { backgroundColor: colors.amber },
  dotProd: { backgroundColor: colors.success },
  badgeText: { fontFamily: font.bodyMedium, fontSize: 11, color: colors.ink, letterSpacing: 0.5 },
  warn: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: space.lg, marginBottom: space.lg },
  warnText: { flex: 1, fontFamily: font.body, fontSize: 14, color: colors.ink, lineHeight: 20 },
  warnLink: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.azure, textDecorationLine: 'underline' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azure, borderRadius: radius.md, paddingVertical: space.lg, ...shadow.card },
  submitPressed: { opacity: 0.9 },
  disabled: { opacity: 0.4 },
  submitText: { fontFamily: font.displayBold, fontSize: 16, color: colors.snow },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger },
  resultCard: { padding: space.lg, marginTop: space.lg },
  resultOk: { borderColor: colors.success + '55' },
  resultBad: { borderColor: colors.danger + '55' },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  resultStatus: { fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  resultMeta: { fontFamily: font.body, fontSize: 13, color: colors.slate, marginTop: space.xs },
  qrBox: { marginTop: space.md, alignItems: 'center' },
  docIdLabel: { fontFamily: font.body, fontSize: 11, color: colors.slate, textTransform: 'uppercase' },
  docIdValue: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.ink, marginTop: 2, textAlign: 'center' },
  qrWrap: { alignItems: 'center', marginTop: space.md },
  qrLink: { fontFamily: font.body, fontSize: 12, color: colors.azure, marginTop: space.sm, textDecorationLine: 'underline' },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.azure, borderRadius: radius.md },
  receiptBtnText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.azure },
  fixBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.azure, borderRadius: radius.md },
  fixBtnText: { fontFamily: font.displayBold, fontSize: 14, color: colors.snow },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 12, color: colors.slate, textTransform: 'uppercase', marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs },
  emptyHistory: { padding: space.lg, alignItems: 'center' },
  muted: { fontFamily: font.body, fontSize: 14, color: colors.slate },
  auditRow: { padding: space.lg, marginBottom: space.sm },
  auditHead: { flexDirection: 'row', justifyContent: 'space-between' },
  auditStatus: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.slate, textTransform: 'uppercase' },
  auditOk: { color: colors.success },
  auditErr: { color: colors.danger },
  auditTime: { fontFamily: font.body, fontSize: 12, color: colors.slate },
  auditMeta: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 2 },
  back: { paddingVertical: space.md, alignItems: 'center', marginTop: space.lg },
  backText: { fontFamily: font.body, fontSize: 14, color: colors.azure, textDecorationLine: 'underline' },
})