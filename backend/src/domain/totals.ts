/**
 * Pure money/totals computation — no I/O, no Hono, no Drizzle.
 *
 * ROUND-EACH-LINE-THEN-SUM — the single convention for this codebase. Each
 * line's net + tax is rounded to 2dp FIRST (round2(qty×price), then round2 of
 * that × taxRate/100), and EVERY aggregate is the SUM of those rounded line
 * values (subtotal = Σ rnet, taxTotal = Σ rtax, total = round2(subtotal+tax)).
 *
 * This is the same math the UBL builder (lib/ublJson.ts) uses, so the totals
 * the user sees on the dashboard / review screen EQUAL exactly the totals
 * MyInvois accepts — no cent-level drift from Σ round2(xᵢ) ≠ round2(Σ xᵢ).
 * (The dashboard previously used round-the-sum on raw nets, which diverged
 * from the UBL's round-each-line totals by 1¢ on fractional-cent prices.)
 *
 * `net` is tax-exclusive (UBL LineExtensionAmount); the per-line `amount`
 * (DB invoice_items.amount) is net+tax on the ROUNDED net, not the raw net.
 */

export interface LineItemInput {
  quantity: number
  unitPrice: number
  taxRate: number // percentage, e.g. 6 for 6% SST
}

const r2 = (n: number) => (Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0)

export interface RoundEachStepTotals {
  /** Per-line amount = round2(round2(qty×price) + round2(net×taxRate/100)) — matches DB invoice_items.amount. */
  lineAmounts: number[]
  /** Per-line rounded net (tax-exclusive) — UBL InvoiceLine.LineExtensionAmount. */
  lineNets: number[]
  /** Per-line rounded tax — UBL InvoiceLine per-line TaxSubtotal.TaxAmount. */
  lineTaxes: number[]
  subtotal: number // Σ lineNets (== UBL LineExtensionAmount / TaxExclusiveAmount)
  taxTotal: number // Σ lineTaxes (== UBL TaxTotal.TaxAmount)
  total: number // round2(subtotal + taxTotal) (== UBL TaxInclusiveAmount / PayableAmount)
}

/**
 * Round-each-line-then-sum totals. Used by BOTH the DB-stored invoice path
 * (createDraftInvoice → what the dashboard shows) AND the UBL submission
 * path, so the two can never disagree. Pure + deterministic.
 */
export function computeInvoiceTotals<T extends LineItemInput>(items: T[]): RoundEachStepTotals {
  const lineNets = items.map((it) => r2(it.quantity * it.unitPrice))
  const lineTaxes = lineNets.map((net, i) => r2(net * (items[i].taxRate / 100)))
  const lineAmounts = lineNets.map((net, i) => r2(net + lineTaxes[i]))
  const subtotal = lineNets.reduce((s, n) => s + n, 0)
  const taxTotal = lineTaxes.reduce((s, t) => s + t, 0)
  const total = r2(subtotal + taxTotal)
  return { lineAmounts, lineNets, lineTaxes, subtotal, taxTotal, total }
}

/** Format a money value as a fixed 2-decimal string (UBL serialization). */
export const money2 = (n: number) => n.toFixed(2)