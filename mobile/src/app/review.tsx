/**
 * Review screen — shows the OCR-extracted draft for the user to review, EDIT,
 * DELETE, or submit to LHDN. Reads the invoice's stored `extractedData` from
 * GET /invoices/:id.
 *
 * Two modes:
 *   view  — read-only glass sections (seller/buyer/details/items/totals)
 *   edit  — text inputs for every field + add/remove line items; Save PATCHes
 *           the scalar columns + the reconstructed extractedData blob.
 *
 * Actions: Edit/Save (toggle), Delete (DELETE → home), Confirm & submit.
 */
import { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getInvoice, updateInvoice, deleteInvoice } from '../services/invoiceService'
import { apiErrorMessage, type ApiError } from '../http/client'
import { GradientBackground, GlassCard } from '../theme/glass'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import type { ExtractedInvoice, InvoiceDetail } from '../domain/dtos'

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [draft, setDraft] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  const startEdit = () => {
    setForm(toForm(draft))
    setEditing(true)
  }
  const cancelEdit = () => {
    setEditing(false)
    setForm(null)
  }

  const save = async () => {
    if (!draft || !form) return
    setSaving(true)
    try {
      const ex = fromForm(form)
      const updated = await updateInvoice(draft.id, {
        invoiceNumber: ex.invoice_number ?? null,
        issueDate: ex.issue_date ?? null,
        dueDate: ex.due_date ?? null,
        currency: ex.currency,
        subtotal: ex.subtotal ?? 0,
        taxTotal: ex.tax_total ?? 0,
        total: ex.total ?? 0,
        extractedData: ex as unknown as Record<string, unknown>,
      })
      setDraft(updated)
      setEditing(false)
      setForm(null)
    } catch (e) {
      Alert.alert('Save failed', apiErrorMessage(e as ApiError))
    } finally {
      setSaving(false)
    }
  }

  const remove = () => {
    if (!draft) return
    Alert.alert('Delete draft?', 'This invoice and its items will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          try {
            await deleteInvoice(draft.id)
            router.replace('/home')
          } catch (e) {
            Alert.alert('Delete failed', apiErrorMessage(e as ApiError))
          } finally {
            setDeleting(false)
          }
        },
      },
    ])
  }

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
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingTop: space.xxxl, paddingHorizontal: space.xl, paddingBottom: 140 }}>
        <View style={styles.header}>
          <Pressable onPress={() => (editing ? cancelEdit() : router.back())} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.azure} />
          </Pressable>
          <Text style={styles.title}>Review</Text>
          <Pressable onPress={editing ? cancelEdit : startEdit} hitSlop={10} style={styles.editBtn}>
            <Ionicons name={editing ? 'close-outline' : 'create-outline'} size={22} color={colors.azure} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {editing ? 'Edit the extracted fields, then save.' : 'Confirm the extracted invoice before submitting to LHDN.'}
        </Text>

        {confidence != null && !editing && (
          <GlassCard style={styles.confCard}>
            <Ionicons name="pulse-outline" size={18} color={colors.azure} />
            <Text style={styles.confLabel}>Model confidence</Text>
            <Text style={styles.confValue}>{Math.round(confidence * 100)}%</Text>
          </GlassCard>
        )}

        {editing && form ? (
          <EditView form={form} setForm={setForm} cur={cur} />
        ) : (
          <ReadView
            seller={seller}
            buyer={buyer}
            ex={ex}
            draft={draft}
            cur={cur}
            cfmt={cfmt}
          />
        )}

        <View style={styles.actions}>
          {editing ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed, saving && styles.disabled]}
                onPress={save}
                disabled={saving || deleting}
              >
                {saving ? (
                  <ActivityIndicator color={colors.snow} />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color={colors.snow} style={{ marginRight: 6 }} />
                    <Text style={styles.primaryText}>Save changes</Text>
                  </>
                )}
              </Pressable>
              <Pressable style={styles.secondary} onPress={cancelEdit}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
                onPress={() => router.replace({ pathname: '/submit', params: { id: draft.id } })}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.snow} style={{ marginRight: 6 }} />
                <Text style={styles.primaryText}>Confirm & submit</Text>
              </Pressable>
              <View style={styles.rowActions}>
                <Pressable style={styles.ghostBtn} onPress={startEdit}>
                  <Ionicons name="create-outline" size={16} color={colors.azure} style={{ marginRight: 4 }} />
                  <Text style={styles.ghostText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.ghostBtn, styles.ghostDanger]}
                  onPress={remove}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} style={{ marginRight: 4 }} />
                      <Text style={styles.ghostDangerText}>Delete</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </GradientBackground>
  )
}

// ── Read-only view ────────────────────────────────────────────────────────
function ReadView({
  seller, buyer, ex, draft, cur, cfmt,
}: {
  seller: ExtractedInvoice['seller'] | undefined
  buyer: ExtractedInvoice['buyer'] | undefined
  ex: ExtractedInvoice | null
  draft: InvoiceDetail
  cur: string
  cfmt: (n: number | null | undefined) => string
}) {
  return (
    <>
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
    </>
  )
}

