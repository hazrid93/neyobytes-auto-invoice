/**
 * Design tokens — silver/white/blue glassmorphism for auto-invoice.
 *
 * The signature is frosted glass over a silver→blue gradient: glass cards are
 * translucent white with a hairline highlight border + soft shadow, and (on
 * web) a real backdrop-filter blur. Navy ink grounds the text; electric blue
 * is the single primary action color; silver is the hairline/divider system.
 *
 * See frontend-design SKILL.md: 6–8 named hexes, type scale, one signature.
 */

// ── Palette (named) ─────────────────────────────────────────────────────────
/** Deep navy — primary text + the blue anchor of the gradient. */
export const ink = '#0A2540'
/** Electric blue — primary actions, focus rings, links. */
export const azure = '#2563EB'
/** Light sky blue — soft highlights, active-tab accents. */
export const sky = '#7DD3FC'
/** Silver — hairlines, borders, dividers. */
export const silver = '#CBD5E1'
/** White — glass fill base. */
export const snow = '#FFFFFF'
/** Silver-blue mist — page background base (gradient sits over this). */
export const mist = '#EEF2F9'
/** Slate — secondary text. */
export const slate = '#64748B'

// Semantic (kept cool to fit the silver/blue scheme — no warm gold here).
export const success = '#0EA47A'
export const danger = '#DC2A4A'
export const amber = '#D97706'

export const colors = {
  ink, azure, sky, silver, snow, mist, slate,
  success, danger, amber,
} as const

// ── Gradient stops (silver → light blue → white, top→bottom) ────────────────
export const gradient = {
  top: '#DCE7F5',
  mid: '#EBF1FA',
  bottom: '#F6F9FD',
} as const

// ── Glass surfaces (translucent fills — read as frosted over the gradient) ─
export const glass = {
  /** Standard glass card fill (65% white). */
  fill: 'rgba(255, 255, 255, 0.65)',
  /** Stronger glass for headers/inputs (80% white). */
  fillStrong: 'rgba(255, 255, 255, 0.8)',
  /** Top/left hairline highlight (white at 70%). */
  border: 'rgba(255, 255, 255, 0.7)',
  /** Subtle inner divider on glass (silver at 50%). */
  divider: 'rgba(203, 213, 225, 0.5)',
} as const

// ── Shadows (soft, diffuse — lifts glass off the gradient) ──────────────────
export const shadow = {
  card: {
    shadowColor: ink,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  } as const,
  cardHigh: {
    shadowColor: ink,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  } as const,
  float: {
    shadowColor: azure,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  } as const,
} as const

// ── Spacing (4px base, same scale as before) ────────────────────────────────
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

// ── Type scale — Space Grotesk display + Inter body (unchanged pairing) ─────
export const font = {
  display: 'SpaceGrotesk_500Medium',
  displayBold: 'SpaceGrotesk_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
} as const

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
} as const