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
import { request } from '../http/client'
import { GradientBackground, GlassCard } from '../theme/glass'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import type { ExtractedInvoice } from '../domain/dtos'

interface DraftInvoice {
  id: string
  invoiceNumber: string | null
  status: string
  extractedData: ExtractedInvoice | null
}

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [draft, setDraft] = useState<DraftInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { invoices } = await request<{ invoices: DraftInvoice[] }>('/invoices')
        const found = invoices.find((i) => i.id === id)
        if (!found) setError('Invoice not found')
        setDraft(found ?? null)
      } catch {
        setError('Could not load the draft')
      } finally {
        setLoading(false)
      }
    })()
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
          <Row label="Invoice #" value={ex?.invoice_number ?? draft.invoiceNumber ?? '—'} />
          <Row label="Issue date" value={ex?.issue_date ?? '—'} />
          <Row label="Due date" value={ex?.due_date ?? '—'} />
        </Section>

        <Section title="Line items">
          {(ex?.items ?? []).map((it, i) => (
            <View key={i} style={styles.item}>
              <Text style={styles.itemDesc}>{it.description || '—'}</Text>
              <Text style={styles.itemMeta}>
                {it.quantity} × RM {it.unit_price.toFixed(2)} (tax {it.tax_rate}%)
              </Text>
            </View>
          ))}
          {(ex?.items ?? []).length === 0 && <Text style={styles.muted}>No items extracted</Text>}
        </Section>

        <Section title="Totals">
          <Row label="Subtotal" value={fmt(ex?.subtotal)} />
          <Row label="Tax" value={fmt(ex?.tax_total)} />
          <Row label="Total" value={fmt(ex?.total)} bold />
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
const fmt = (n: number | null | undefined) => (n == null ? '—' : `RM ${n.toFixed(2)}`)

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