/**
 * Connect LHDN — link the user's own MyInvois ERP credentials.
 *
 * Per-user model (Login as Taxpayer System): the taxpayer generates an ERP
 * client_id/client_secret pair on the MyInvois portal
 * (profile.myinvois.hasil.gov.my → Generate ERP), then pastes it here. The
 * backend stores the secret encrypted; only the client_id + connection date
 * are ever returned. Submit/validate-tin use this pair to fetch a per-user
 * OAuth2 token, so a user MUST connect before any real (non-mock) LHDN call.
 */
import { useRef, useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Linking, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as myinvoisService from '../services/myinvoisService'
import { useSession } from '../viewmodels/useSession'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { TourButton, type TourStep } from '../components/TourButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAuthGate } from '../components/RequireAuth'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'
import { apiErrorMessage } from '../http/client'

const PORTAL_URL = 'https://profile.myinvois.hasil.gov.my/TaxpayerProfile'

export default function ConnectMyInvoisScreen() {
  const { top } = useSafeInsets()
  const session = useSession()
  const p = session.profile

  const [clientId, setClientId] = useState(p?.myinvoisClientId ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const headerRef = useRef<View>(null)
  const formRef = useRef<View>(null)
  const saveRef = useRef<View>(null)
  const tourSteps: TourStep[] = [
    {
      id: 'connect', targetRef: headerRef, badge: 'Connect LHDN',
      title: 'Link your LHDN account',
      description: 'Each user submits using their own ERP key generated on the MyInvois portal — connect once to enable real submissions.',
    },
    {
      id: 'form', targetRef: formRef,
      title: 'Paste your ERP credentials',
      description: 'Copy the Client ID and Client Secret from the MyInvois portal and paste them here. The secret is stored encrypted.',
    },
    {
      id: 'save', targetRef: saveRef,
      title: 'Save',
      description: 'Saves the connection. You can disconnect or rotate the key any time.',
    },
  ]

  // Auth gate — anonymous users bounce to /login before anything renders.
  const gate = useAuthGate()
  if (gate) return gate

  const connected = Boolean(p?.myinvoisClientId)
  const canSave = clientId.trim().length > 0 && clientSecret.length > 0 && !saving

  const save = async () => {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      await myinvoisService.connectMyInvois(clientId.trim(), clientSecret)
      await session.refreshProfile()
      setClientSecret('')
      setOk(true)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const doDisconnect = async () => {
    setDisconnecting(true)
    setError(null)
    try {
      await myinvoisService.disconnectMyInvois()
      await session.refreshProfile()
      setClientId('')
      setClientSecret('')
      setConfirmDisconnect(false)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <GradientBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={[pageContentStyle, { paddingTop: space.xxxl + top, paddingBottom: 150 }]}>
        <View style={styles.header} ref={headerRef}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.azure} />
          </Pressable>
          <Text style={styles.title}>Connect LHDN</Text>
          <TourButton steps={tourSteps} />
        </View>
        <Text style={styles.subtitle}>
          You submit e-invoices using your own ERP key from the MyInvois portal.
          Generate it once, then paste it below. The secret is stored encrypted.
        </Text>

        {/* How to get the key */}
        <GlassCard style={styles.steps}>
          <Text style={styles.stepsTitle}>How to get your ERP key</Text>
          <Text style={styles.stepText}>
            <Text style={styles.stepNum}>1. </Text>
            Sign in at the MyInvois taxpayer portal (use your TIN + password).
          </Text>
          <Text style={styles.stepText}>
            <Text style={styles.stepNum}>2. </Text>
            Open your profile and tap{' '}
            <Text style={styles.stepEmph}>Generate ERP</Text>.
          </Text>
          <Text style={styles.stepText}>
            <Text style={styles.stepNum}>3. </Text>
            Copy the{' '}
            <Text style={styles.stepEmph}>Client ID</Text> and{' '}
            <Text style={styles.stepEmph}>Client Secret</Text> shown (the secret
            is only visible once — copy it now).
          </Text>
          <Pressable style={styles.portalBtn} onPress={() => Linking.openURL(PORTAL_URL)}>
            <Ionicons name="open-outline" size={16} color={colors.azure} />
            <Text style={styles.portalText}>
              {Platform.OS === 'web' ? 'Open profile.myinvois.hasil.gov.my' : 'Open MyInvois portal'}
            </Text>
          </Pressable>
        </GlassCard>

        {connected ? (
          <View style={styles.connectedBanner}>
            <Ionicons name="shield-checkmark" size={18} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.connectedTitle}>LHDN account connected</Text>
              <Text style={styles.connectedSub}>
                Client ID: {maskId(p?.myinvoisClientId)}
                {p?.myinvoisConnectedAt
                  ? ` · since ${new Date(p.myinvoisConnectedAt).toLocaleDateString()}`
                  : ''}
              </Text>
            </View>
          </View>
        ) : null}

        <View ref={formRef}>
        <GlassCard strong style={styles.form}>
          <Field
            label="Client ID"
            icon="key-outline"
            value={clientId}
            onChange={setClientId}
            placeholder="e.g. 9a1f...ERP client id"
            autoCap="none"
          />
          <SecretField
            value={clientSecret}
            onChange={setClientSecret}
            show={showSecret}
            onToggle={() => setShowSecret((s) => !s)}
          />
        </GlassCard>
      </View>

        <Text style={styles.hint}>
          Re-connect with a fresh secret any time to rotate an expiring key.
        </Text>

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
        {ok ? (
          <View style={styles.okRow}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Text style={styles.ok}>LHDN account connected</Text>
          </View>
        ) : null}

        <Pressable
          ref={saveRef}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.savePressed, !canSave && styles.saveDisabled]}
          onPress={save}
          disabled={!canSave}
        >
          {saving ? <ActivityIndicator color={colors.snow} /> : (
            <Text style={styles.saveText}>{connected ? 'Update credentials' : 'Connect'}</Text>
          )}
        </Pressable>

        {connected ? (
          <Pressable
            style={({ pressed }) => [styles.disconnectBtn, pressed && styles.disconnectPressed]}
            onPress={() => setConfirmDisconnect(true)}
            disabled={disconnecting}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.disconnectText}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect LHDN account'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect LHDN account?"
        message="We'll forget your stored ERP key. You won't be able to submit to LHDN until you reconnect."
        confirmText="Disconnect"
        destructive
        busy={disconnecting}
        onConfirm={doDisconnect}
        onClose={() => setConfirmDisconnect(false)}
      />
    </GradientBackground>
  )
}

function maskId(id: string | null | undefined): string {
  if (!id) return '—'
  if (id.length <= 8) return id
  return `${id.slice(0, 4)}…${id.slice(-4)}`
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
          autoCorrect={false}
        />
      </View>
    </View>
  )
}

