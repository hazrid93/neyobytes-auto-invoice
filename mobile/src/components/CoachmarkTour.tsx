/**
 * CoachmarkTour — a cross-platform product tour (web + native) adapted from the
 * neyobytes-jemput Mantine/DOM version.
 *
 *   • Portal          → React Native `Modal` (transparent). On web react-native-web
 *                       portals it to document.body; on native it lifts above all
 *                       app content — so the tour sits above tabs + headers.
 *   • Spotlight       → a dep-free 4-strip overlay. Four dark rectangles cover
 *                       everything EXCEPT the target rect, "punching" a clean
 *                       hole (no border frame). No react-native-svg dependency
 *                       (avoids a native rebuild for the web deploy).
 *   • Bubble          → frosted glass card with title + description + arrow,
 *                       auto-placed in the side with the most room (port + clamp).
 *   • Stepper         → Back / Next / Done, "Step x / n", dismiss-on-overlay-tap.
 *   • Measurement     → `measureElement` (getBoundingClientRect on web,
 *                       measureInWindow on native). Bubble height comes from
 *                       onLayout so it positions after its real size is known.
 *
 * Fallback: if a step's target can't be measured (ref null / zero size, e.g. a
 * conditionally-rendered element), the spotlight is skipped and the bubble is
 * centered — the tour still narrates that step instead of crashing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { measureElement, scrollElementIntoView, type Rect } from '../lib/measure'
import { colors, font, space, radius, shadow } from '../theme/tokens'

export interface TourStep {
  id: string
  targetRef: React.RefObject<View | null>
  title: string
  description: string
  /** Optional small pill above the title, e.g. "Step" or "Tip". */
  badge?: string
}

interface Props {
  steps: TourStep[]
  open: boolean
  onClose: () => void
  startIndex?: number
  /** Fired once when the user reaches the last step's Done (or via Skip).
   *  Use to mark a first-run tour as seen. */
  onComplete?: () => void
}

type Placement = 'top' | 'bottom' | 'left' | 'right'

const GAP = 14
const ARROW = 7
const VIEWPORT_PAD = 16
const SPOTLIGHT_PAD = 10
const OVERLAY = 'rgba(10, 37, 64, 0.55)'

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}

