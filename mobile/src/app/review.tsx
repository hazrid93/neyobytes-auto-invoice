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
import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getInvoice, updateInvoice, deleteInvoice } from '../services/invoiceService'
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog'
import { TourButton, type TourStep } from '../components/TourButton'
import { useAuthGate } from '../components/RequireAuth'
import { CodePicker, codeLabel } from '../components/CodePicker'
import { ValidatedField, type ValidatedFieldHandle } from '../components/ValidatedField'
import { useValidatedForm } from '../viewmodels/useValidatedForm'
import { apiErrorMessage, type ApiError } from '../http/client'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'
import type { ExtractedInvoice, InvoiceDetail } from '../domain/dtos'
import { E_INVOICE_TYPES, PAYMENT_METHODS, CURRENCIES, TAX_TYPES, CLASSIFICATION_CODES, UNIT_TYPES, COUNTRIES, FIELD_RULES } from '../data/codes'
import { compose, required, minLength, maxLength, isoDate, decimal, positiveNumber } from '../lib/validation'

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { top } = useSafeInsets()
  const [draft, setDraft] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const gate = useAuthGate()

  // Edit-form field refs — validated before save. Created up here so they're
  // stable across re-renders while editing.
  const invNumRef = useRef<ValidatedFieldHandle>(null)
  const issueDateRef = useRef<ValidatedFieldHandle>(null)
  const sellerNameRef = useRef<ValidatedFieldHandle>(null)
  const sellerTinRef = useRef<ValidatedFieldHandle>(null)
  const buyerNameRef = useRef<ValidatedFieldHandle>(null)
  const buyerTinRef = useRef<ValidatedFieldHandle>(null)
  const { formError, runValidation, clearFormError } = useValidatedForm([
    invNumRef, issueDateRef, sellerNameRef, sellerTinRef, buyerNameRef, buyerTinRef,
  ])

  const headerRef = useRef<View>(null)
  const actionsRef = useRef<View>(null)
  const tourSteps: TourStep[] = [
    {
      id: 'review', targetRef: headerRef, badge: 'Review',
      title: 'Check the extracted draft',
      description: 'This is step 2. The model filled these fields from your photo — seller, buyer, items, and totals. Scroll through and confirm they’re right before submitting.',
    },
    {
      id: 'actions', targetRef: actionsRef,
      title: 'Edit, delete, or submit',
      description: 'Tap Edit to fix any field, Delete to discard the draft (you’ll get a confirm popup), or Submit to move to step 3 and send it to LHDN.',
    },
  ]

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
    // Re-validate every edit field before persisting (shared hook — same as
    // login/profile/connect). Also guard the required invoice-type picker.
    if (!form.invoice_type || !runValidation()) {
      clearFormError() // runValidation sets its own message; reset first if type missing
      if (!form.invoice_type) return
      return
    }
    clearFormError()
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
        invoiceType: form.invoice_type || null,
        paymentMeansCode: form.payment_means_code || null,
        paymentAccount: form.payment_account || null,
      })
      setDraft(updated)
      setEditing(false)
      setForm(null)
    } catch (e) {
      setConfirm({
        title: 'Save failed',
        message: apiErrorMessage(e as ApiError),
        confirmText: 'OK',
        hideCancel: true,
        onConfirm: () => setConfirm(null),
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = () => {
    if (!draft) return
    setConfirm({
      title: 'Delete draft?',
      message: 'This invoice and its items will be permanently removed.',
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        setDeleting(true)
        try {
          await deleteInvoice(draft.id)
          router.replace('/home')
        } catch (e) {
          setConfirm({
            title: 'Delete failed',
            message: apiErrorMessage(e as ApiError),
            confirmText: 'OK',
            hideCancel: true,
            onConfirm: () => setConfirm(null),
          })
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  if (gate) return gate

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
      <ScrollView style={styles.scroll} contentContainerStyle={[pageContentStyle, { paddingTop: space.xxxl + top, paddingBottom: 140 }]}>
        <View style={styles.header} ref={headerRef}>
          <Pressable onPress={() => (editing ? cancelEdit() : router.back())} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.azure} />
          </Pressable>
          <Text style={styles.title}>Review</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <TourButton steps={tourSteps} />
            <Pressable onPress={editing ? cancelEdit : startEdit} hitSlop={10} style={styles.editBtn}>
              <Ionicons name={editing ? 'close-outline' : 'create-outline'} size={22} color={colors.azure} />
            </Pressable>
          </View>
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
          <EditView form={form} setForm={setForm} cur={cur}
            refs={{ invNumRef, issueDateRef, sellerNameRef, sellerTinRef, buyerNameRef, buyerTinRef }}
            formError={formError} />
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

        <View style={styles.actions} ref={actionsRef}>
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
      {confirm && (
        <ConfirmDialog open {...confirm} busy={deleting} onClose={() => setConfirm(null)} />
      )}
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
        <Row label="e-Invoice type" value={draft.invoiceType ? `${codeLabel(E_INVOICE_TYPES, draft.invoiceType)} (${draft.invoiceType})` : '—'} />
        <Row label="Payment means" value={draft.paymentMeansCode ? `${codeLabel(PAYMENT_METHODS, draft.paymentMeansCode)} (${draft.paymentMeansCode})` : (ex?.payment_method ?? '—')} />
        {draft.paymentAccount ? <Row label="Bank account" value={draft.paymentAccount} /> : null}
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

// ── Editable view ────────────────────────────────────────────────
// Validation: the required scalar fields (invoice #, issue date, seller &
// buyer name+TIN) use ValidatedField with refs the parent validates on save;
// the code fields (currency, e-invoice type, payment means, line tax type &
// unit, classification) use CodePicker so only valid LHDN values can be set.
interface EditRefs {
  invNumRef: React.Ref<ValidatedFieldHandle>
  issueDateRef: React.Ref<ValidatedFieldHandle>
  sellerNameRef: React.Ref<ValidatedFieldHandle>
  sellerTinRef: React.Ref<ValidatedFieldHandle>
  buyerNameRef: React.Ref<ValidatedFieldHandle>
  buyerTinRef: React.Ref<ValidatedFieldHandle>
}
function EditView({ form, setForm, cur, refs, formError }: {
  form: EditForm
  setForm: (f: EditForm) => void
  cur: string
  refs: EditRefs
  formError: string | null
}) {
  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) => setForm({ ...form, [k]: v })
  const setItem = (i: number, patch: Partial<EditItem>) =>
    setForm({ ...form, items: form.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) })
  const addItem = () =>
    setForm({ ...form, items: [...form.items, { description: '', quantity: '1', unit_price: '0', tax_rate: '0', tax_type_code: '', unit_code: '', classification: '', origin_country: '' }] })
  const removeItem = (i: number) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })

  return (
    <>
      <Section title="Seller" edit>
        <ValidatedField ref={refs.sellerNameRef} label="Name" value={form.seller_name} onChange={(v) => set('seller_name', v)}
          validate={compose(required('Seller name'), maxLength('Seller name', 300))} />
        <ValidatedField ref={refs.sellerTinRef} label="TIN" value={form.seller_tin} onChange={(v) => set('seller_tin', v)}
          validate={compose(required('Seller TIN'), maxLength('TIN', 14))} autoCap="characters" />
        <EditField label="Phone" value={form.seller_phone} onChange={(v) => set('seller_phone', v)} keyboardType="phone-pad" />
        <EditField label="Email" value={form.seller_email} onChange={(v) => set('seller_email', v)} keyboardType="email-address" />
        <EditField label="Address" value={form.seller_address} onChange={(v) => set('seller_address', v)} multiline />
      </Section>

      <Section title="Buyer" edit>
        <ValidatedField ref={refs.buyerNameRef} label="Name" value={form.buyer_name} onChange={(v) => set('buyer_name', v)}
          validate={compose(required('Buyer name'), maxLength('Buyer name', 300))} />
        <ValidatedField ref={refs.buyerTinRef} label="TIN" value={form.buyer_tin} onChange={(v) => set('buyer_tin', v)}
          validate={compose(required('Buyer TIN'), maxLength('TIN', 14))} autoCap="characters" />
        <EditField label="Email" value={form.buyer_email} onChange={(v) => set('buyer_email', v)} keyboardType="email-address" />
        <EditField label="Address" value={form.buyer_address} onChange={(v) => set('buyer_address', v)} multiline />
      </Section>

      <Section title="Invoice details" edit>
        <ValidatedField ref={refs.invNumRef} label="Invoice #" value={form.invoice_number} onChange={(v) => set('invoice_number', v)}
          validate={compose(required('Invoice number'), minLength('Invoice number', 1), maxLength('Invoice number', FIELD_RULES.invoiceNumber.max))} />
        <ValidatedField ref={refs.issueDateRef} label="Issue date" value={form.issue_date} onChange={(v) => set('issue_date', v)}
          validate={compose(required('Issue date'), isoDate())} placeholder="YYYY-MM-DD" />
        <EditField label="Due date" value={form.due_date} onChange={(v) => set('due_date', v)} placeholder="YYYY-MM-DD" />
        <CodePicker label="Currency" icon="cash-outline" options={CURRENCIES} value={form.currency} onChange={(v) => set('currency', v)} required />
        <CodePicker label="e-Invoice type" icon="document-text-outline" options={E_INVOICE_TYPES} value={form.invoice_type} onChange={(v) => set('invoice_type', v)} required showCodeInList />
        <CodePicker label="Payment means" icon="card-outline" options={PAYMENT_METHODS} value={form.payment_means_code} onChange={(v) => set('payment_means_code', v)} />
        <EditField label="Supplier bank account no" value={form.payment_account} onChange={(v) => set('payment_account', v)} placeholder="1234567890123" autoCap="characters" />
      </Section>

      <Section title="Line items" edit>
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
            <CodePicker label="Tax type" icon="pricetag-outline" options={TAX_TYPES} value={it.tax_type_code} onChange={(v) => setItem(i, { tax_type_code: v })} />
            <View style={styles.itemEditRow}>
              <View style={{ flex: 1 }}>
                <CodePicker label="Unit" options={UNIT_TYPES} value={it.unit_code} onChange={(v) => setItem(i, { unit_code: v })} />
              </View>
              <View style={{ flex: 1.4, marginLeft: space.sm }}>
                <CodePicker label="Classification" options={CLASSIFICATION_CODES} value={it.classification} onChange={(v) => setItem(i, { classification: v })} />
              </View>
            </View>
            <CodePicker label="Country of origin" icon="globe-outline" options={COUNTRIES} value={it.origin_country} onChange={(v) => setItem(i, { origin_country: v })} />
          </View>
        ))}
        <Pressable style={styles.addItem} onPress={addItem}>
          <Ionicons name="add-circle-outline" size={18} color={colors.azure} />
          <Text style={styles.addItemText}>Add item</Text>
        </Pressable>
      </Section>

      <Section title="Totals" edit>
        <EditField label="Subtotal" value={form.subtotal} onChange={(v) => set('subtotal', v)} keyboardType="numeric" prefix={cur} />
        <EditField label="Tax" value={form.tax_total} onChange={(v) => set('tax_total', v)} keyboardType="numeric" prefix={cur} />
        <EditField label="Total" value={form.total} onChange={(v) => set('total', v)} keyboardType="numeric" prefix={cur} />
      </Section>

      {formError ? (
        <View style={styles.formErrorRow}>
          <Ionicons name="alert-circle" size={15} color={colors.danger} />
          <Text style={styles.formError}>{formError}</Text>
        </View>
      ) : null}
    </>
  )
}

