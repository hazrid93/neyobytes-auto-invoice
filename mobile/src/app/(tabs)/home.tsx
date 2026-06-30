/**
 * Home (dashboard) — the authenticated landing. A glass control-panel over the
 * silver→blue gradient: greeting header with supplier-readiness, a row of
 * stat tiles (total / drafts / submitted), the invoice list as glass cards,
 * and a floating Capture CTA. Reads the dashboard + submit view models.
 */
import { useEffect, useMemo } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSession } from '../../viewmodels/useSession'
import { useDashboard } from '../../viewmodels/useDashboard'
import { useSubmit } from '../../viewmodels/useSubmit'
import { GradientBackground, GlassCard } from '../../theme/glass'
import { pageContentStyle } from '../../theme/page'
import { colors, font, space, radius, shadow } from '../../theme/tokens'
import type { InvoiceSummary } from '../../domain/dtos'

export default function HomeScreen() {
  const session = useSession()
  const dash = useDashboard()
  const submitVm = useSubmit()

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
        contentContainerStyle={[styles.content, { paddingBottom: 150 }]}
        refreshControl={<RefreshControl refreshing={dash.loading} onRefresh={dash.refresh} tintColor={colors.azure} />}
        ListHeaderComponent={
          <>
            <View style={styles.topRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>Halo, {session.profile?.fullName?.split(' ')[0] ?? 'there'}</Text>
                <Text style={styles.sub}>
                  {supplierReady ? 'Ready to submit to LHDN' : 'Set your TIN & company to enable submit'}
                </Text>
              </View>
              <Pressable onPress={() => router.push('/profile')} hitSlop={10} style={styles.avatarBtn}>
                <Ionicons name="person-circle-outline" size={34} color={colors.azure} />
              </Pressable>
            </View>

            <View style={styles.modeRow}>
              <View style={[styles.modeDot, submitVm.mode === 'mock' ? styles.modeMock : styles.modeProd]} />
              <Text style={styles.modeText}>
                {submitVm.mode === 'mock'
                  ? 'Mock mode — submissions return canned responses, no LHDN call'
                  : submitVm.mode
                    ? `MyInvois ${submitVm.mode.toUpperCase()}`
                    : 'MyInvois status loading…'}
              </Text>
            </View>

            <View style={styles.stats}>
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

            <View style={styles.listHeader}>
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

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/capture')}
      >
        <Ionicons name="scan-outline" size={20} color={colors.snow} />
        <Text style={styles.fabText}>Capture invoice</Text>
      </Pressable>
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
  return (
    <Pressable onPress={open}>
      <GlassCard style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardNum}>{invoice.invoiceNumber ?? 'Draft'}</Text>
          <View style={[styles.statusPill, isDraft ? styles.statusDraft : styles.statusDone]}>
            <Text style={styles.statusText}>{invoice.status}</Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardMeta}>{invoice.issueDate ?? 'No date'}</Text>
          <View style={styles.cardRight}>
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
  content: { ...pageContentStyle, paddingTop: space.xxxl },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  greeting: { fontFamily: font.displayBold, fontSize: 30, color: colors.ink, letterSpacing: -0.5 },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginTop: 2 },
  avatarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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