/**
 * Pure money/totals computation — no I/O, no Hono, no Drizzle.
 *
 * IMPORTANT: there are TWO intentionally divergent rounding conventions in
 * this codebase, and both are correct for their context. Do NOT collapse them:
 *
 *   1. round-each-step (for DB storage): each aggregate is `.toFixed(2)`
 *      before the next is computed. This matches what money columns store and
 *      avoids downstream drift from a stored 162.0049. Used by the
 *      invoice-creation path (computeInvoiceTotals).
 *
 *   2. render-at-end (for UBL XML): sums at full JS precision, `.toFixed(2)`
 *      only at XML serialization. buildUbl keeps this guarantee for line
 *      elements (line NetExtensionAmount/TaxAmount are recomputed from raw
 *      items and rounded only at XML serialization — NEVER fed from the stored
 *      gross `amount`, which would put a tax-inclusive number in a net slot),
 *      while sourcing the *monetary aggregates* (TaxTotal, LegalMonetaryTotal)
 *      from the caller's stored round-each-step totals when provided. Used by the
 *      MyInvois submission path (buildUbl).
 *
 * A single shared helper therefore returns BOTH conventions + the per-line
 * net/tax/gross trio (named, never collapsed — `net` is tax-exclusive for
 * UBL `LineExtensionAmount`, `gross` is tax-inclusive for DB `amount`) and
 * lets each call site pick.
 */

export interface LineItemInput {
  quantity: number
  unitPrice: number
  taxRate: number // percentage, e.g. 6 for 6% SST
}

export interface LineComputation extends LineItemInput {
  net: number // quantity * unitPrice (full precision)
  tax: number // net * taxRate/100 (full precision)
  gross: number // net + tax (full precision)
}

/** Per-line net/tax/gross at full precision. Never rounded. */
export function computeLines<T extends LineItemInput>(items: T[]): LineComputation[] {
  return items.map((it) => {
    const net = it.quantity * it.unitPrice
    const tax = net * (it.taxRate / 100)
    return { ...it, net, tax, gross: net + tax }
  })
}

const r2 = (n: number) => Number(n.toFixed(2))

export interface RoundEachStepTotals {
  /** Per-line amount = round2(net + tax) — matches DB invoice_items.amount. */
  lineAmounts: number[]
  subtotal: number // round2(sum of net)
  taxTotal: number // round2(sum of tax)
  total: number // round2(subtotal + taxTotal)
}

/**
 * Round-each-step totals (convention 1). Use for DB-stored invoice totals so
 * the stored cents agree with what the dashboard and the per-line amounts show.
 */
export function computeInvoiceTotals<T extends LineItemInput>(items: T[]): RoundEachStepTotals {
  const lines = computeLines(items)
  const lineAmounts = lines.map((l) => r2(l.gross))
  const subtotal = r2(lines.reduce((s, l) => s + l.net, 0))
  const taxTotal = r2(lines.reduce((s, l) => s + l.tax, 0))
  const total = r2(subtotal + taxTotal)
  return { lineAmounts, subtotal, taxTotal, total }
}

export interface FullPrecisionTotals {
  lineExt: number // full precision
  taxTotal: number // full precision
  grandTotal: number // full precision
}

/**
 * Full-precision totals (convention 2). UBL renders these with `.toFixed(2)`
 * only at serialization time.
 *
 * NOTE: this helper returns RAW full-precision values only. The precedence
 * `stored ?? computed` (caller's stored round-each-step totals overriding the
 * computed ones for the monetary aggregates) is applied separately in
 * `buildUbl` itself — do NOT wire buildUbl through this helper in a way that
 * drops that override, or the UBL's TaxTotal/LegalMonetaryTotal would regress
 * to full-precision aggregates and stop matching the stored DB totals.
 */
export function computeFullPrecisionTotals<T extends LineItemInput>(
  items: T[],
): FullPrecisionTotals {
  const lines = computeLines(items)
  const lineExt = lines.reduce((s, l) => s + l.net, 0)
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0)
  return { lineExt, taxTotal, grandTotal: lineExt + taxTotal }
}

/** Format a money value as a fixed 2-decimal string (UBL serialization). */
export const money2 = (n: number) => n.toFixed(2)