/**
 * ConfirmDialog — cross-platform confirmation modal.
 *
 * `Alert.alert()` is native-only and a no-op on react-native-web, so confirm
 * flows (delete, discard-unsaved-changes) silently fail on the web target.
 * This is a small Modal-based dialog that renders identically on web + native.
 *
 * Usage:
 *   const [confirm, setConfirm] = useState<null | { ... }>(null)
 *   <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />
 *   setConfirm({ title, message, confirmText, onConfirm })
 */
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, font, space, radius, shadow } from '../theme/tokens'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  hideCancel?: boolean
  busy?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  hideCancel = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmOptions & { open: boolean; onClose: () => void }) {
  return (
    <Modal
      transparent
      visible={open}
      animationType="fade"
      onRequestClose={busy ? undefined : onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={[styles.iconBadge, destructive && styles.iconBadgeDanger]}>
              <Ionicons
                name={destructive ? 'trash-outline' : 'alert-circle-outline'}
                size={22}
                color={destructive ? colors.danger : colors.azure}
              />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            {!hideCancel && (
              <Pressable
                style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.pressed]}
                onPress={onClose}
                disabled={busy}
              >
                <Text style={styles.cancelText}>{cancelText}</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                destructive ? styles.btnDanger : styles.btnPrimary,
                pressed && styles.pressed,
              ]}
              onPress={onConfirm}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.snow} size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmText}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 37, 64, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: colors.snow,
    borderRadius: radius.lg,
    padding: space.xl,
    width: '100%',
    maxWidth: 400,
    ...shadow.cardHigh,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  iconBadge: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.azure + '15', alignItems: 'center', justifyContent: 'center',
  },
  iconBadgeDanger: { backgroundColor: colors.danger + '15' },
  title: { flex: 1, fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  message: { fontFamily: font.body, fontSize: 15, color: colors.slate, lineHeight: 21, marginBottom: space.lg },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xs },
  btn: { flex: 1, paddingVertical: space.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnCancel: { backgroundColor: colors.mist },
  btnPrimary: { backgroundColor: colors.azure },
  btnDanger: { backgroundColor: colors.danger },
  cancelText: { fontFamily: font.bodyMedium, fontSize: 15, color: colors.slate },
  confirmText: { fontFamily: font.displayBold, fontSize: 15, color: colors.snow },
  pressed: { opacity: 0.85 },
})