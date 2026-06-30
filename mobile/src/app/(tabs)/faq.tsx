/**
 * FAQ — accordion-less Q/A cards answering the real questions an SME owner has
 * about e-invoicing with this app: what LHDN is, what invoices
 * are supported, data privacy, and how OCR works. Real content, no filler.
 */
import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GradientBackground, GlassCard } from '../../theme/glass'
import { pageContentStyle } from '../../theme/page'
import { colors, font, space } from '../../theme/tokens'

interface QA { q: string; a: string }

const FAQS: QA[] = [
  {
    q: 'What is LHDN e-invoicing?',
    a: 'LHDN (Lembaga Hasil Dalam Negeri) is Malaysia’s Inland Revenue Board. Its e-invoicing system lets businesses submit structured electronic invoices for validation. Validated invoices receive a unique ID and are considered compliant for tax purposes.',
  },
  {
    q: 'What kinds of invoices can I capture?',
    a: 'Any Malaysian SME invoice or receipt — sales invoices, purchase receipts, expense invoices. Photograph the paper document or upload an image. The model reads the seller, buyer, line items, totals, and tax, then drafts an e-invoice for you to confirm.',
  },
  {
    q: 'How accurate is the extraction?',
    a: 'The app uses a two-stage pipeline: a vision model transcribes the photo to text, then a text model structures it into JSON. Each result includes a confidence score. Always review the draft before submitting — confirm totals, dates, and the TIN are correct.',
  },
  {
    q: 'What do I need before submitting to LHDN?',
    a: 'A TIN and company name on your supplier profile, plus LHDN client credentials and a POS Digicert signing certificate for sandbox or production. The submit button stays disabled until your supplier profile is complete.',
  },
  {
    q: 'Where are my invoice images stored?',
    a: 'Captured images are uploaded to a private Supabase Storage bucket accessible only with your service credentials. The extracted data and the OCR transcription are saved as a draft invoice you can review and correct before submission.',
  },
  {
    q: 'Is my data shared?',
    a: 'No. Your invoices live in your own Supabase project. The only external calls are to the LHDN API and to the LLM gateway that reads the invoice photo. Nothing is shared with third parties.',
  },
]

export default function FaqScreen() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <GradientBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={[pageContentStyle, { paddingTop: space.xxxl, paddingBottom: 150 }]}>
        <Text style={styles.title}>FAQ</Text>
        <Text style={styles.sub}>Common questions about e-invoicing with auto-invoice.</Text>

        {FAQS.map((qa, i) => {
          const isOpen = open === i
          return (
            <GlassCard key={i} style={styles.item}>
              <Pressable style={styles.qRow} onPress={() => setOpen(isOpen ? null : i)}>
                <Text style={styles.q}>{qa.q}</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.azure} />
              </Pressable>
              {isOpen && (
                <View style={styles.aWrap}>
                  <Text style={styles.a}>{qa.a}</Text>
                </View>
              )}
            </GlassCard>
          )
        })}
      </ScrollView>
    </GradientBackground>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  title: { fontFamily: font.displayBold, fontSize: 30, color: colors.ink, letterSpacing: -0.5 },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginTop: 4, marginBottom: space.xl },
  item: { marginBottom: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  qRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  q: { flex: 1, fontFamily: font.displayBold, fontSize: 15, color: colors.ink, lineHeight: 21 },
  aWrap: { marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.silver + '55' },
  a: { fontFamily: font.body, fontSize: 14, color: colors.slate, lineHeight: 21 },
})