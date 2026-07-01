/**
 * QRCode — renders a QR code from any string (the MyInvois validation link for
 * a submitted invoice). Pure-JS via the `qrcode` package → PNG data URL → RN
 * Image, so it works on native AND web with no native module / prebuild.
 *
 * The validation link format (LHDN FAQ + Get Document): {envbaseurl}/{uuid}/share/{longId}.
 * The caller passes the full link; scanning it opens the MyInvois validation page
 * ("Scan to Verify" on the rendered invoice — flow 1 OUTPUT + flow 3).
 */
import { useEffect, useState } from 'react'
import { Image, View, Text, StyleSheet } from 'react-native'
import QR from 'qrcode'
import { colors } from '../theme/tokens'

export function QRCode({
  value,
  size = 180,
  label,
}: {
  value: string
  size?: number
  label?: string
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QR.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url)
          setErr(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(String((e as Error)?.message ?? e))
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (err) {
    return (
      <View style={styles.box}>
        <Text style={styles.err}>QR error: {err}</Text>
      </View>
    )
  }
  if (!dataUrl) {
    return <View style={[styles.box, { width: size, height: size }]} />
  }
  return (
    <View style={styles.wrap}>
      <Image
        source={{ uri: dataUrl }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel={label ?? 'QR code'}
      />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  box: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  label: { marginTop: 8, fontSize: 12, color: colors.slate },
  err: { color: colors.danger, fontSize: 12, textAlign: 'center', padding: 12 },
})