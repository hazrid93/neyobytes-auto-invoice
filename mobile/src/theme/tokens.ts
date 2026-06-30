/**
 * Design tokens — Malaysian paper-receipt + MyInvois world.
 * See frontend-design SKILL.md: 4–6 named hexes, no generic cream/terracotta.
 */

/** Near-black, the printed-receipt text. */
export const ink = '#1A1A1F'
/** Warm off-white paper background. */
export const paper = '#FBF8F3'
/** Malaysian gold/yellow — MyInvois/Jalur Gemilang accent. Status + signature. */
export const kuning = '#F5B800'
/** Malaysian flag red — errors/critical. */
export const merah = '#C8102E'
/** Validated/accepted green. */
export const hijau = '#1B7A4B'
/** Warm gray for secondary text. */
export const arang = '#6B6760'

export const colors = { ink, paper, kuning, merah, hijau, arang } as const

// Spacing scale (4px base).
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

// Type scale — Space Grotesk display + Inter body (loaded in app/_layout.tsx).
export const font = {
  display: 'SpaceGrotesk_500Medium',
  displayBold: 'SpaceGrotesk_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const