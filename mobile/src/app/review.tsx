/**
 * Review screen — shows the OCR-extracted draft for the user to confirm before
 * submitting to LHDN. Reads the invoice's stored `extractedData` from the
 * backend. Glass sections over the gradient.
 *
 * Uses a route param `id` (the draft invoice id).
 */
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { request, apiErrorMessage, type ApiError } from '../http/client'
import { getInvoice } from '../services/invoiceService'
import { GradientBackground, GlassCard } from '../theme/glass'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import type { ExtractedInvoice, InvoiceDetail } from '../domain/dtos'

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [draft, setDraft] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!id) {
        setError('No invoice id')
        setLoading(false)
        return
      }
      try {
        const invoice = await getInvoice(id)
        if (!cancelled) setDraft(invoice)
      } catch (e) {
        if (!cancelled) setError(apiErrorMessage(e as ApiError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.azure} />
        </View>
      </GradientBackground>
    )
  }
  if (error || !draft) {
    return (
      <GradientBackground>
        <View style={styles.center}>
          <GlassCard style={styles.errCard}>
            <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
            <Text style={styles.error}>{error ?? 'No draft'}</Text>
            <Pressable onPress={() => router.push('/home')}><Text style={styles.link}>Back to home</Text></Pressable>
          </GlassCard>
        </View>
      </GradientBackground>
    )
  }

  const ex = draft.extractedData
  const confidence = ex?.confidence
  const cur = (draft.currency || ex?.currency || 'MYR') + ' '
  const cfmt = (n: number | null | undefined) => (n == null ? '—' : `${cur}${Number(n).toFixed(2)}`)
  const seller = ex?.seller
  const buyer = ex?.buyer
  return (
    <GradientBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingTop: space.xxxl, paddingHorizontal: space.xl, paddingBottom: 120 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.azure} />
          </Pressable>
          <Text style={styles.title}>Review</Text>
          <View style={{ width: 26 }} />
        </View>
        <Text style={styles.subtitle}>Confirm the extracted invoice before submitting to LHDN.</Text>

        {confidence != null && (
          <GlassCard style={styles.confCard}>
            <Ionicons name="pulse-outline" size={18} color={colors.azure} />
            <Text style={styles.confLabel}>Model confidence</Text>
            <Text style={styles.confValue}>{Math.round(confidence * 100)}%</Text>
          </GlassCard>
        )}

        <Section title="Seller">
          <InfoLine label="Name" value={seller?.name ?? '—'} />
          <InfoLine label="TIN" value={seller?.tin ?? '—'} />
          {seller?.phone ? <InfoLine label="Phone" value={seller.phone} /> : null}
          {seller?.email ? <InfoLine label="Email" value={seller.email} /> : null}
          {seller?.address ? <InfoLine label="Address" value={seller.address} /> : null}
        </Section>

        <Section title="Buyer">
          <InfoLine label="Name" value={buyer?.name ?? '—'} />
          <InfoLine label="TIN" value={buyer?.tin ?? '—'} />
          {buyer?.email ? <InfoLine label="Email" value={buyer.email} /> : null}
          {buyer?.address ? <InfoLine label="Address" value={buyer.address} /> : null}
        </Section>

        <Section title="Invoice details">
          <Row label="Invoice #" value={ex?.invoice_number ?? draft.invoiceNumber ?? '—'} />
          <Row label="Issue date" value={ex?.issue_date ?? draft.issueDate ?? '—'} />
          <Row label="Due date" value={ex?.due_date ?? draft.dueDate ?? '—'} />
          <Row label="Currency" value={draft.currency || ex?.currency || 'MYR'} />
          {ex?.payment_method ? <Row label="Payment" value={ex.payment_method} /> : null}
        </Section>

        <Section title="Line items">
          {(ex?.items ?? []).map((it, i) => (
            <View key={i} style={styles.item}>
              <Text style={styles.itemDesc}>{it.description || '—'}</Text>
              <Text style={styles.itemMeta}>
                {it.quantity} × {cur}{Number(it.unit_price).toFixed(2)} (tax {it.tax_rate}%)
              </Text>
            </View>
          ))}
          {(ex?.items ?? []).length === 0 && <Text style={styles.muted}>No items extracted</Text>}
        </Section>

        <Section title="Totals">
          <Row label="Subtotal" value={cfmt(ex?.subtotal ?? draft.subtotal)} />
          <Row label="Tax" value={cfmt(ex?.tax_total ?? draft.taxTotal)} />
          <Row label="Total" value={cfmt(ex?.total ?? draft.total)} bold />
        </Section>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            onPress={() => router.replace({ pathname: '/submit', params: { id: draft.id } })}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.snow} style={{ marginRight: 6 }} />
            <Text style={styles.primaryText}>Confirm & submit</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push('/home')}>
            <Text style={styles.secondaryText}>Discard</Text>
          </Pressable>
        </View>
      </ScrollView>
    </GradientBackground>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </GlassCard>
  )
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  )
}
// Multi-line label/value (seller/buyer fields can wrap). Label fixed left,
// value flexes to the right and may span multiple lines.
function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginTop: space.xs, marginBottom: space.lg, lineHeight: 20 },
  confCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.lg, marginBottom: space.lg },
  confLabel: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.slate },
  confValue: { fontFamily: font.displayBold, fontSize: 14, color: colors.ink },
  section: { padding: space.lg, marginBottom: space.lg },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 12, color: colors.slate, textTransform: 'uppercase', marginBottom: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.xs },
  rowLabel: { fontFamily: font.body, fontSize: 14, color: colors.slate },
  rowValue: { fontFamily: font.body, fontSize: 14, color: colors.ink },
  rowValueBold: { fontFamily: font.displayBold, fontSize: 16, color: colors.azure },
  infoLine: { flexDirection: 'row', paddingVertical: space.xs, gap: space.sm },
  infoLabel: { fontFamily: font.body, fontSize: 14, color: colors.slate, width: 72 },
  infoValue: { flex: 1, fontFamily: font.body, fontSize: 14, color: colors.ink, textAlign: 'right' },
  item: { paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.silver + '55' },
  itemDesc: { fontFamily: font.bodyMedium, fontSize: 15, color: colors.ink },
  itemMeta: { fontFamily: font.body, fontSize: 13, color: colors.slate, marginTop: 2 },
  muted: { fontFamily: font.body, fontSize: 14, color: colors.slate },
  actions: { marginTop: space.lg, gap: space.sm },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: space.lg, ...shadow.card,
  },
  primaryPressed: { opacity: 0.9 },
  primaryText: { fontFamily: font.displayBold, fontSize: 16, color: colors.snow },
  secondary: { paddingVertical: space.md, alignItems: 'center' },
  secondaryText: { fontFamily: font.body, fontSize: 14, color: colors.danger },
  errCard: { padding: space.xxl, alignItems: 'center', gap: space.md },
  error: { fontFamily: font.body, fontSize: 16, color: colors.danger, textAlign: 'center' },
  link: { fontFamily: font.body, fontSize: 14, color: colors.azure, marginTop: space.sm, textDecorationLine: 'underline' },
})