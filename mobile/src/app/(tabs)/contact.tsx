/**
 * Contact — three ways to reach support, each a glass action card that opens
 * the device handler (mailto / tel / WhatsApp). Plain verbs, real addresses,
 * no marketing copy.
 */
import { View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GradientBackground, GlassCard } from '../../theme/glass'
import { colors, font, space, radius, shadow } from '../../theme/tokens'

const SUPPORT_EMAIL = 'support@neyobytes.com'
const SUPPORT_PHONE = '+60312345678'
const WHATSAPP_NUMBER = '60123456789' // no +, for wa.me

export default function ContactScreen() {
  return (
    <GradientBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingTop: space.xxxl, paddingHorizontal: space.xl, paddingBottom: 120 }}>
        <Text style={styles.title}>Contact</Text>
        <Text style={styles.sub}>We usually reply within one business day.</Text>

        <ContactCard
          icon="mail-outline"
          tint={colors.azure}
          label="Email"
          value={SUPPORT_EMAIL}
          sub="Best for detailed questions and screenshots"
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=auto-invoice%20support`)}
        />
        <ContactCard
          icon="call-outline"
          tint={colors.success}
          label="Phone"
          value={SUPPORT_PHONE}
          sub="Mon–Fri, 9am–6pm MYT"
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}
        />
        <ContactCard
          icon="logo-whatsapp"
          tint={colors.success}
          label="WhatsApp"
          value={`+${WHATSAPP_NUMBER}`}
          sub="Fastest for quick questions"
          onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}`)}
        />

        <GlassCard style={styles.hoursCard}>
          <Text style={styles.hoursTitle}>Response times</Text>
          <Text style={styles.hoursText}>
            Email & WhatsApp: within 1 business day. Phone: same day during
            business hours. Critical submission issues are prioritized.
          </Text>
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  )
}

function ContactCard({
  icon, tint, label, value, sub, onPress,
}: { icon: keyof typeof Ionicons.glyphMap; tint: string; label: string; value: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.card}>
        <View style={[styles.iconBadge, { backgroundColor: tint + '1A' }]}>
          <Ionicons name={icon} size={22} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.subText}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.silver} />
      </GlassCard>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  title: { fontFamily: font.displayBold, fontSize: 30, color: colors.ink, letterSpacing: -0.5 },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginTop: 4, marginBottom: space.xl },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.lg, paddingVertical: space.lg,
    marginBottom: space.md,
  },
  iconBadge: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.body, fontSize: 12, color: colors.slate },
  value: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink, marginTop: 2 },
  subText: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 4 },
  hoursCard: { padding: space.lg, marginTop: space.xl, gap: space.xs },
  hoursTitle: { fontFamily: font.displayBold, fontSize: 15, color: colors.ink },
  hoursText: { fontFamily: font.body, fontSize: 13, color: colors.slate, lineHeight: 19 },
})