function SecretField({
  value, onChange, show, onToggle,
}: { value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Client Secret</Text>
      <View style={styles.inputWrap} {...(Platform.OS === 'web' ? { className: 'field-input' } : {})}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.slate} style={styles.fieldIcon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="Paste your ERP client secret"
          placeholderTextColor={colors.slate}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={onToggle} hitSlop={10} style={styles.eyeBtn}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.slate} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginBottom: space.lg, lineHeight: 20 },
  steps: { padding: space.lg, gap: space.sm, marginBottom: space.lg },
  stepsTitle: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink, marginBottom: space.xs },
  stepText: { fontFamily: font.body, fontSize: 13, color: colors.slate, lineHeight: 19 },
  stepNum: { fontFamily: font.bodyMedium, color: colors.azure },
  stepEmph: { fontFamily: font.bodyMedium, color: colors.ink },
  portalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm,
    alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: colors.azure + '14', borderRadius: radius.md,
  },
  portalText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.azure },
  connectedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.success + '14', borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md, marginBottom: space.lg,
  },
  connectedTitle: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink },
  connectedSub: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 2 },
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
  eyeBtn: { padding: 4 },
  hint: { fontFamily: font.body, fontSize: 12, color: colors.silver, marginTop: space.md, lineHeight: 17 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md },
  error: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.danger },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md },
  ok: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.success },
  saveBtn: {
    backgroundColor: colors.azure, borderRadius: radius.md, paddingVertical: space.lg,
    alignItems: 'center', marginTop: space.lg, ...shadow.card,
  },
  savePressed: { opacity: 0.9 },
  saveDisabled: { opacity: 0.5 },
  saveText: { fontFamily: font.displayBold, fontSize: 16, color: colors.snow },
  disconnectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: space.md, marginTop: space.md,
  },
  disconnectPressed: { opacity: 0.6 },
  disconnectText: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.danger },
})