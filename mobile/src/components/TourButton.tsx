/**
 * TourButton — the `?` button every page mounts to start its product tour.
 *
 * Self-contained: owns the open state and renders the <CoachmarkTour> modal.
 * Pages pass `steps` (each with a ref to a target element + copy). Pressing `?`
 * opens the tour; the tour calls back onClose when dismissed.
 *
 * Usage:
 *   const greetRef = useRef<View>(null)
 *   <View ref={greetRef}>…</View>
 *   <TourButton steps={[{ id:'greet', targetRef:greetRef, title, description }]} />
 */
import { useState } from 'react'
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CoachmarkTour, type TourStep } from './CoachmarkTour'
export type { TourStep }
import { colors } from '../theme/tokens'

interface Props {
  steps: TourStep[]
  style?: StyleProp<ViewStyle>
  /** Force the button to render even with zero steps (renders nothing if omitted). */
  size?: number
  /** Fired when the user finishes (Done) or skips the tour. For first-run
   *  tracking — optional; the button opens/closes itself regardless. */
  onComplete?: () => void
}

export function TourButton({ steps, style, size = 20, onComplete }: Props) {
  const [open, setOpen] = useState(false)
  if (!steps.length) return null
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed, style]}
        accessibilityLabel="Start page tour"
        accessibilityRole="button"
      >
        <Ionicons name="help-outline" size={size} color={colors.azure} />
      </Pressable>
      <CoachmarkTour
        steps={steps}
        open={open}
        onClose={() => setOpen(false)}
        onComplete={onComplete}
      />
    </>
  )
}

const styles = StyleSheet.create({
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.snow + '99',
    borderWidth: 1,
    borderColor: colors.silver + '88',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
})