// ── Editable view ─────────────────────────────────────────────────────────
function EditView({ form, setForm, cur }: { form: EditForm; setForm: (f: EditForm) => void; cur: string }) {
  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) => setForm({ ...form, [k]: v })
  const setItem = (i: number, patch: Partial<EditItem>) =>
    setForm({ ...form, items: form.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) })
  const addItem = () =>
    setForm({ ...form, items: [...form.items, { description: '', quantity: '1', unit_price: '0', tax_rate: '0' }] })
  const removeItem = (i: number) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })

  return (
    <>
      <Section title="Seller">
        <EditField label="Name" value={form.seller_name} onChange={(v) => set('seller_name', v)} />
        <EditField label="TIN" value={form.seller_tin} onChange={(v) => set('seller_tin', v)} autoCap="characters" />
        <EditField label="Phone" value={form.seller_phone} onChange={(v) => set('seller_phone', v)} keyboardType="phone-pad" />
        <EditField label="Email" value={form.seller_email} onChange={(v) => set('seller_email', v)} keyboardType="email-address" />
        <EditField label="Address" value={form.seller_address} onChange={(v) => set('seller_address', v)} multiline />
      </Section>

      <Section title="Buyer">
        <EditField label="Name" value={form.buyer_name} onChange={(v) => set('buyer_name', v)} />
        <EditField label="TIN" value={form.buyer_tin} onChange={(v) => set('buyer_tin', v)} autoCap="characters" />
        <EditField label="Email" value={form.buyer_email} onChange={(v) => set('buyer_email', v)} keyboardType="email-address" />
        <EditField label="Address" value={form.buyer_address} onChange={(v) => set('buyer_address', v)} multiline />
      </Section>

      <Section title="Invoice details">
        <EditField label="Invoice #" value={form.invoice_number} onChange={(v) => set('invoice_number', v)} />
        <EditField label="Issue date" value={form.issue_date} onChange={(v) => set('issue_date', v)} placeholder="YYYY-MM-DD" />
        <EditField label="Due date" value={form.due_date} onChange={(v) => set('due_date', v)} placeholder="YYYY-MM-DD" />
        <EditField label="Currency" value={form.currency} onChange={(v) => set('currency', v)} />
        <EditField label="Payment" value={form.payment_method} onChange={(v) => set('payment_method', v)} />
      </Section>

      <Section title="Line items">
        {form.items.map((it, i) => (
          <View key={i} style={styles.itemEdit}>
            <View style={styles.itemEditHead}>
              <Text style={styles.itemEditIndex}>#{i + 1}</Text>
              <Pressable onPress={() => removeItem(i)} hitSlop={8} style={styles.itemRemove}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            </View>
            <EditField label="Description" value={it.description} onChange={(v) => setItem(i, { description: v })} multiline />
            <View style={styles.itemEditRow}>
              <View style={{ flex: 1.2 }}>
                <EditField label="Qty" value={it.quantity} onChange={(v) => setItem(i, { quantity: v })} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1.6, marginLeft: space.sm }}>
                <EditField label="Unit price" value={it.unit_price} onChange={(v) => setItem(i, { unit_price: v })} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1, marginLeft: space.sm }}>
                <EditField label="Tax %" value={it.tax_rate} onChange={(v) => setItem(i, { tax_rate: v })} keyboardType="numeric" />
              </View>
            </View>
          </View>
        ))}
        <Pressable style={styles.addItem} onPress={addItem}>
          <Ionicons name="add-circle-outline" size={18} color={colors.azure} />
          <Text style={styles.addItemText}>Add item</Text>
        </Pressable>
      </Section>

      <Section title="Totals">
        <EditField label="Subtotal" value={form.subtotal} onChange={(v) => set('subtotal', v)} keyboardType="numeric" prefix={cur} />
        <EditField label="Tax" value={form.tax_total} onChange={(v) => set('tax_total', v)} keyboardType="numeric" prefix={cur} />
        <EditField label="Total" value={form.total} onChange={(v) => set('total', v)} keyboardType="numeric" prefix={cur} />
      </Section>
    </>
  )
}

// ── Form <-> ExtractedInvoice mapping ─────────────────────────────────────
interface EditItem {
  description: string
  quantity: string
  unit_price: string
  tax_rate: string
}
interface EditForm {
  invoice_number: string
  issue_date: string
  due_date: string
  currency: string
  payment_method: string
  seller_name: string
  seller_tin: string
  seller_phone: string
  seller_email: string
  seller_address: string
  buyer_name: string
  buyer_tin: string
  buyer_email: string
  buyer_address: string
  subtotal: string
  tax_total: string
  total: string
  items: EditItem[]
}

