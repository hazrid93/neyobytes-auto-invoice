/**
 * Home (dashboard) — the authenticated landing. A glass control-panel over the
 * silver→blue gradient: greeting header with supplier-readiness, a row of
 * stat tiles (total / drafts / submitted), the invoice list as glass cards,
 * and a floating Capture CTA. Reads the dashboard + submit view models.
 */
import { useEffect, useMemo, useRef } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSession } from '../../viewmodels/useSession'
import { useDashboard } from '../../viewmodels/useDashboard'
import { useSubmit } from '../../viewmodels/useSubmit'
import { GradientBackground, GlassCard } from '../../theme/glass'
import { pageContentStyle } from '../../theme/page'
import { type TourStep } from '../../components/TourButton'
import { CoachmarkTour } from '../../components/CoachmarkTour'
import { useFirstRunTour } from '../../viewmodels/useFirstRunTour'
import { colors, font, space, radius, shadow } from '../../theme/tokens'
import { captureNavRef } from '../../theme/captureNavRef'
import { useSafeInsets } from '../../theme/useSafeInsets'
import { QRCode } from '../../components/QRCode'
import type { InvoiceSummary } from '../../domain/dtos'

export default function HomeScreen() {
  const session = useSession()
  const dash = useDashboard()
  const submitVm = useSubmit()

  // ── Tour targets ──
  const headerRef = useRef<View>(null)
  const avatarRef = useRef<View>(null)
  const modeRef = useRef<View>(null)
  const statsRef = useRef<View>(null)
  const listRef = useRef<View>(null)
  const { top } = useSafeInsets()
  const tour = useFirstRunTour('home')

  const tourSteps: TourStep[] = [
    {
      id: 'welcome',
      targetRef: headerRef,
      badge: 'Welcome',
      title: 'Capture → review → submit',
      description:
        'auto-invoice turns a paper invoice into a filed LHDN e-invoice in three steps: photograph it, check the draft, then submit. Here’s where each step lives — tap Next to walk through.',
    },
    {
      id: 'capture',
      targetRef: captureNavRef,
      badge: 'Capture',
      title: 'Capture a photo',
      description:
        'Tap this button to photograph or pick a paper invoice. The app reads it with OCR and drafts an e-invoice for you to confirm — no manual typing.',
    },
    {
      id: 'list',
      targetRef: listRef,
      badge: 'Review',
      title: 'Your invoices',
      description:
        'Every capture lands here. Drafts (blue) still need a review; submitted ones show their LHDN audit trail. Tap a card to open it.',
    },
    {
      id: 'stats',
      targetRef: statsRef,
      title: 'At a glance',
      description:
        'Total, drafts awaiting review, and submitted. The Drafts count is your to-do list — each one needs a review before it can go to LHDN.',
    },
    {
      id: 'mode',
      targetRef: modeRef,
      title: 'LHDN connection',
      description:
        'Shows where submissions go: Mock (practice, no real call) or your connected MyInvois env. A greyed-out submit means your profile isn’t complete yet.',
    },
    {
      id: 'profile',
      targetRef: avatarRef,
      title: 'Your supplier profile',
      description:
        'Tap your avatar to set company name + TIN — both are required before LHDN accepts a submission.',
    },
  ]

  useEffect(() => {
    dash.refresh()
    submitVm.loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const supplierReady = Boolean(session.profile?.tin && session.profile?.companyName)
  const stats = useMemo(() => {
    const total = dash.invoices.length
    const drafts = dash.invoices.filter((i) => i.status === 'draft').length
    const submitted = dash.invoices.filter((i) => i.status === 'submitted').length
    const outstanding = dash.invoices
      .filter((i) => i.status === 'draft')
      .reduce((s, i) => s + (i.total ?? 0), 0)
    return { total, drafts, submitted, outstanding }
  }, [dash.invoices])

  return (
    <GradientBackground>
      <FlatList
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: space.xxxl + top, paddingBottom: 150 }]}
        refreshControl={<RefreshControl refreshing={dash.loading} onRefresh={dash.refresh} tintColor={colors.azure} />}
        ListHeaderComponent={
          <>
            <View style={styles.topRow} ref={headerRef}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>Halo, {session.profile?.fullName?.split(' ')[0] ?? 'there'}</Text>
                <Text style={styles.sub}>
                  {supplierReady ? 'Ready to submit to LHDN' : 'Set your TIN & company to enable submit'}
                </Text>
              </View>
              <Pressable
                onPress={tour.handleTourOpen}
                hitSlop={10}
                accessibilityLabel="Start page tour"
                accessibilityRole="button"
                style={({ pressed }) => [styles.tourBtn, pressed && styles.tourPressed, { marginRight: space.sm }]}
              >
                <Ionicons name="help-outline" size={20} color={colors.azure} />
              </Pressable>
              <Pressable onPress={() => router.push('/profile')} hitSlop={10} style={styles.avatarBtn} ref={avatarRef}>
                <Ionicons name="person-circle-outline" size={34} color={colors.azure} />
              </Pressable>
            </View>

            <View style={styles.modeRow} ref={modeRef}>
              <View style={[styles.modeDot, submitVm.mode === 'mock' ? styles.modeMock : styles.modeProd]} />
              <Text style={styles.modeText}>
                {submitVm.mode === 'mock'
                  ? 'Mock mode — submissions return canned responses, no LHDN call'
                  : submitVm.mode
                    ? `MyInvois ${submitVm.mode.toUpperCase()}`
                    : 'MyInvois status loading…'}
              </Text>
            </View>

            <View style={styles.stats} ref={statsRef}>
              <StatTile label="Total invoices" value={String(stats.total)} />
              <StatTile label="Drafts" value={String(stats.drafts)} accent />
              <StatTile label="Submitted" value={String(stats.submitted)} />
            </View>

            {!supplierReady && (
              <GlassCard style={styles.readyCard}>
                <Text style={styles.readyTitle}>Almost ready</Text>
                <Text style={styles.readySub}>
                  Add your company name and TIN to unlock LHDN submission.
                </Text>
                <Pressable onPress={() => router.push('/profile')} style={styles.readyLink}>
                  <Text style={styles.readyLinkText}>Edit profile →</Text>
                </Pressable>
              </GlassCard>
            )}

            <View style={styles.listHeader} ref={listRef}>
              <Text style={styles.listTitle}>Invoices</Text>
              {stats.outstanding > 0 && (
                <Text style={styles.listMeta}>RM {stats.outstanding.toFixed(2)} unsubmitted</Text>
              )}
            </View>
          </>
        }
        data={dash.invoices}
        keyExtractor={(it) => it.id}
        ListEmptyComponent={
          <GlassCard style={styles.empty}>
            <Ionicons name="document-text-outline" size={36} color={colors.silver} />
            <Text style={styles.emptyTitle}>No invoices yet</Text>
            <Text style={styles.emptySub}>Capture a paper invoice to start your pipeline.</Text>
          </GlassCard>
        }
        renderItem={({ item }) => <InvoiceCard invoice={item} />}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      />
      <CoachmarkTour
        steps={tourSteps}
        open={tour.open}
        onClose={tour.handleTourClose}
        onComplete={tour.handleTourClose}
      />
    </GradientBackground>
  )
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <GlassCard style={[styles.stat, accent && styles.statAccent]}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </GlassCard>
  )
}

