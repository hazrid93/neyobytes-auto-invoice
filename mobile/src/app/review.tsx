/**
 * Review screen — shows the OCR-extracted draft for the user to confirm before
 * submitting to LHDN. Reads the invoice's stored `extractedData` from the
 * backend (the draft created at capture). Maps it to an editable view shape,
 * then on confirm sends a corrected draft back. Kept read-only-ish for v1:
 * shows the model's confidence + extracted fields; the user confirms or edits.
 *
 * Uses a route param `id` (the draft invoice id).
 */
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { request } from '../http/client'
import { colors, font, space, radius } from '../theme/tokens'
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
        // No dedicated GET /invoices/:id yet; reuse the list + filter. The draft
        // just created sits at the top, so this is fine for the flow.
        const { invoices } = await request<{ invoices: DraftInvoice[] }>('/invoices')
        const found = invoices.find((i) => i.id === id)
        if (!found) setError('Invoice not found')
        setDraft(found ?? null)
      } catch (e) {
        setError('Could not load the draft')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.kuning} />
      </View>
    )
  }
  if (error || !draft) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'No draft'}</Text>
        <Pressable onPress={() => router.push('/dashboard')}><Text style={styles.link}>Back to dashboard</Text></Pressable>
      </View>
    )
  }

  const ex = draft.extractedData
  const confidence = ex?.confidence
  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <Text style={styles.title}>Review</Text>
      <Text style={styles.subtitle}>Confirm the extracted invoice before submitting to LHDN.</Text>

      {confidence != null && (
        <View style={styles.confRow}>
          <Text style={styles.confLabel}>Model confidence</Text>
          <Text style={styles.confValue}>{Math.round(confidence * 100)}%</Text>
        </View>
      )}

      <Section title="Seller">
        <Row label="Name" value={ex?.items ? '' : ''} />
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
          <Text style={styles.primaryText}>Confirm &amp; submit</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/dashboard')}>
          <Text style={styles.secondaryText}>Discard</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
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
  wrap: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.xl, paddingTop: space.xxl },
  center: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', alignItems: 'center', gap: space.md },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 15, color: colors.arang, marginTop: space.xs, marginBottom: space.lg },
  confRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.kuning + '22', borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.lg },
  confLabel: { fontFamily: font.body, fontSize: 13, color: colors.ink },
  confValue: { fontFamily: font.displayBold, fontSize: 13, color: colors.ink },
  section: { marginBottom: space.xl },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 14, color: colors.arang, textTransform: 'uppercase', marginBottom: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.xs },
  rowLabel: { fontFamily: font.body, fontSize: 14, color: colors.arang },
  rowValue: { fontFamily: font.body, fontSize: 14, color: colors.ink },
  rowValueBold: { fontFamily: font.displayBold, fontSize: 15 },
  item: { paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.arang + '20' },
  itemDesc: { fontFamily: font.bodyMedium, fontSize: 15, color: colors.ink },
  itemMeta: { fontFamily: font.body, fontSize: 13, color: colors.arang, marginTop: 2 },
  muted: { fontFamily: font.body, fontSize: 14, color: colors.arang },
  actions: { marginTop: space.lg, gap: space.sm },
  primary: { backgroundColor: colors.hijau, borderRadius: radius.md, paddingVertical: space.lg, alignItems: 'center' },
  primaryPressed: { opacity: 0.9 },
  primaryText: { fontFamily: font.displayBold, fontSize: 16, color: colors.paper },
  secondary: { paddingVertical: space.md, alignItems: 'center' },
  secondaryText: { fontFamily: font.body, fontSize: 14, color: colors.merah },
  error: { fontFamily: font.body, fontSize: 16, color: colors.merah },
  link: { fontFamily: font.body, fontSize: 14, color: colors.ink, marginTop: space.sm, textDecorationLine: 'underline' },
})