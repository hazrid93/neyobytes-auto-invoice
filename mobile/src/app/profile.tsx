/**
 * Profile screen — edit the supplier's own profile. Every field with an
 * LHDN rule gets inline validation (min length, max chars, pattern) and the
 * code fields (TIN shape, MSIC, State) use a searchable CodePicker with a
 * help (?) popup explaining each value. These are mandatory for LHDN
 * submission, so the home tab gates submit on this being filled.
 */
import { useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { updateProfile } from '../services/authService'
import { useSession } from '../viewmodels/useSession'
import { useValidatedForm } from '../viewmodels/useValidatedForm'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { TourButton, type TourStep } from '../components/TourButton'
import { useAuthGate } from '../components/RequireAuth'
import { ValidatedField, type ValidatedFieldHandle } from '../components/ValidatedField'
import { CodePicker } from '../components/CodePicker'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'
import {
  FIELD_RULES, MSIC_CODES, STATE_CODES,
} from '../data/codes'
import {
  compose, required, minLength, maxLength, email as emailV, phone as phoneV, tin as tinV,
} from '../lib/validation'

export default function ProfileScreen() {
  const { top } = useSafeInsets()
  const session = useSession()
  const p = session.profile
  const [fullName, setFullName] = useState(p?.fullName ?? '')
  const [companyName, setCompanyName] = useState(p?.companyName ?? '')
  const [tin, setTin] = useState(p?.tin ?? '')
  // Supplier identity fields for the MyInvois Core Fields Validator (the
  // mandatory party structure). 'NA' defaults where the FAQ allows it.
  const [brn, setBrn] = useState(p?.brn ?? '')
  const [sstNumber, setSstNumber] = useState(p?.sstNumber ?? '')
  const [ttxNumber, setTtxNumber] = useState(p?.ttxNumber ?? '')
  const [msicCode, setMsicCode] = useState(p?.msicCode ?? '')
  const [msicDescription, setMsicDescription] = useState(p?.msicDescription ?? '')
  const [contactNumber, setContactNumber] = useState(p?.contactNumber ?? '')
  const [addressLine1, setAddressLine1] = useState(p?.addressLine1 ?? '')
  const [addressLine2, setAddressLine2] = useState(p?.addressLine2 ?? '')
  const [city, setCity] = useState(p?.city ?? '')
  const [postalZone, setPostalZone] = useState(p?.postalZone ?? '')
  const [stateCode, setStateCode] = useState(p?.stateCode ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const headerRef = useRef<View>(null)
  const formRef = useRef<View>(null)
  const saveRef = useRef<View>(null)
  // Validated field refs — the form runs validate() on each before save.
  const fullNameRef = useRef<ValidatedFieldHandle>(null)
  const companyNameRef = useRef<ValidatedFieldHandle>(null)
  const tinRef = useRef<ValidatedFieldHandle>(null)
  const brnRef = useRef<ValidatedFieldHandle>(null)
  const sstRef = useRef<ValidatedFieldHandle>(null)
  const ttxRef = useRef<ValidatedFieldHandle>(null)
  const contactRef = useRef<ValidatedFieldHandle>(null)
  const addr1Ref = useRef<ValidatedFieldHandle>(null)
  const cityRef = useRef<ValidatedFieldHandle>(null)
  const postalRef = useRef<ValidatedFieldHandle>(null)
  const { formError, runValidation, clearFormError } = useValidatedForm([
    fullNameRef, companyNameRef, tinRef, brnRef, sstRef, ttxRef,
    contactRef, addr1Ref, cityRef, postalRef,
  ])
  const tourSteps: TourStep[] = [
    {
      id: 'profile', targetRef: headerRef, badge: 'Profile',
      title: 'Your supplier details',
      description: 'These details go on every e-invoice you submit to LHDN. Fill them in once and they’re reused on every submission.',
    },
    {
      id: 'form', targetRef: formRef,
      title: 'Required fields',
      description: 'Company name and TIN are mandatory — submit stays disabled until both are set. Add your SST/MSIC too for faster, complete filings.',
    },
    {
      id: 'save', targetRef: saveRef,
      title: 'Save',
      description: 'Tap to save. Your profile is then used automatically on the next submission — no need to re-enter it.',
    },
  ]

  // Auth gate — an anonymous user (e.g. after sign-out) is bounced to /login
  // before any profile field renders.
  const gate = useAuthGate()
  if (gate) return gate

  const save = async () => {
    // Re-run every field validator before submit; block save while any fails.
    if (!runValidation()) return
    setSaving(true)
    setError(null)
    clearFormError()
    setOk(false)
    try {
      await updateProfile({
        fullName,
        companyName: companyName || null,
        tin: tin || null,
        brn: brn || null,
        sstNumber: sstNumber || null,
        ttxNumber: ttxNumber || null,
        msicCode: msicCode || null,
        msicDescription: msicDescription || null,
        contactNumber: contactNumber || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        city: city || null,
        postalZone: postalZone || null,
        stateCode: stateCode || null,
      })
      await session.refreshProfile()
      setOk(true)
    } catch (e) {
      setError(e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // When the user picks an MSIC code, auto-fill the business activity from
  // the table (they can still edit it — the description is mandatory too).
  const onMsicPicked = (code: string) => {
    setMsicCode(code)
    const hit = MSIC_CODES.find((m) => m.code === code)
    if (hit && !msicDescription.trim()) setMsicDescription(hit.label)
  }

  return (
    <GradientBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={[pageContentStyle, { paddingTop: space.xxxl + top, paddingBottom: 150 }]}>
        <View style={styles.header} ref={headerRef}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.azure} />
          </Pressable>
          <Text style={styles.title}>Profile</Text>
          <TourButton steps={tourSteps} />
        </View>
        <Text style={styles.subtitle}>
          Your TIN & company name are required in the e-invoice submitted to LHDN.
        </Text>

        <View ref={formRef}>
        <GlassCard strong style={styles.form}>
          <ValidatedField ref={fullNameRef} label="Full name" icon="person-outline" value={fullName} onChange={setFullName}
            validate={compose(required('Full name'), minLength('Full name', 2), maxLength('Full name', 100))} placeholder="Your full name" autoCap="words" />
          <ValidatedField ref={companyNameRef} label="Company name" icon="business-outline" value={companyName} onChange={setCompanyName}
            validate={compose(required('Company name'), minLength('Company name', 3), maxLength('Company name', 300))}
            placeholder="Neyobytes Solutions Sdn Bhd" autoCap="words" hint="Mandatory for LHDN submission." />
          <ValidatedField ref={tinRef} label="TIN" icon="ribbon-outline" value={tin} onChange={setTin}
            validate={tinV()} placeholder="C1234567890" autoCap="characters"
            hint="Your LHDN Tax Identification Number — a letter prefix + digits." />
        </GlassCard>
      </View>

        <Text style={styles.sectionTitle}>Supplier identity (for LHDN e-invoice)</Text>
        <Text style={styles.subtitle}>Required by the MyInvois Core Fields Validator. Leave blank/NA where not applicable.</Text>
        <GlassCard strong style={styles.form}>
          <ValidatedField ref={brnRef} label="BRN / SSM (Business Reg. No.)" icon="document-text-outline" value={brn} onChange={setBrn}
            validate={compose(required('BRN'), minLength('BRN', 5), maxLength('BRN', FIELD_RULES.brn.max))}
            placeholder="202001234567" autoCap="characters" hint="SSM business registration number." />
          <ValidatedField ref={sstRef} label="SST number" icon="receipt-outline" value={sstNumber} onChange={setSstNumber}
            validate={compose(maxLength('SST number', FIELD_RULES.sst.max), (v) => v.trim().length === 0 || v.trim().toUpperCase() === 'NA' || /^[A-Z]{2,4}-\d{4,}-\d{4,}$/i.test(v) ? null : 'Use the format A01-2345-67891012, or NA if not SST-registered.')}
            placeholder="A01-2345-67891012 or NA" autoCap="characters" hint="Enter NA if you are not SST-registered." />
          <ValidatedField ref={ttxRef} label="Tourism Tax / TTX" icon="boat-outline" value={ttxNumber} onChange={setTtxNumber}
            validate={compose(maxLength('TTX', FIELD_RULES.ttx.max), (v) => v.trim().length === 0 || v.trim().toUpperCase() === 'NA' || /^\d{3}-\d{4}-\d{8}$/i.test(v) ? null : 'Use the format 123-4567-89012345, or NA if not registered.')}
            placeholder="123-4567-89012345 or NA" autoCap="characters" hint="Enter NA if you are not tourism-tax registered." />
          <CodePicker label="MSIC code (business activity)" icon="pricetag-outline" options={MSIC_CODES} value={msicCode} onChange={onMsicPicked}
            placeholder="Search 1,175 MSIC codes…" required />
          <ValidatedField label="Business activity" icon="briefcase-outline" value={msicDescription} onChange={setMsicDescription}
            validate={compose(required('Business activity'), maxLength('Business activity', 300))}
            placeholder="Wholesale of computer hardware" hint="Auto-filled from the MSIC code; edit if needed." />
          <ValidatedField ref={contactRef} label="Contact number" icon="call-outline" value={contactNumber} onChange={setContactNumber}
            validate={compose(required('Contact number'), phoneV())} placeholder="+60123456789" keyboardType="phone-pad"
            hint="E.164 format, e.g. +60123456789." />
        </GlassCard>

        <Text style={styles.sectionTitle}>Business address</Text>
        <GlassCard strong style={styles.form}>
          <ValidatedField ref={addr1Ref} label="Address line 1" icon="location-outline" value={addressLine1} onChange={setAddressLine1}
            validate={compose(required('Address line 1'), maxLength('Address line 1', FIELD_RULES.addressLine.max))} placeholder="Lot 66" />
          <ValidatedField label="Address line 2 (optional)" icon="location-outline" value={addressLine2} onChange={setAddressLine2}
            validate={maxLength('Address line 2', FIELD_RULES.addressLine.max)} placeholder="Bangunan Merdeka" />
          <ValidatedField ref={cityRef} label="City" icon="business-outline" value={city} onChange={setCity}
            validate={compose(required('City'), maxLength('City', FIELD_RULES.city.max))} placeholder="Kuala Lumpur" />
          <ValidatedField ref={postalRef} label="Postal zone" icon="mail-outline" value={postalZone} onChange={setPostalZone}
            validate={maxLength('Postal zone', FIELD_RULES.postalZone.max)} placeholder="50480" keyboardType="numeric" />
          <CodePicker label="State" icon="map-outline" options={STATE_CODES} value={stateCode} onChange={setStateCode}
            placeholder="Select a Malaysian state…" required />
        </GlassCard>

        {formError ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <Text style={styles.error}>{formError}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
        {ok ? (
          <View style={styles.okRow}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Text style={styles.ok}>Saved</Text>
          </View>
        ) : null}

        <Pressable
          ref={saveRef}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.savePressed]}
          onPress={save}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color={colors.snow} /> : <Text style={styles.saveText}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </GradientBackground>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginBottom: space.lg, lineHeight: 20 },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 12, color: colors.slate, textTransform: 'uppercase', marginTop: space.xl, marginBottom: space.xs, marginLeft: space.xs },
  form: { padding: space.xl, gap: space.lg },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md },
  ok: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.success },
  saveBtn: {
    backgroundColor: colors.azure, borderRadius: radius.md, paddingVertical: space.lg,
    alignItems: 'center', marginTop: space.lg, ...shadow.card,
  },
  savePressed: { opacity: 0.9 },
  saveText: { fontFamily: font.displayBold, fontSize: 16, color: colors.snow },
})