function InvoiceCard({ invoice }: { invoice: InvoiceSummary }) {
  const isDraft = invoice.status === 'draft'
  // Drafts → review (edit / delete / then submit). Submitted → submit (audit).
  // The destructive action lives on the Review screen, not on the list row —
  // one pattern on web + mobile, no accidental deletes, no overlap.
  const open = () =>
    router.push({ pathname: isDraft ? '/review' : '/submit', params: { id: invoice.id } })
  // Submitted invoices carry the LHDN Document ID + a validation QR link.
  // Show the audit chip + a small QR on the card so the dashboard reads as a
  // filed-e-invoice list, not just a draft queue.
  const submitted = invoice.status === 'submitted'
  const docId = invoice.myinvoisDocId
  const qr = invoice.qrUrl
  return (
    <Pressable onPress={open}>
      <GlassCard style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardNum} numberOfLines={1}>{invoice.invoiceNumber ?? (submitted ? 'Submitted' : 'Draft')}</Text>
          <View style={[styles.statusPill, isDraft ? styles.statusDraft : styles.statusDone]}>
            <Text style={styles.statusText}>{invoice.status}</Text>
          </View>
        </View>
        {submitted && docId ? (
          <View style={styles.docRow}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.success} />
            <Text style={styles.docId} numberOfLines={1}>LHDN {docId}</Text>
          </View>
        ) : null}
        <View style={styles.cardRow}>
          <Text style={styles.cardMeta}>{invoice.issueDate ?? 'No date'}</Text>
          <View style={styles.cardRight}>
            {submitted && qr ? (
              <View style={styles.cardQrWrap}>
                <QRCode value={qr} size={40} />
              </View>
            ) : null}
            <Text style={styles.cardTotal}>RM {(invoice.total ?? 0).toFixed(2)}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.silver} />
          </View>
        </View>
      </GlassCard>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { ...pageContentStyle },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  greeting: { fontFamily: font.displayBold, fontSize: 30, color: colors.ink, letterSpacing: -0.5 },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginTop: 2 },
  avatarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tourBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.snow + '99', borderWidth: 1, borderColor: colors.silver + '88',
  },
  tourPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  modeDot: { width: 8, height: 8, borderRadius: 4 },
  modeMock: { backgroundColor: colors.amber },
  modeProd: { backgroundColor: colors.success },
  modeText: { fontFamily: font.body, fontSize: 12, color: colors.slate },
  stats: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  stat: { flex: 1, paddingVertical: space.lg, paddingHorizontal: space.md, alignItems: 'center' },
  statAccent: { borderColor: colors.azure + '55' },
  statValue: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  statValueAccent: { color: colors.azure },
  statLabel: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 4, textAlign: 'center' },
  readyCard: { padding: space.lg, gap: space.xs, marginBottom: space.xl },
  readyTitle: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  readySub: { fontFamily: font.body, fontSize: 14, color: colors.slate },
  readyLink: { alignSelf: 'flex-start', marginTop: space.xs },
  readyLinkText: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.azure },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.md },
  listTitle: { fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  listMeta: { fontFamily: font.body, fontSize: 12, color: colors.slate },
  empty: { paddingVertical: space.xxxl, alignItems: 'center', gap: space.sm },
  emptyTitle: { fontFamily: font.display, fontSize: 16, color: colors.ink, marginTop: space.sm },
  emptySub: { fontFamily: font.body, fontSize: 13, color: colors.slate, textAlign: 'center' },
  card: { paddingHorizontal: space.lg, paddingVertical: space.lg, position: 'relative' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNum: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  statusPill: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.sm },
  statusDraft: { backgroundColor: colors.amber + '22' },
  statusDone: { backgroundColor: colors.success + '22' },
  statusText: { fontFamily: font.bodyMedium, fontSize: 11, color: colors.slate, textTransform: 'uppercase' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMeta: { fontFamily: font.body, fontSize: 13, color: colors.slate },
  cardTotal: { fontFamily: font.displayBold, fontSize: 15, color: colors.ink },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: space.xs },
  docId: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.success },
  cardQrWrap: { backgroundColor: '#fff', borderRadius: radius.sm, padding: 2, marginRight: 2 },
  fab: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.azure,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.xl,
    borderRadius: radius.xl,
    ...shadow.float,
  },
  fabPressed: { opacity: 0.9 },
  fabText: { fontFamily: font.displayBold, fontSize: 15, color: colors.snow },
})