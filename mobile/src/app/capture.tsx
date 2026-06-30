/**
 * Capture screen — launch the camera (with a photo-library fallback), read the
 * image as a data URL, run extraction via the dashboard view model, then route
 * to the review screen with the draft invoice id.
 */
import { useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { useDashboard } from '../viewmodels/useDashboard'
import { GradientBackground, GlassCard } from '../theme/glass'
import { PageContainer } from '../theme/page'
import { TourButton, type TourStep } from '../components/TourButton'
import { useAuthGate } from '../components/RequireAuth'
import { colors, font, space } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'

export default function CaptureScreen() {
  const { top } = useSafeInsets()
  const dash = useDashboard()
  const gate = useAuthGate()
  const [busy, setBusy] = useState(false)

  const headerRef = useRef<View>(null)
  const cameraRef = useRef<View>(null)
  const libraryRef = useRef<View>(null)
  const tourSteps: TourStep[] = [
    {
      id: 'intro', targetRef: headerRef, badge: 'Capture',
      title: 'Turn a photo into a draft',
      description: 'Photograph a paper receipt or invoice. The model OCRs it into a draft e-invoice you can review.',
    },
    {
      id: 'camera', targetRef: cameraRef,
      title: 'Take a photo',
      description: 'Open the camera and snap the invoice in good light — fill the frame with the document.',
    },
    {
      id: 'library', targetRef: libraryRef,
      title: 'Or pick an image',
      description: 'Already have a photo? Choose it from your library instead.',
    },
  ]

  const handleImage = async (uri: string) => {
    setBusy(true)
    try {
      const dataUrl = await uriToDataUrl(uri)
      const result = await dash.captureAndExtract(dataUrl)
      if (result) {
        router.replace({ pathname: '/review', params: { id: result.invoiceId } })
      }
    } finally {
      setBusy(false)
    }
  }

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return pickFromLibrary()
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    })
    if (!result.canceled && result.assets[0]?.uri) await handleImage(result.assets[0].uri)
  }

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    })
    if (!result.canceled && result.assets[0]?.uri) await handleImage(result.assets[0].uri)
  }

  // Auth gate (also enforced on the home FAB's target, for direct nav).
  if (gate) return gate

  if (busy || dash.extracting) {
    return (
      <GradientBackground>
        <View style={styles.center}>
          <GlassCard strong style={styles.busyCard}>
            <ActivityIndicator size="large" color={colors.azure} />
            <Text style={styles.busyText}>Extracting invoice…</Text>
            <Text style={styles.busySub}>The model is reading the photo</Text>
          </GlassCard>
        </View>
      </GradientBackground>
    )
  }

  return (
    <GradientBackground>
      <View style={[styles.wrap, { paddingTop: space.xxxl + top }]}>
        <PageContainer gap={space.md}>
          <View style={styles.header} ref={headerRef}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={26} color={colors.azure} />
            </Pressable>
            <Text style={styles.title}>Capture invoice</Text>
            <TourButton steps={tourSteps} />
          </View>
          <Text style={styles.subtitle}>
            Photograph a paper receipt or invoice — the model will OCR it into a draft e-invoice.
          </Text>

          <GlassCard style={styles.optionCard}>
            <Pressable ref={cameraRef} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={24} color={colors.azure} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionText}>Take photo</Text>
                <Text style={styles.optionSub}>Open the camera</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.silver} />
            </Pressable>
          </GlassCard>

          <GlassCard style={styles.optionCard}>
            <Pressable ref={libraryRef} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={pickFromLibrary}>
              <Ionicons name="images-outline" size={24} color={colors.azure} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionText}>Choose from library</Text>
                <Text style={styles.optionSub}>Pick an existing image</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.silver} />
            </Pressable>
          </GlassCard>

          {dash.extractError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={15} color={colors.danger} />
              <Text style={styles.error}>{dash.extractError}</Text>
            </View>
          ) : null}
          <Pressable style={styles.cancel} onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </PageContainer>
      </View>
    </GradientBackground>
  )
}

async function uriToDataUrl(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri
  throw new Error('Expected a data: URL from the image picker; got ' + uri.slice(0, 30))
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginBottom: space.md, lineHeight: 20 },
  optionCard: { padding: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  optionPressed: { opacity: 0.7 },
  optionText: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  optionSub: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl },
  busyCard: { padding: space.xxl, alignItems: 'center', gap: space.sm },
  busyText: { fontFamily: font.display, fontSize: 18, color: colors.ink, marginTop: space.md },
  busySub: { fontFamily: font.body, fontSize: 13, color: colors.slate },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger },
  cancel: { paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  cancelText: { fontFamily: font.body, fontSize: 14, color: colors.slate },
})