function toForm(d: InvoiceDetail | null): EditForm {
  const ex = d?.extractedData
  const s = ex?.seller
  const b = ex?.buyer
  return {
    invoice_number: ex?.invoice_number ?? d?.invoiceNumber ?? '',
    issue_date: ex?.issue_date ?? d?.issueDate ?? '',
    due_date: ex?.due_date ?? d?.dueDate ?? '',
    currency: d?.currency || ex?.currency || 'MYR',
    payment_method: ex?.payment_method ?? '',
    seller_name: s?.name ?? '',
    seller_tin: s?.tin ?? '',
    seller_phone: s?.phone ?? '',
    seller_email: s?.email ?? '',
    seller_address: s?.address ?? '',
    buyer_name: b?.name ?? '',
    buyer_tin: b?.tin ?? '',
    buyer_email: b?.email ?? '',
    buyer_address: b?.address ?? '',
    subtotal: ex?.subtotal != null ? String(ex.subtotal) : (d?.subtotal != null ? String(d.subtotal) : ''),
    tax_total: ex?.tax_total != null ? String(ex.tax_total) : (d?.taxTotal != null ? String(d.taxTotal) : ''),
    total: ex?.total != null ? String(ex.total) : (d?.total != null ? String(d.total) : ''),
    items: (ex?.items ?? []).map((it) => ({
      description: it.description ?? '',
      quantity: String(it.quantity ?? 1),
      unit_price: String(it.unit_price ?? 0),
      tax_rate: String(it.tax_rate ?? 0),
    })),
  }
}

function num(s: string): number {
  const n = Number(String(s).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function fromForm(f: EditForm): ExtractedInvoice {
  return {
    invoice_number: f.invoice_number.trim() || null,
    issue_date: f.issue_date.trim() || null,
    due_date: f.due_date.trim() || null,
    currency: f.currency.trim() || 'MYR',
    seller: {
      name: f.seller_name.trim() || null,
      tin: f.seller_tin.trim() || null,
      phone: f.seller_phone.trim() || null,
      email: f.seller_email.trim() || null,
      address: f.seller_address.trim() || null,
    },
    buyer: {
      name: f.buyer_name.trim() || null,
      tin: f.buyer_tin.trim() || null,
      email: f.buyer_email.trim() || null,
      address: f.buyer_address.trim() || null,
    },
    items: f.items.map((it) => ({
      description: it.description.trim(),
      quantity: num(it.quantity) || 1,
      unit_price: num(it.unit_price),
      tax_rate: num(it.tax_rate),
      payment_method: null,
      bank_detail: null,
    })),
    subtotal: f.subtotal.trim() ? num(f.subtotal) : null,
    tax_total: f.tax_total.trim() ? num(f.tax_total) : null,
    total: f.total.trim() ? num(f.total) : null,
    payment_method: f.payment_method.trim() || null,
    bank_detail: null,
    qr_verification: null,
    notes: null,
    confidence: null,
  }
}

// ── Shared bits ────────────────────────────────────────────────────────────
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
function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

function EditField({
  label, value, onChange, placeholder, keyboardType, autoCap, multiline, prefix,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad'
  autoCap?: 'characters' | 'none' | 'words'
  multiline?: boolean
  prefix?: string
}) {
  const webClass = (Platform.OS === 'web' ? { className: 'field-input' } : {}) as Record<string, string>
  return (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <View style={styles.editInputWrap} {...webClass}>
        {prefix ? <Text style={styles.editPrefix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.editInput, multiline && styles.editInputMultiline]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.slate}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCap ?? 'none'}
          autoCorrect={false}
          multiline={multiline}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  editBtn: { width: 26, alignItems: 'center' },
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
  // ── edit mode ──
  editField: { marginBottom: space.md },
  editLabel: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate, marginBottom: 4 },
  editInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.snow, borderColor: colors.silver, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: space.md,
  },
  editPrefix: { fontFamily: font.body, fontSize: 15, color: colors.slate, marginRight: 4 },
  editInput: { flex: 1, fontFamily: font.body, fontSize: 15, color: colors.ink, paddingVertical: space.sm, paddingHorizontal: 0 },
  editInputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  itemEdit: { paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.silver + '55' },
  itemEditHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs },
  itemEditIndex: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate },
  itemRemove: { padding: 4 },
  itemEditRow: { flexDirection: 'row', alignItems: 'flex-end' },
  addItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: space.md, marginTop: space.xs },
  addItemText: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.azure },
  // ── actions ──
  actions: { marginTop: space.lg, gap: space.sm },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: space.lg, ...shadow.card,
  },
  primaryPressed: { opacity: 0.9 },
  primaryText: { fontFamily: font.displayBold, fontSize: 16, color: colors.snow },
  secondary: { paddingVertical: space.md, alignItems: 'center' },
  secondaryText: { fontFamily: font.body, fontSize: 14, color: colors.slate },
  rowActions: { flexDirection: 'row', gap: space.sm, justifyContent: 'center', marginTop: space.xs },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: colors.mist },
  ghostText: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.azure },
  ghostDanger: { backgroundColor: colors.danger + '12' },
  ghostDangerText: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.danger },
  disabled: { opacity: 0.5 },
  errCard: { padding: space.xxl, alignItems: 'center', gap: space.md },
  error: { fontFamily: font.body, fontSize: 16, color: colors.danger, textAlign: 'center' },
  link: { fontFamily: font.body, fontSize: 14, color: colors.azure, marginTop: space.sm, textDecorationLine: 'underline' },
})