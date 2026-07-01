/**
 * Unit tests for the QR-image decoder (`src/lib/qrDecode.ts`).
 *
 * Proves the purchase-side (flow 1 P7) decoder reliably reads a 2D QR matrix
 * from a captured image — the capability the LLM OCR pipeline deliberately
 * does NOT have (it transcribes text, not graphics). Round-trips a generated
 * QR through PNG + JPEG (the two photo formats a phone capture produces) and
 * asserts the decoded payload equals the LHDN validation-link format the
 * existing POST /public/invoices/qr route resolves.
 *
 * Run: npm run qr:verify
 */
import '../src/load-env'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import QR from 'qrcode'
import jpeg from 'jpeg-js'
import { decodeQrFromDataUrl, decodeQrFromBytes } from '../src/lib/qrDecode'

const LINK = 'https://preprod.myinvois.hasil.gov.my/abc-123-def-456/share/mock-long-id-789'

async function qrPngDataUrl(data: string): Promise<string> {
  return new Promise((resolve, reject) =>
    QR.toDataURL(data, { width: 220, margin: 1 }, (e, url) =>
      e ? reject(e) : resolve(url),
    ),
  )
}

async function qrJpegBytes(data: string): Promise<Buffer> {
  const pngDataUrl = await qrPngDataUrl(data)
  const { PNG } = await import('pngjs')
  const png = PNG.sync.read(Buffer.from(pngDataUrl.split(',')[1], 'base64'))
  return jpeg.encode(png, 90).data
}

test('decodes a PNG data-URL QR to its payload', async () => {
  const url = await qrPngDataUrl(LINK)
  assert.equal(decodeQrFromDataUrl(url), LINK)
})

test('decodes a JPEG QR (phone-photo format) to its payload', async () => {
  const jpg = await qrJpegBytes(LINK)
  assert.equal(decodeQrFromBytes(jpg), LINK)
})

test('decodes the LHDN validation-link format the public /qr route consumes', async () => {
  const link = 'https://myinvois.hasil.gov.my/550e8400-e29b-41d4-a716-446655440000/share/E12345678901'
  const url = await qrPngDataUrl(link)
  assert.equal(decodeQrFromDataUrl(url), link)
  // the format {base}/{uuid}/share/{longId}
  const decoded = decodeQrFromDataUrl(url)!
  assert.ok(decoded.includes('/share/'), 'decoded payload carries the /share/ segment')
  assert.ok(decoded.match(/\/[0-9a-f-]{36}\/share\//), 'contains a UUID segment')
})

test('returns null when there is no QR in the image (most invoices)', async () => {
  // A PNG with no QR — qrcode can't encode nothing, so make a blank PNG.
  const { PNG } = await import('pngjs')
  const png = new PNG({ width: 100, height: 100 })
  png.data.fill(255) // white
  const buf = PNG.sync.write(png)
  assert.equal(decodeQrFromBytes(buf), null, 'no QR → null, not an error')
})

test('returns null for an empty/garbage data URL (never throws)', () => {
  assert.equal(decodeQrFromDataUrl(''), null)
  assert.equal(decodeQrFromDataUrl('data:image/png;base64,!!!notanimage'), null)
  assert.equal(decodeQrFromDataUrl('garbage'), null)
})

test('accepts a bare base64 string (no data: prefix)', async () => {
  const url = await qrPngDataUrl(LINK)
  const bare = url.split(',')[1]!
  assert.equal(decodeQrFromDataUrl(bare), LINK)
})