// ── Form <-> ExtractedInvoice mapping ─────────────────────────────────────
interface EditItem {
  description: string
  quantity: string
  unit_price: string
  tax_rate: string
  tax_type_code: string
  unit_code: string
  classification: string
  origin_country: string
}
interface EditForm {
  invoice_number: string
  issue_date: string
  due_date: string
  currency: string
  payment_method: string
  invoice_type: string
  payment_means_code: string
  payment_account: string
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
    invoice_type: d?.invoiceType ?? '01',
    payment_means_code: d?.paymentMeansCode ?? '',
    payment_account: d?.paymentAccount ?? '',
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
      tax_type_code: it.tax_type_code ?? '',
      unit_code: it.unit_code ?? '',
      classification: it.classification ?? '',
      origin_country: it.origin_country ?? '',
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
      tax_type_code: it.tax_type_code || null,
      unit_code: it.unit_code || null,
      classification: it.classification || null,
      origin_country: it.origin_country || null,
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
function Section({ title, children, edit }: { title: string; children: React.ReactNode; edit?: boolean }) {
  return (
    <GlassCard style={[styles.section, edit && styles.sectionEdit]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={edit ? styles.editFields : undefined}>{children}</View>
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
  sectionEdit: { padding: space.xl, marginBottom: space.xl },
  editFields: { gap: space.md },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 12, color: colors.slate, textTransform: 'uppercase', marginBottom: space.md, letterSpacing: 0.4 },
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
  editField: { gap: space.sm },
  editLabel: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate },
  editInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.snow, borderColor: colors.silver, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48,
  },
  editPrefix: { fontFamily: font.body, fontSize: 15, color: colors.slate, marginRight: 4 },
  editInput: { flex: 1, fontFamily: font.body, fontSize: 16, color: colors.ink, paddingVertical: space.md, paddingHorizontal: 0 },
  editInputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  itemEdit: { paddingVertical: space.md, paddingHorizontal: space.md, marginBottom: space.md, gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.silver + '55' },
  itemEditHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemEditIndex: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate },
  itemRemove: { padding: 4 },
  itemEditRow: { flexDirection: 'row', alignItems: 'flex-end' },
  addItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: space.md, marginTop: space.xs },
  addItemText: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.azure },
  // ── edit form error ──
  formErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md },
  formError: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.danger },
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