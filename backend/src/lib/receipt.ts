/**
 * Invoice receipt renderer — produces a self-contained HTML document for an
 * e-invoice (the flow-1 / flow-3 "PDF or hard copy" OUTPUT). Print-to-PDF from
 * any browser satisfies the PDF requirement; the HTML is also the "hard copy"
 * view. The QR is rendered server-side to a PNG data URL via `qrcode` so the
 * receipt is fully self-contained (works offline / when printed).
 */
import QR from 'qrcode'

export interface ReceiptData {
  invoiceNumber: string | null
  issueDate: string | null
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  documentId: string | null
  validationUuid: string | null
  qrUrl: string | null
  supplierName: string | null
  supplierTin: string | null
  supplierBrn: string | null
  buyerName: string | null
  buyerTin: string | null
  items: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; amount: number }>
}

const esc = (s: string | null | undefined): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const money = (n: number, currency: string): string => {
  const sym: Record<string, string> = { MYR: 'RM', USD: 'US$', SGD: 'S$', EUR: '€', GBP: '£' }
  return `${sym[currency] ?? currency} ${(Math.round(n * 100) / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function renderReceiptHtml(d: ReceiptData): Promise<string> {
  // QR encodes the validation link (qrUrl). Render server-side → data URL.
  let qrDataUrl = ''
  if (d.qrUrl) {
    try {
      qrDataUrl = await QR.toDataURL(d.qrUrl, { width: 160, margin: 1, errorCorrectionLevel: 'M' })
    } catch {
      qrDataUrl = '' // non-fatal; receipt still renders without the QR image
    }
  }

  const rows = d.items
    .map(
      (it) => `<tr>
        <td>${esc(it.description)}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">${money(it.unitPrice, d.currency)}</td>
        <td class="num">${money(it.amount, d.currency)}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.invoiceNumber) || 'e-Invoice'} — receipt</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1a1a2e;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.45}
  h1{font-size:14px;margin:0;letter-spacing:.12em;color:#6c5ce7}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1a2e;padding-bottom:12px;margin-bottom:16px}
  .sup h2{margin:0 0 4px;font-size:18px}.sup .tin{font-size:12px;color:#555}
  .meta{font-size:12px;text-align:right;color:#444}.meta b{color:#1a1a2e}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
  th{text-align:left;border-bottom:1px solid #ccc;padding:8px 6px;color:#666;font-size:11px;text-transform:uppercase}
  th.num,td.num{text-align:right}
  td{padding:8px 6px;border-bottom:1px solid #eee}
  .totals{margin-left:auto;width:260px;font-size:13px}.totals div{display:flex;justify-content:space-between;padding:4px 0}
  .totals .grand{border-top:2px solid #1a1a2e;margin-top:6px;padding-top:8px;font-weight:700;font-size:15px}
  .footer{margin-top:20px;padding-top:14px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  .ids{font-size:11px;color:#555;line-height:1.7}.ids b{color:#1a1a2e}
  .qr{text-align:center}.qr img{width:130px;height:130px}.qr .cap{font-size:10px;color:#666;margin-top:4px}
  @media print{body{margin:8mm} .noprint{display:none}}
</style></head><body>
  <div class="head">
    <div class="sup">
      <h1>e-INVOICE</h1>
      <h2>${esc(d.supplierName) || '—'}</h2>
      <div class="tin">TIN: ${esc(d.supplierTin) || '—'}${d.supplierBrn ? ` · SSM: ${esc(d.supplierBrn)}` : ''}</div>
    </div>
    <div class="meta">
      <div><b>${esc(d.invoiceNumber) || '—'}</b></div>
      <div>${esc(d.issueDate) || '—'}</div>
      <div>To: ${esc(d.buyerName) || '—'}${d.buyerTin ? ` (${esc(d.buyerTin)})` : ''}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">No line items</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(d.subtotal, d.currency)}</span></div>
    <div><span>Tax</span><span>${money(d.taxTotal, d.currency)}</span></div>
    <div class="grand"><span>Total Payable</span><span>${money(d.total, d.currency)}</span></div>
  </div>
  <div class="footer">
    <div class="ids">
      ${d.documentId ? `<div><b>MyInvois Document ID</b><br>${esc(d.documentId)}</div>` : ''}
      ${d.validationUuid ? `<div><b>Validation UUID</b><br>${esc(d.validationUuid)}</div>` : ''}
    </div>
    <div class="qr">
      ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" /><div class="cap">Scan to Verify</div>` : '<div class="cap">No QR (not yet submitted)</div>'}
    </div>
  </div>
  <div class="noprint" style="margin-top:24px;text-align:center"><button onclick="window.print()" style="padding:10px 20px;background:#6c5ce7;color:#fff;border:0;border-radius:8px;font-size:14px;cursor:pointer">Print / Save as PDF</button></div>
</body></html>`
}