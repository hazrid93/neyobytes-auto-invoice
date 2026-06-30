/**
 * SwipeToDelete — drag the wrapped card horizontally; release past 30% of its
 * width to delete (the card flings off-screen then calls onDelete). Releasing
 * short snaps back. Replaces an overlapping delete icon with a gesture.
 *
 * Cross-platform: PanResponder maps to touch on native and to pointer/mouse
 * events on web (react-native-web), so desktop users can click-drag the card.
 * useNativeDriver:false keeps the JS animation identical on both targets
 * (native driver isn't fully supported on web for this transform).
 *
 * Tap passes through to the wrapped Pressable (onMove only claims the gesture
 * after dx > 8 and is more horizontal than vertical, so vertical list scroll
 * and taps keep working).
 */
import React, { useRef, useState } from 'react'
import { View, Animated, PanResponder, StyleSheet, Text, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, font, space, radius } from '../theme/tokens'

interface Props {
  onDelete: () => void
  children: React.ReactNode
  style?: ViewStyle
}

const DELETE_THRESHOLD = 0.3 // drag past 30% of width → delete on release

export function SwipeToDelete({ onDelete, children, style }: Props) {
  const translateX = useRef(new Animated.Value(0)).current
  const widthRef = useRef(0)
  const [dead, setDead] = useState(false)

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => translateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        const w = widthRef.current || 320
        if (Math.abs(g.dx) > w * DELETE_THRESHOLD) {
          // Fling off-screen in the drag direction, then delete.
          Animated.timing(translateX, {
            toValue: g.dx > 0 ? w + 80 : -(w + 80),
            duration: 180,
            useNativeDriver: false,
          }).start(() => {
            setDead(true)
            onDelete()
          })
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: false,
            tension: 80,
            friction: 10,
          }).start()
        }
      },
    }),
  ).current

  if (dead) return null

  return (
    <View
      style={[styles.wrap, style]}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width
      }}
      {...pan.panHandlers}
    >
      {/* Red delete background revealed behind the card as it's dragged away. */}
      <View style={styles.bg} pointerEvents="none">
        <Ionicons name="trash-outline" size={22} color={colors.snow} />
        <Text style={styles.bgText}>Delete</Text>
      </View>
      <Animated.View style={[styles.foreground, { transform: [{ translateX }] }]}>
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bgText: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.snow,
    letterSpacing: 0.3,
  },
  foreground: {
    backgroundColor: 'transparent',
  },
})