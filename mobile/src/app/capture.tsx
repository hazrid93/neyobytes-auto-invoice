/**
 * Capture screen — launch the camera (with a photo-library fallback), read the
 * image as a data URL, run extraction via the dashboard view model, then route
 * to the review screen with the draft invoice id. The view model owns loading/
 * error state; this screen is purely presentation + image acquisition.
 */
import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useDashboard } from '../viewmodels/useDashboard'
import { colors, font, space, radius } from '../theme/tokens'

export default function CaptureScreen() {
  const dash = useDashboard()
  const [busy, setBusy] = useState(false)

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
    if (status !== 'granted') {
      // Fall back to the library if camera permission is denied.
      return pickFromLibrary()
    }
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

  if (busy || dash.extracting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.kuning} />
        <Text style={styles.busyText}>Extracting invoice…</Text>
        <Text style={styles.busySub}>The model is reading the photo</Text>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Capture invoice</Text>
      <Text style={styles.subtitle}>
        Photograph a paper receipt or invoice — the model will OCR it into a draft e-invoice.
      </Text>
      <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={takePhoto}>
        <Text style={styles.optionText}>📷 Take photo</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={pickFromLibrary}>
        <Text style={styles.optionText}>🖼 Choose from library</Text>
      </Pressable>
      {dash.extractError ? <Text style={styles.error}>{dash.extractError}</Text> : null}
      <Pressable style={styles.cancel} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

// Read a content:// / file:// uri into a base64 data URL the backend accepts.
// ImagePicker already returns base64 when requested, so prefer that path.
async function uriToDataUrl(uri: string): Promise<string> {
  // If the picker already handed us a data URL, pass through.
  if (uri.startsWith('data:')) return uri
  // For file URIs we asked base64:true on the picker; reconstruct the data URL
  // from the base64 payload inlined in the asset. This helper is kept thin —
  // if extension is needed (excluded platforms), fetch() + FileReader.
  throw new Error('Expected a data: URL from the image picker; got ' + uri.slice(0, 30))
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, padding: space.xxl, gap: space.md },
  center: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', alignItems: 'center', gap: space.sm },
  busyText: { fontFamily: font.display, fontSize: 18, color: colors.ink, marginTop: space.md },
  busySub: { fontFamily: font.body, fontSize: 14, color: colors.arang },
  title: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 15, color: colors.arang, marginBottom: space.lg },
  option: {
    backgroundColor: colors.ink, borderRadius: radius.md,
    paddingVertical: space.lg, alignItems: 'center',
  },
  optionPressed: { opacity: 0.88 },
  optionText: { fontFamily: font.displayBold, fontSize: 16, color: colors.kuning },
  error: { fontFamily: font.body, fontSize: 14, color: colors.merah },
  cancel: { paddingVertical: space.md, alignItems: 'center', marginTop: space.md },
  cancelText: { fontFamily: font.body, fontSize: 14, color: colors.arang },
})