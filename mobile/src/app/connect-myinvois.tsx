/**
 * Connect LHDN — link the user's own MyInvois ERP credentials.
 *
 * Per-user model (Login as Taxpayer System): the taxpayer generates an ERP
 * client_id/client_secret pair on the MyInvois portal
 * (mytax.hasil.gov.my → My Invois, or myinvois.hasil.gov.my → Generate ERP),
 * then pastes it here. The backend stores the secret encrypted; only the
 * client_id + connection date are ever returned. Submit/validate-tin use
 * this pair to fetch a per-user OAuth2 token, so a user MUST connect before
 * any real (non-mock) LHDN call.
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
import { useValidatedForm } from '../viewmodels/useValidatedForm'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { TourButton, type TourStep } from '../components/TourButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAuthGate } from '../components/RequireAuth'
import { ValidatedField, type ValidatedFieldHandle } from '../components/ValidatedField'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'
import { apiErrorMessage } from '../http/client'
import { compose, required, minLength, maxLength } from '../lib/validation'

const MYTAX_URL = 'https://mytax.hasil.gov.my/'
const MYINVOIS_PORTAL_URL = 'https://myinvois.hasil.gov.my/'

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
      description: 'To submit real e-invoices, you use your own ERP key from the MyInvois portal. Connect once here and submit is live — no mock responses.',
    },
    {
      id: 'form', targetRef: formRef,
      title: 'Paste your ERP credentials',
      description: 'Copy the Client ID and Client Secret from the MyInvois portal (see the steps above) and paste them here. The secret is stored encrypted — only the Client ID is ever shown back.',
    },
    {
      id: 'save', targetRef: saveRef,
      title: 'Save',
      description: 'Saves the connection. You can disconnect or rotate the key any time if it expires.',
    },
  ]

  // Auth gate — anonymous users bounce to /login before anything renders.
  const gate = useAuthGate()
  if (gate) return gate

  const connected = Boolean(p?.myinvoisClientId)
  const clientIdRef = useRef<ValidatedFieldHandle>(null)
  const secretRef = useRef<ValidatedFieldHandle>(null)
  const { formError, runValidation, clearFormError } = useValidatedForm([clientIdRef, secretRef])
  const canSave = clientId.trim().length > 0 && clientSecret.length > 0 && !saving

  const save = async () => {
    // Validate both halves before sending; block while invalid.
    if (!runValidation()) return
    clearFormError()
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
            Sign in to the MyInvois taxpayer portal with your TIN + password.
            Two ways in:
          </Text>

          {/* Option A — MyTax */}
          <Pressable style={styles.portalCard} onPress={() => Linking.openURL(MYTAX_URL)}>
            <View style={styles.portalCardTop}>
              <Ionicons name="open-outline" size={16} color={colors.azure} />
              <Text style={styles.portalText}>mytax.hasil.gov.my</Text>
            </View>
            <Text style={styles.portalSub}>
              Log in, then open{' '}
              <Text style={styles.stepEmph}>My Invois</Text>{' '}
              in the navigation menu at the top.
            </Text>
          </Pressable>

          <Text style={styles.orText}>or</Text>

          {/* Option B — MyInvois direct */}
          <Pressable style={styles.portalCard} onPress={() => Linking.openURL(MYINVOIS_PORTAL_URL)}>
            <View style={styles.portalCardTop}>
              <Ionicons name="open-outline" size={16} color={colors.azure} />
              <Text style={styles.portalText}>myinvois.hasil.gov.my</Text>
            </View>
            <Text style={styles.portalSub}>Direct MyInvois portal login.</Text>
          </Pressable>

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
          <ValidatedField ref={clientIdRef} label="Client ID" icon="key-outline" value={clientId} onChange={setClientId}
            validate={compose(required('Client ID'), minLength('Client ID', 6), maxLength('Client ID', 200))}
            placeholder="e.g. 9a1f...ERP client id" autoCap="none" hint="From the MyInvois portal → your profile → Generate ERP." />
          <ValidatedField ref={secretRef} label="Client Secret" icon="lock-closed-outline" value={clientSecret} onChange={setClientSecret}
            validate={compose(required('Client secret'), minLength('Client secret', 8), maxLength('Client secret', 400))}
            placeholder="Paste your ERP client secret" secure={!showSecret} hint="Encrypted at rest; only shown to you once on the portal."
            trailing={
              <Pressable onPress={() => setShowSecret((s) => !s)} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name={showSecret ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.slate} />
              </Pressable>
            } />
        </GlassCard>
      </View>

        <Text style={styles.hint}>
          Re-connect with a fresh secret any time to rotate an expiring key.
        </Text>

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
  portalCard: {
    gap: 2,
    marginTop: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: colors.azure + '14',
    borderRadius: radius.md,
  },
  portalCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  portalText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.azure },
  portalSub: { fontFamily: font.body, fontSize: 12, color: colors.slate, lineHeight: 17 },
  orText: { fontFamily: font.body, fontSize: 12, color: colors.silver, textAlign: 'center', marginVertical: 2 },
  connectedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.success + '14', borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md, marginBottom: space.lg,
  },
  connectedTitle: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink },
  connectedSub: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 2 },
  form: { padding: space.xl, gap: space.lg },
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