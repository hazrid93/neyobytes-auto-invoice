/**
 * Glass surfaces + gradient background — the signature of the silver/white/blue
 * theme. These primitives centralize the glassmorphism treatment so screens
 * stay clean.
 *
 * On web, `GlassCard` applies the `glass-blur` className (defined in
 * _layout.tsx's injected <style>) for a real `backdrop-filter: blur()`. On
 * native, the className is ignored and the translucent fill + hairline border
 * + shadow over the gradient still reads as frosted glass.
 */
import { type ReactNode } from 'react'
import { View, StyleSheet, type ViewStyle, type StyleProp, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, gradient, glass, shadow, radius } from './tokens'

/** Full-page silver→blue gradient background. Put once per screen behind content. */
export function GradientBackground({ children }: { children: ReactNode }) {
  return (
    <LinearGradient
      colors={[gradient.top, gradient.mid, gradient.bottom]}
      style={StyleSheet.absoluteFill}
    >
      {children}
    </LinearGradient>
  )
}

interface GlassCardProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Stronger fill (header/input) vs standard card. */
  strong?: boolean
  /** Higher lift + colored shadow (for floating CTAs). */
  float?: boolean
}

/** Frosted glass surface — translucent white, hairline highlight, soft shadow. */
export function GlassCard({ children, style, strong, float }: GlassCardProps) {
  // className only resolves on web (RN Web forwards to `class`); ignored on native.
  // Cast to Record so the spread passes View's typed props (className isn't on
  // RN's View types, though RN Web renders it at runtime).
  const webClass = (Platform.OS === 'web' ? { className: 'glass-blur' } : {}) as Record<string, string>
  return (
    <View
      {...webClass}
      style={[
        styles.base,
        strong && styles.strong,
        float && styles.float,
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: glass.fill,
    borderColor: glass.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  strong: {
    backgroundColor: glass.fillStrong,
  },
  float: {
    ...shadow.float,
  },
})

// On web, inject the real backdrop-filter for frosted blur. On native, returning
// false renders nothing (no <style> primitive — would crash). Exported as a
// component the layout renders once.
export function GlassStyleInjector() {
  if (Platform.OS !== 'web') return null
  return (
    <style>{`
      .glass-blur {
        backdrop-filter: blur(16px) saturate(150%);
        -webkit-backdrop-filter: blur(16px) saturate(150%);
      }
      :focus-visible {
        outline: 2px solid ${colors.azure};
        outline-offset: 2px;
      }
    `}</style>
  )
}