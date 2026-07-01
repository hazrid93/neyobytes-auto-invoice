/**
 * Invoice total calculation — mirrors the backend UBL builder's math
 * (backend/src/lib/ublJson.ts) so the review screen shows exactly what will be
 * submitted to LHDN. Totals are DERIVED from line items; the user does not
 * type them.
 *
 * LHDN v1.1 monetary model (see docs/myinvois/sdk-ref/types-pages/invoice-v1-1.txt):
 *   LineExtensionAmount (net)   = quantity × unitPrice              [per line, excl. tax]
 *   TaxAmount (per line)        = net × taxRate%                     [percentage tax types]
 *   LegalMonetaryTotal:
 *     LineExtensionAmount       = Σ line net                         [Total Net Amount]
 *     TaxExclusiveAmount        = Σ line net                         [Total Excluding Tax]
 *     TaxInclusiveAmount        = subtotal + taxTotal                [Total Including Tax]
 *     PayableAmount             = TaxInclusiveAmount                 [+ rounding − prepaid, not yet modelled]
 *   TaxTotal.TaxSubtotal[]      = grouped by tax type code (01..06, E)
 *
 * Fixed-rate taxes (03 Tourism Tax = RM10/room/night) use PerUnitAmount × units
 * instead of a percentage; the current line model carries a single `tax_rate`
 * which we treat as a percentage (matching the backend builder). This keeps
 * mobile + backend in lockstep; per-unit tourism tax is a documented next tier.
 */

/** Round to 2 decimals (cents) — same formula as backend round2(). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export interface CalcLineInput {
  quantity: number
  unit_price: number
  tax_rate: number
  tax_type_code?: string | null
}

export interface LineCalc {
  /** net = quantity × unitPrice (excl. tax) → LineExtensionAmount. */
  net: number
  /** tax = net × taxRate% → line TaxAmount. */
  tax: number
  /** total = net + tax. */
  total: number
}

export interface TaxBreakRow {
  /** Tax type code (01..06, E); defaults to '06' (Not Applicable). */
  code: string
  /** Sum of net amounts taxed at this type. */
  taxable: number
  /** Tax rate % used (from the first line of this type). */
  rate: number
  /** Tax amount for this type. */
  tax: number
}

export interface InvoiceTotals {
  /** Per-line net/tax/total, parallel to the input items. */
  lines: LineCalc[]
  /** Σ line net → LineExtensionAmount / TaxExclusiveAmount. */
  subtotal: number
  /** Σ line tax → TaxTotal.TaxAmount. */
  taxTotal: number
  /** subtotal + taxTotal → TaxInclusiveAmount / PayableAmount. */
  total: number
  /** Tax breakdown per tax type → TaxTotal.TaxSubtotal[]. */
  breakdown: TaxBreakRow[]
}

/** Compute every total from a list of line items. Pure + deterministic. */
export function computeTotals(items: CalcLineInput[]): InvoiceTotals {
  const lines: LineCalc[] = items.map((it) => {
    const net = round2(num(it.quantity) * num(it.unit_price))
    const tax = round2(net * (num(it.tax_rate) / 100))
    return { net, tax, total: round2(net + tax) }
  })

  const subtotal = round2(lines.reduce((s, l) => s + l.net, 0))

  // Document-level tax per EN 16931 BR-CO-18 (matches backend ublJson.ts +
  // domain/totals.ts): each per-type TaxSubtotal.TaxAmount = round2(aggregated
  // Σ net × rate/100), NOT Σ per-line tax. Those diverge when a per-line tax
  // rounds to 0 but the aggregate doesn't (3×RM0.08@6% → per-line 0.00 each
  // but round2(0.24×0.06)=0.01). Keyed by `${code}:${rate}` so same-code /
  // different-rate lines produce separate subtotals. taxTotal = Σ group tax.
  const byType = new Map<string, TaxBreakRow>()
  for (let i = 0; i < items.length; i++) {
    const code = items[i].tax_type_code?.trim() || '06'
    const rate = num(items[i].tax_rate)
    const key = `${code}:${rate}`
    const row = byType.get(key) ?? { code, taxable: 0, rate, tax: 0 }
    row.taxable = round2(row.taxable + lines[i].net)
    row.tax = round2(row.taxable * (rate / 100))
    byType.set(key, row)
  }
  // Stable order: tax types in the order they first appear.
  const breakdown = [...byType.values()]
  const taxTotal = round2(breakdown.reduce((s, r) => s + r.tax, 0))
  const total = round2(subtotal + taxTotal)

  return { lines, subtotal, taxTotal, total, breakdown }
}

/** Format a money amount with its currency prefix, e.g. "MYR 1,234.50". */
export function money(n: number, currency = 'MYR'): string {
  if (!Number.isFinite(n)) n = 0
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const parts = abs.toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${currency} ${parts.join('.')}`
}

/** Coerce a string/number to a finite number (strips commas/spaces). */
export function num(s: string | number | null | undefined): number {
  const n = Number(String(s ?? '').replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : 0
}