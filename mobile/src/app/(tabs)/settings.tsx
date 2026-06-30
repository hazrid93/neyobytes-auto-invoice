/**
 * Settings — account + MyInvois configuration + sign-out. Groups the
 * supplier profile (TIN/company, required for LHDN), the active MyInvois mode,
 * the signed-in account, and a destructive sign-out. Reads the session +
 * submit view models.
 */
import { useEffect, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSession } from '../../viewmodels/useSession'
import { useSubmit } from '../../viewmodels/useSubmit'
import { GradientBackground, GlassCard } from '../../theme/glass'
import { PageContainer } from '../../theme/page'
import { TourButton, type TourStep } from '../../components/TourButton'
import { colors, font, space, radius } from '../../theme/tokens'
import { useSafeInsets } from '../../theme/useSafeInsets'

export default function SettingsScreen() {
  const { top } = useSafeInsets()
  const session = useSession()
  const submitVm = useSubmit()

  useEffect(() => {
    submitVm.loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const p = session.profile

  const headerRef = useRef<View>(null)
  const profileRef = useRef<View>(null)
  const modeRef = useRef<View>(null)
  const signOutRef = useRef<View>(null)
  const tourSteps: TourStep[] = [
    {
      id: 'settings', targetRef: headerRef, badge: 'Settings',
      title: 'Account & LHDN config',
      description: 'Manage your supplier profile, your LHDN connection, and your account here.',
    },
    {
      id: 'profile', targetRef: profileRef,
      title: 'Supplier profile',
      description: 'Name, company, and TIN. Tap a row to edit — company + TIN are required before you can submit.',
    },
    {
      id: 'mode', targetRef: modeRef,
      title: 'MyInvois (LHDN)',
      description: 'Shows whether submissions go to the real LHDN API or run in mock mode.',
    },
    {
      id: 'signout', targetRef: signOutRef,
      title: 'Sign out',
      description: 'Ends your session on this device.',
    },
  ]

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={{ paddingTop: space.xxxl + top, paddingBottom: 150 }}>
        <PageContainer>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} ref={headerRef}>
          <Text style={styles.title}>Settings</Text>
          <TourButton steps={tourSteps} />
        </View>

        <View ref={profileRef}>
        <SectionLabel>Supplier profile</SectionLabel>
        <GlassCard style={styles.card}>
          <Row
            icon="person-outline"
            label="Name"
            value={p?.fullName ?? '—'}
            action={() => router.push('/profile')}
          />
          <Divider />
          <Row
            icon="business-outline"
            label="Company"
            value={p?.companyName ?? 'Not set'}
            muted={!p?.companyName}
            action={() => router.push('/profile')}
          />
          <Divider />
          <Row
            icon="ribbon-outline"
            label="TIN"
            value={p?.tin ?? 'Not set'}
            muted={!p?.tin}
            action={() => router.push('/profile')}
          />
        </GlassCard>
      </View>

        <View ref={modeRef}>
        <SectionLabel>MyInvois (LHDN)</SectionLabel>
        <GlassCard style={styles.card}>
          <Row
            icon={submitVm.mode === 'mock' ? 'flask-outline' : 'shield-checkmark-outline'}
            label="Mode"
            value={submitVm.mode ? submitVm.mode.toUpperCase() : '—'}
          />
          <Divider />
          {submitVm.status?.credMode === 'intermediary' ? (
            <Row
              icon="people-outline"
              label="Intermediary"
              value={p?.tin ? 'Add us in your portal' : 'Set your TIN first'}
              muted={!p?.tin}
              action={() => router.push('/appoint-intermediary')}
            />
          ) : (
            <Row
              icon="key-outline"
              label="LHDN account"
              value={p?.myinvoisClientId ? 'Connected' : 'Not connected'}
              muted={!p?.myinvoisClientId}
              action={() => router.push('/connect-myinvois')}
            />
          )}
          <Divider />
          <View style={styles.noteRow}>
            <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
            <Text style={styles.note}>
              {submitVm.mode === 'mock'
                ? 'Submissions return canned responses. Switch to sandbox or prod in the backend .env once you have LHDN credentials + a signing cert.'
                : submitVm.status?.credMode === 'intermediary'
                  ? 'Intermediary mode — you appoint our company in your MyInvois portal (by our TIN), then we submit on your behalf. Set your TIN in your profile first.'
                  : p?.myinvoisClientId
                    ? 'Live LHDN mode — submissions go to the real government API using your linked ERP key.'
                    : 'Live LHDN mode — connect your ERP key (generated on the MyInvois portal) to submit.'}
            </Text>
          </View>
        </GlassCard>
      </View>

        <SectionLabel>Account</SectionLabel>
        <GlassCard style={styles.card}>
          <Row icon="mail-outline" label="Email" value={p?.email ?? '—'} />
        </GlassCard>

        <Pressable
          ref={signOutRef}
          style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
          onPress={() => session.logout()}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.snow} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Text style={styles.version}>auto-invoice · v0.1.0</Text>
        </PageContainer>
      </ScrollView>
    </GradientBackground>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>
}
function Divider() {
  return <View style={styles.divider} />
}
function Row({
  icon, label, value, muted, action,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; muted?: boolean; action?: () => void }) {
  return (
    <Pressable style={styles.row} onPress={action} disabled={!action}>
      <Ionicons name={icon} size={18} color={colors.azure} style={styles.rowIcon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, muted && styles.rowValueMuted]}>{value}</Text>
      </View>
      {action && <Ionicons name="chevron-forward" size={16} color={colors.silver} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontFamily: font.displayBold, fontSize: 30, color: colors.ink, letterSpacing: -0.5, marginBottom: space.xl },
  sectionLabel: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate, textTransform: 'uppercase', marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs },
  card: { paddingHorizontal: space.lg, paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  rowIcon: { marginRight: space.md },
  rowLabel: { fontFamily: font.body, fontSize: 12, color: colors.slate },
  rowValue: { fontFamily: font.bodyMedium, fontSize: 15, color: colors.ink, marginTop: 1 },
  rowValueMuted: { color: colors.slate },
  divider: { height: 1, backgroundColor: colors.silver + '55', marginLeft: 40 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.md },
  note: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.slate, lineHeight: 19 },
  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.danger, borderRadius: radius.lg,
    paddingVertical: space.md + 2, marginTop: space.xxl,
  },
  signOutPressed: { opacity: 0.9 },
  signOutText: { fontFamily: font.displayBold, fontSize: 15, color: colors.snow },
  version: { fontFamily: font.body, fontSize: 12, color: colors.silver, textAlign: 'center', marginTop: space.xl },
})