export function CoachmarkTour({ steps, open, onClose, startIndex = 0, onComplete }: Props) {
  const win = useWindowDimensions()
  const [index, setIndex] = useState(startIndex)
  const [spot, setSpot] = useState<Rect | null>(null)
  const [bubbleH, setBubbleH] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; placement: Placement; arrowLeft?: number; arrowTop?: number } | null>(null)
  const bubbleRef = useRef<View>(null)
  // Guards the scroll-then-remeasure loop so an out-of-view target retries at
  // most twice (web smooth-scroll), then gives up → centered bubble fallback.
  const scrollTriesRef = useRef(0)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const step = steps[index]

  useEffect(() => {
    if (open) setIndex(startIndex)
  }, [open, startIndex])

  // Reset position when the step changes so the bubble re-measures offscreen.
  useEffect(() => {
    setPos(null)
    setSpot(null)
    scrollTriesRef.current = 0
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
  }, [index, open])

  const recompute = useCallback(async () => {
    if (!open || !step) {
      setSpot(null)
      return
    }
    const rect = await measureElement(step.targetRef)
    if (!rect) {
      setSpot(null)
      return
    }
    // If the target is fully outside the viewport, scroll it into view first
    // (web) so the spotlight + bubble can land on it. Retry a couple of times
    // for the smooth-scroll to settle, then fall back to a centered bubble.
    const outOfView =
      rect.y + rect.height < 20 ||
      rect.y > win.height - 20 ||
      rect.x + rect.width < 0 ||
      rect.x > win.width
    if (outOfView) {
      if (scrollTriesRef.current < 2 && scrollElementIntoView(step.targetRef)) {
        scrollTriesRef.current += 1
        setSpot(null)
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
        scrollTimerRef.current = setTimeout(() => {
          void recompute()
        }, 380)
        return
      }
      // can't scroll (native) or still off-screen after retries → centered bubble
      scrollTriesRef.current = 0
      setSpot(null)
      return
    }
    scrollTriesRef.current = 0
    setSpot({
      x: Math.max(rect.x - SPOTLIGHT_PAD, 0),
      y: Math.max(rect.y - SPOTLIGHT_PAD, 0),
      width: rect.width + SPOTLIGHT_PAD * 2,
      height: rect.height + SPOTLIGHT_PAD * 2,
    })
  }, [open, step, win.width, win.height])

  useEffect(() => {
    void recompute()
  }, [recompute])

  // Recompute when the viewport resizes (rotation / desktop resize / web zoom).
  useEffect(() => {
    if (!open) return
    void recompute()
  }, [open, win.width, win.height])

  // Compute bubble placement once we have the target rect + the bubble's height.
  useEffect(() => {
    if (!step) return
    // For the centered fallback (no spot) we don't need the target.
    if (!spot) {
      if (bubbleH > 0) setPos(null) // centered handled in render
      return
    }
    if (bubbleH === 0) return
    const target = {
      x: spot.x + SPOTLIGHT_PAD,
      y: spot.y + SPOTLIGHT_PAD,
      width: spot.width - SPOTLIGHT_PAD * 2,
      height: spot.height - SPOTLIGHT_PAD * 2,
    }
    const bubbleW = Math.min(320, win.width - VIEWPORT_PAD * 2)
    const spaces = {
      bottom: win.height - (target.y + target.height),
      top: target.y,
      right: win.width - (target.x + target.width),
      left: target.x,
    }
    const placement = (['bottom', 'top', 'right', 'left'] as Placement[]).sort(
      (a, b) => spaces[b] - spaces[a],
    )[0]

    let top: number
    let left: number
    let arrowLeft: number | undefined
    let arrowTop: number | undefined

    if (placement === 'bottom' || placement === 'top') {
      left = clamp(
        target.x + target.width / 2 - bubbleW / 2,
        VIEWPORT_PAD,
        win.width - bubbleW - VIEWPORT_PAD,
      )
      top =
        placement === 'bottom'
          ? target.y + target.height + GAP + ARROW
          : target.y - bubbleH - GAP - ARROW
      top = clamp(top, VIEWPORT_PAD, win.height - bubbleH - VIEWPORT_PAD)
      arrowLeft = clamp(target.x + target.width / 2 - left - ARROW, 18, bubbleW - 26)
    } else {
      top = clamp(
        target.y + target.height / 2 - bubbleH / 2,
        VIEWPORT_PAD,
        win.height - bubbleH - VIEWPORT_PAD,
      )
      left =
        placement === 'right'
          ? target.x + target.width + GAP + ARROW
          : target.x - bubbleW - GAP - ARROW
      left = clamp(left, VIEWPORT_PAD, win.width - bubbleW - VIEWPORT_PAD)
      arrowTop = clamp(target.y + target.height / 2 - top - ARROW, 18, bubbleH - 26)
    }

    setPos({ top, left, placement, arrowLeft, arrowTop })
  }, [spot, bubbleH, win.width, win.height, step])

  const atEnd = index >= steps.length - 1
  // Close + signal completion (so a first-run hook can mark the tour seen).
  // Reaching Done OR pressing Skip both count — we never nag again; the
  // `?` button on every screen always replays on demand.
  const finish = useCallback(() => {
    onComplete?.()
    onClose()
  }, [onComplete, onClose])
  const bubbleW = Math.min(320, win.width - VIEWPORT_PAD * 2)
  // Centered fallback when no measurable target.
  const centered = !spot && bubbleH > 0
  const bubbleStyle: ViewStyle = centered
    ? { alignSelf: 'center', marginTop: win.height / 2 - bubbleH / 2, width: bubbleW }
    : {
        position: 'absolute',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: bubbleW,
        opacity: pos ? 1 : 0,
      }

  const arrow =
    pos && !centered
      ? arrowFor(pos, bubbleW, colors.snow)
      : null

  return (
    <Modal
      transparent
      visible={open}
      animationType="fade"
      onRequestClose={finish}
      statusBarTranslucent
    >
      <View style={styles.layer}>
        {/* Spotlight overlay — 4 dark strips around the target + a border frame. */}
        {spot ? (
          <>
            <Strip onPress={finish} style={{ left: 0, top: 0, width: win.width, height: spot.y }} />
            <Strip onPress={finish} style={{ left: 0, top: spot.y, width: spot.x, height: spot.height }} />
            <Strip
              onPress={finish}
              style={{ left: spot.x + spot.width, top: spot.y, width: win.width - (spot.x + spot.width), height: spot.height }}
            />
            <Strip
              onPress={finish}
              style={{ left: 0, top: spot.y + spot.height, width: win.width, height: win.height - (spot.y + spot.height) }}
            />
            <View style={[styles.frame, { left: spot.x, top: spot.y, width: spot.width, height: spot.height }]} />
          </>
        ) : (
          <Strip onPress={finish} style={{ left: 0, top: 0, width: win.width, height: win.height }} />
        )}

        {/* Bubble */}
        <View
          ref={bubbleRef}
          onLayout={(e) => setBubbleH(e.nativeEvent.layout.height)}
          style={[styles.bubble, bubbleStyle]}
          pointerEvents="auto"
        >
          {arrow}
          <View style={styles.bubbleHead}>
            <View style={{ flex: 1 }}>
              {step?.badge ? <Text style={styles.badge}>{step.badge}</Text> : null}
              <Text style={styles.title}>{step?.title ?? ''}</Text>
              <Text style={styles.desc}>{step?.description ?? ''}</Text>
              {/* On the last step, tell the user the tour is replayable so they
                  don't feel rushed and know how to find it again. */}
              {atEnd ? (
                <Text style={styles.replayHint}>
                  Tip: tap the ? on any screen to replay this tour.
                </Text>
              ) : null}
            </View>
            <Pressable onPress={finish} hitSlop={8} style={styles.xBtn}>
              <Ionicons name="close" size={16} color={colors.slate} />
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={finish}
              hitSlop={6}
              style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
            >
              <Text style={styles.skipText}>Skip tour</Text>
            </Pressable>
            <Text style={styles.stepCount}>
              {Math.min(index + 1, steps.length)} / {steps.length}
            </Text>
            <View style={styles.footBtns}>
              <Pressable
                style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
                disabled={index === 0}
                onPress={() => setIndex((i) => Math.max(0, i - 1))}
              >
                <Ionicons name="chevron-back" size={14} color={index === 0 ? colors.silver : colors.azure} />
                <Text style={[styles.backText, index === 0 && styles.backTextDisabled]}>Back</Text>
              </Pressable>
              {atEnd ? (
                <Pressable
                  style={({ pressed }) => [styles.nextBtn, styles.doneBtn, pressed && styles.pressed]}
                  onPress={finish}
                >
                  <Text style={styles.nextText}>Done</Text>
                  <Ionicons name="checkmark" size={15} color={colors.snow} style={{ marginLeft: 4 }} />
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.nextBtn, pressed && styles.pressed]}
                  onPress={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
                >
                  <Text style={styles.nextText}>Next</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.snow} style={{ marginLeft: 4 }} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function arrowFor(
  pos: { placement: Placement; arrowLeft?: number; arrowTop?: number },
  _w: number,
  bg: string,
) {
  const size = ARROW * 2
  const base: ViewStyle = {
    position: 'absolute',
    width: size,
    height: size,
    backgroundColor: bg,
    transform: [{ rotate: '45deg' }],
  }
  switch (pos.placement) {
    case 'top':
      return <View style={{ ...base, bottom: -ARROW, left: pos.arrowLeft }} />
    case 'bottom':
      return <View style={{ ...base, top: -ARROW, left: pos.arrowLeft }} />
    case 'left':
      return <View style={{ ...base, right: -ARROW, top: pos.arrowTop }} />
    case 'right':
    default:
      return <View style={{ ...base, left: -ARROW, top: pos.arrowTop }} />
  }
}

function Strip({ style, onPress }: { style: ViewStyle; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.strip, style]} />
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
  strip: { position: 'absolute', backgroundColor: OVERLAY },
  frame: {
    position: 'absolute',
    borderRadius: radius.sm,
  },
  bubble: {
    backgroundColor: colors.snow,
    borderRadius: radius.lg,
    padding: space.lg,
    ...shadow.cardHigh,
    borderColor: colors.silver + '55',
    borderWidth: 1,
    overflow: 'visible',
  },
  bubbleHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  badge: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    color: colors.azure,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  title: { fontFamily: font.displayBold, fontSize: 17, color: colors.ink, letterSpacing: -0.2 },
  desc: { fontFamily: font.body, fontSize: 13.5, color: colors.slate, lineHeight: 20, marginTop: 4 },
  replayHint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.silver,
    marginTop: 8,
    fontStyle: 'italic',
  },
  xBtn: { padding: 4, marginTop: -2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.silver + '55',
  },
  skipBtn: { paddingVertical: 6, paddingRight: space.md },
  skipText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.slate },
  stepCount: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate, marginHorizontal: 'auto' },
  footBtns: { flexDirection: 'row', gap: space.sm, marginLeft: 'auto' },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md },
  backText: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.azure, marginLeft: 2 },
  backTextDisabled: { color: colors.silver },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.azure,
  },
  doneBtn: { backgroundColor: colors.success },
  nextText: { fontFamily: font.displayBold, fontSize: 14, color: colors.snow },
  pressed: { opacity: 0.85 },
})