/**
 * Profile screen — edit the supplier's own profile (name, company name, TIN).
 * These fields are mandatory for LHDN submission (the UBL document requires
 * the supplier TIN + company name), so the dashboard gates the submit button
 * on this being filled. Uses the session view model's refresh to keep the
 * shared profile state in sync.
 */
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { updateProfile } from '../services/authService'
import { useSession } from '../viewmodels/useSession'
import { colors, font, space, radius } from '../theme/tokens'

export default function ProfileScreen() {
  const session = useSession()
  const p = session.profile
  const [fullName, setFullName] = useState(p?.fullName ?? '')
  const [companyName, setCompanyName] = useState(p?.companyName ?? '')
  const [tin, setTin] = useState(p?.tin ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

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
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Pressable onPress={() => session.logout()} hitSlop={8}>
          <Text style={styles.logout}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        Your TIN & company name are required in the e-invoice submitted to LHDN.
      </Text>

      <Field label="Full name" value={fullName} onChange={setFullName} />
      <Field label="Company name" value={companyName} onChange={setCompanyName} placeholder="Neyobytes Solutions Sdn Bhd" />
      <Field label="TIN" value={tin} onChange={setTin} placeholder="C1234567899" autoCap="characters" />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {ok ? <Text style={styles.ok}>Saved ✓</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.saveBtn, pressed && styles.savePressed]}
        onPress={save}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>Save</Text>}
      </Pressable>

      <Pressable onPress={() => router.push('/dashboard')} style={styles.back}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>
  )
}

function Field({
  label, value, onChange, placeholder, autoCap,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoCap?: 'characters' | 'none' | 'words' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.arang}
        autoCapitalize={autoCap ?? 'none'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, padding: space.xxl, paddingTop: space.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  logout: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.merah },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.arang, marginTop: space.xs, marginBottom: space.xl },
  field: { marginBottom: space.lg, gap: space.xs },
  label: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.arang },
  input: {
    fontFamily: font.body, fontSize: 16, color: colors.ink,
    borderWidth: 1, borderColor: colors.arang + '40', borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
  },
  error: { fontFamily: font.body, fontSize: 14, color: colors.merah },
  ok: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.hijau },
  saveBtn: { backgroundColor: colors.kuning, borderRadius: radius.md, paddingVertical: space.lg, alignItems: 'center', marginTop: space.sm },
  savePressed: { opacity: 0.88 },
  saveText: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  back: { paddingVertical: space.md, alignItems: 'center', marginTop: space.lg },
  backText: { fontFamily: font.body, fontSize: 14, color: colors.arang },
})