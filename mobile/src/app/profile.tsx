/**
 * Profile screen — edit the supplier's own profile (name, company name, TIN).
 * These fields are mandatory for LHDN submission, so the home tab gates submit
 * on this being filled. Glass form over the gradient.
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { updateProfile } from '../services/authService'
import { useSession } from '../viewmodels/useSession'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { TourButton, type TourStep } from '../components/TourButton'
import { colors, font, space, radius, shadow } from '../theme/tokens'

export default function ProfileScreen() {
  const session = useSession()
  const p = session.profile
  const [fullName, setFullName] = useState(p?.fullName ?? '')
  const [companyName, setCompanyName] = useState(p?.companyName ?? '')
  const [tin, setTin] = useState(p?.tin ?? '')
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

  // Sign-out happens here; route to login ourselves.
  useEffect(() => {
    if (session.status === 'anonymous') router.replace('/login')
  }, [session.status])

  const save = async () => {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      await updateProfile({ fullName, companyName: companyName || null, tin: tin || null })
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
      <ScrollView style={styles.scroll} contentContainerStyle={[pageContentStyle, { paddingTop: space.xxxl, paddingBottom: 150 }]}>
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
  label, icon, value, onChange, placeholder, autoCap,
}: { label: string; icon: keyof typeof Ionicons.glyphMap; value: string; onChange: (v: string) => void; placeholder?: string; autoCap?: 'characters' | 'none' | 'words' }) {
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