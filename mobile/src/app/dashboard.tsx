/**
 * Dashboard screen — the authenticated home. Lists invoices, exposes the
 * capture button (→ /capture), and shows the supplier's submission readiness
 * (profile TIN + MyInvois mode banner). Owns no state directly; reads the
 * dashboard view model + session.
 */
import { useEffect } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { useSession } from '../viewmodels/useSession'
import { useDashboard } from '../viewmodels/useDashboard'
import { useSubmit } from '../viewmodels/useSubmit'
import { colors, font, space, radius } from '../theme/tokens'
import type { InvoiceSummary } from '../domain/dtos'

export default function DashboardScreen() {
  const session = useSession()
  const dash = useDashboard()
  const submitVm = useSubmit()

  useEffect(() => {
    dash.refresh()
    submitVm.loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const supplierReady = Boolean(session.profile?.tin && session.profile?.companyName)

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Halo, {session.profile?.fullName ?? 'there'}</Text>
          <Text style={styles.sub}>
            {supplierReady ? 'Ready to submit' : 'Set your TIN & company to enable submit'}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
          <Text style={styles.profileLink}>Profile</Text>
        </Pressable>
      </View>

      {/* MyInvois mode banner */}
      <View style={[styles.banner, submitVm.mode === 'mock' ? styles.bannerMock : styles.bannerProd]}>
        <Text style={styles.bannerText}>
          {submitVm.mode === 'mock'
            ? 'MOCK MODE — submissions return canned responses, no LHDN call'
            : `MyInvois: ${submitVm.mode?.toUpperCase()}`}
        </Text>
      </View>

      <FlatList
        style={styles.list}
        data={dash.invoices}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={dash.loading} onRefresh={dash.refresh} tintColor={colors.kuning} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No invoices yet</Text>
            <Text style={styles.emptySub}>Capture a paper invoice to start.</Text>
          </View>
        }
        renderItem={({ item }) => <InvoiceCard invoice={item} />}
      />

      <Pressable
        style={({ pressed }) => [styles.capture, pressed && styles.capturePressed]}
        onPress={() => router.push('/capture')}
      >
        <Text style={styles.captureText}>＋ Capture invoice</Text>
      </Pressable>
    </View>
  )
}

function InvoiceCard({ invoice }: { invoice: InvoiceSummary }) {
  const goSubmit = () => router.push({ pathname: '/submit', params: { id: invoice.id } })
  return (
    <Pressable style={styles.card} onPress={goSubmit}>
      <View style={styles.cardHead}>
        <Text style={styles.cardNum}>{invoice.invoiceNumber ?? 'Draft'}</Text>
        <Text style={[styles.status, invoice.status === 'submitted' && styles.statusOk]}>
          {invoice.status}
        </Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardMeta}>{invoice.issueDate ?? '—'}</Text>
        <Text style={styles.cardTotal}>
          RM {(invoice.total ?? 0).toFixed(2)} {invoice.currency}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.lg },
  greeting: { fontFamily: font.displayBold, fontSize: 24, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.arang, marginTop: 2 },
  profileLink: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink },
  banner: { marginHorizontal: space.xl, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  bannerMock: { backgroundColor: colors.kuning + '33' },
  bannerProd: { backgroundColor: colors.hijau + '22' },
  bannerText: { fontFamily: font.body, fontSize: 12, color: colors.ink },
  list: { flex: 1, paddingHorizontal: space.xl },
  empty: { paddingVertical: space.xxl, alignItems: 'center' },
  emptyTitle: { fontFamily: font.display, fontSize: 18, color: colors.ink },
  emptySub: { fontFamily: font.body, fontSize: 14, color: colors.arang, marginTop: space.xs },
  card: { paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.arang + '20' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between' },
  cardNum: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  status: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.arang, textTransform: 'uppercase' },
  statusOk: { color: colors.hijau },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  cardMeta: { fontFamily: font.body, fontSize: 13, color: colors.arang },
  cardTotal: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink },
  capture: {
    backgroundColor: colors.ink, margin: space.xl, borderRadius: radius.lg,
    paddingVertical: space.lg, alignItems: 'center',
  },
  capturePressed: { opacity: 0.88 },
  captureText: { fontFamily: font.displayBold, fontSize: 16, color: colors.kuning },
})