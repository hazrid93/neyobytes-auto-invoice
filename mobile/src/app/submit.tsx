/**
 * Submit screen — run the LHDN submission for a confirmed invoice and show
 * the result + audit trail. Surfaces the active MyInvois mode (mock banner),
 * the accept/reject outcome, and the submission history (including error rows
 * the backend writes on failure, so the trail is always complete).
 *
 * Uses the submit view model exclusively; this screen is presentation.
 */
import { useEffect } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSubmit } from '../viewmodels/useSubmit'
import { useSession } from '../viewmodels/useSession'
import { colors, font, space, radius } from '../theme/tokens'

export default function SubmitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const vm = useSubmit()
  const session = useSession()

  useEffect(() => {
    if (id) vm.loadSubmissions(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const supplierReady = Boolean(session.profile?.tin && session.profile?.companyName)
  const last = vm.lastResult
  const lastIsOk = last?.accepted

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <View style={styles.header}>
        <Text style={styles.title}>Submit</Text>
        {vm.mode && (
          <View style={[styles.badge, vm.mode === 'mock' ? styles.badgeMock : styles.badgeProd]}>
            <Text style={styles.badgeText}>{vm.mode.toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.subtitle}>Send this invoice to LHDN for validation.</Text>

      {!supplierReady ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            Your profile needs a TIN & company name before you can submit.
          </Text>
          <Pressable onPress={() => router.push('/profile')}>
            <Text style={styles.warnLink}>Edit profile</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.submitBtn,
          !supplierReady && styles.disabled,
          pressed && styles.submitPressed,
        ]}
        disabled={!supplierReady || vm.submitting || !id}
        onPress={() => id && vm.submit(id)}
      >
        {vm.submitting ? (
          <ActivityIndicator color={colors.kuning} />
        ) : (
          <Text style={styles.submitText}>Submit to LHDN</Text>
        )}
      </Pressable>

      {vm.error ? <Text style={styles.error}>{vm.error}</Text> : null}

      {last ? (
        <View
          style={[styles.resultCard, lastIsOk ? styles.resultOk : styles.resultBad]}
        >
          <Text style={styles.resultStatus}>
            {lastIsOk ? '✓ Accepted' : '✗ Rejected'}
          </Text>
          <Text style={styles.resultMeta}>UID: {last.submissionUid}</Text>
          {last.documentUuid ? (
            <Text style={styles.resultMeta}>Doc: {last.documentUuid.slice(0, 8)}…</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Submission history</Text>
      {vm.loadingSubmissions ? (
        <ActivityIndicator color={colors.arang} style={{ marginVertical: space.lg }} />
      ) : vm.submissions.length === 0 ? (
        <Text style={styles.muted}>No attempts yet.</Text>
      ) : (
        vm.submissions.map((s) => (
          <View key={s.id} style={styles.auditRow}>
            <View style={styles.auditHead}>
              <Text style={[styles.auditStatus, s.status === 'accepted' && styles.auditOk, s.status === 'error' && styles.auditErr]}>
                {s.status}
              </Text>
              <Text style={styles.auditTime}>{new Date(s.createdAt).toLocaleString()}</Text>
            </View>
            {s.submissionUid ? <Text style={styles.auditMeta}>UID: {s.submissionUid}</Text> : null}
            {s.error ? <Text style={styles.auditMeta}>err: {s.error}</Text> : null}
          </View>
        ))
      )}

      <Pressable style={styles.back} onPress={() => router.push('/dashboard')}>
        <Text style={styles.backText}>Back to dashboard</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.xl, paddingTop: space.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  badge: { borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs },
  badgeMock: { backgroundColor: colors.kuning + '33' },
  badgeProd: { backgroundColor: colors.hijau + '22' },
  badgeText: { fontFamily: font.bodyMedium, fontSize: 11, color: colors.ink },
  subtitle: { fontFamily: font.body, fontSize: 15, color: colors.arang, marginTop: space.xs, marginBottom: space.lg },
  warn: { backgroundColor: colors.kuning + '22', borderRadius: radius.md, padding: space.md, marginBottom: space.lg, gap: space.xs },
  warnText: { fontFamily: font.body, fontSize: 14, color: colors.ink },
  warnLink: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
  submitBtn: { backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: space.lg, alignItems: 'center' },
  submitPressed: { opacity: 0.9 },
  disabled: { opacity: 0.4 },
  submitText: { fontFamily: font.displayBold, fontSize: 16, color: colors.kuning },
  error: { fontFamily: font.body, fontSize: 14, color: colors.merah, marginTop: space.md },
  resultCard: { borderRadius: radius.md, padding: space.lg, marginTop: space.lg },
  resultOk: { backgroundColor: colors.hijau + '18' },
  resultBad: { backgroundColor: colors.merah + '14' },
  resultStatus: { fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  resultMeta: { fontFamily: font.body, fontSize: 13, color: colors.arang, marginTop: space.xs },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 14, color: colors.arang, textTransform: 'uppercase', marginTop: space.xl, marginBottom: space.sm },
  muted: { fontFamily: font.body, fontSize: 14, color: colors.arang },
  auditRow: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.arang + '20' },
  auditHead: { flexDirection: 'row', justifyContent: 'space-between' },
  auditStatus: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.arang, textTransform: 'uppercase' },
  auditOk: { color: colors.hijau },
  auditErr: { color: colors.merah },
  auditTime: { fontFamily: font.body, fontSize: 12, color: colors.arang },
  auditMeta: { fontFamily: font.body, fontSize: 12, color: colors.arang, marginTop: 2 },
  back: { paddingVertical: space.md, alignItems: 'center', marginTop: space.lg },
  backText: { fontFamily: font.body, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
})