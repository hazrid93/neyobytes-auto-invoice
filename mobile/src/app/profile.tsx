/**
 * Profile screen — edit the supplier's own profile (name, company name, TIN).
 * These fields are mandatory for LHDN submission, so the home tab gates submit
 * on this being filled. Glass form over the gradient.
 */
import { useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { updateProfile } from '../services/authService'
import { useSession } from '../viewmodels/useSession'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { TourButton, type TourStep } from '../components/TourButton'
import { useAuthGate } from '../components/RequireAuth'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'

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
  const tourSteps: TourStep[] = [
    {
      id: 'profile', targetRef: headerRef, badge: 'Profile',
      title: 'Your supplier details',
      description: 'These details go on every e-invoice you submit to LHDN. Fill them in once.',
    },
    {
      id: 'form', targetRef: formRef,
      title: 'Required fields',
      description: 'Company name and TIN are mandatory — submit stays disabled until both are set.',
    },
    {
      id: 'save', targetRef: saveRef,
      title: 'Save',
      description: 'Tap to save. Your profile is used on the next submission.',
    },
  ]

  // Auth gate — an anonymous user (e.g. after sign-out) is bounced to /login
  // before any profile field renders.
  const gate = useAuthGate()
  if (gate) return gate

  const save = async () => {
    setSaving(true)
    setError(null)
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
          <Field label="Full name" icon="person-outline" value={fullName} onChange={setFullName} />
          <Field label="Company name" icon="business-outline" value={companyName} onChange={setCompanyName} placeholder="Neyobytes Solutions Sdn Bhd" />
          <Field label="TIN" icon="ribbon-outline" value={tin} onChange={setTin} placeholder="C1234567899" autoCap="characters" />
        </GlassCard>
      </View>

        <Text style={styles.sectionTitle}>Supplier identity (for LHDN e-invoice)</Text>
        <Text style={styles.subtitle}>Required by the MyInvois Core Fields Validator. Leave blank/NA where not applicable.</Text>
        <GlassCard strong style={styles.form}>
          <Field label="BRN / SSM (Business Reg. No.)" icon="document-text-outline" value={brn} onChange={setBrn} placeholder="202001234567" autoCap="characters" />
          <Field label="SST number (NA if none)" icon="receipt-outline" value={sstNumber} onChange={setSstNumber} placeholder="A01-2345-67891012 or NA" autoCap="characters" />
          <Field label="Tourism Tax / TTX (NA if none)" icon="boat-outline" value={ttxNumber} onChange={setTtxNumber} placeholder="123-4567-89012345 or NA" autoCap="characters" />
          <Field label="MSIC code (5-digit)" icon="pricetag-outline" value={msicCode} onChange={setMsicCode} placeholder="46510" autoCap="characters" />
          <Field label="Business activity" icon="briefcase-outline" value={msicDescription} onChange={setMsicDescription} placeholder="Wholesale of computer hardware" />
          <Field label="Contact number (E.164)" icon="call-outline" value={contactNumber} onChange={setContactNumber} placeholder="+60123456789" keyboardType="phone-pad" />
        </GlassCard>

        <Text style={styles.sectionTitle}>Business address</Text>
        <GlassCard strong style={styles.form}>
          <Field label="Address line 1" icon="location-outline" value={addressLine1} onChange={setAddressLine1} placeholder="Lot 66" />
          <Field label="Address line 2 (optional)" icon="location-outline" value={addressLine2} onChange={setAddressLine2} placeholder="Bangunan Merdeka" />
          <Field label="City" icon="business-outline" value={city} onChange={setCity} placeholder="Kuala Lumpur" />
          <Field label="Postal zone" icon="mail-outline" value={postalZone} onChange={setPostalZone} placeholder="50480" keyboardType="numeric" />
          <Field label="State code (01–17)" icon="map-outline" value={stateCode} onChange={setStateCode} placeholder="10" keyboardType="numeric" />
        </GlassCard>

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

function Field({
  label, icon, value, onChange, placeholder, autoCap, keyboardType,
}: { label: string; icon: keyof typeof Ionicons.glyphMap; value: string; onChange: (v: string) => void; placeholder?: string; autoCap?: 'characters' | 'none' | 'words'; keyboardType?: 'phone-pad' | 'numeric' | 'default' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap} {...(Platform.OS === 'web' ? { className: 'field-input' } : {})}>
        <Ionicons name={icon} size={18} color={colors.slate} style={styles.fieldIcon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.slate}
          autoCapitalize={autoCap ?? 'none'}
          keyboardType={keyboardType ?? 'default'}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginBottom: space.lg, lineHeight: 20 },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 12, color: colors.slate, textTransform: 'uppercase', marginTop: space.xl, marginBottom: space.xs, marginLeft: space.xs },
  form: { padding: space.xl, gap: space.lg },
  field: { gap: space.xs },
  label: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.snow + 'CC', borderColor: colors.silver, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: space.md,
  },
  fieldIcon: { marginRight: space.sm },
  input: { flex: 1, fontFamily: font.body, fontSize: 16, color: colors.ink, paddingVertical: space.md },
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