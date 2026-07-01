/**
 * QR-image decoder — decodes a 2D QR barcode from a captured invoice image
 * to its payload string (the LHDN validation link `{portal}/{uuid}/share/{longId}`).
 *
 * WHY (not the LLM): the QR is a graphic the OCR/vision pipeline cannot reliably
 * read — Stage B transcribes text, it doesn't decode a QR matrix, so prompt
 * guidance yields sporadic null/garbage. A dedicated decoder (jsQR over the
 * image's RGBA pixels) is the only reliable source for `qr_verification`. This
 * is the purchase-side (flow 1 P7) gap the audit flagged as "not implemented".
 *
 * Pure JS (no native modules / no prebuild): jsQR decodes the matrix, pngjs +
 * jpeg-js provide RGBA pixels for PNG/JPEG phoneshots. Accepts a data: URL (the
 * exact shape the mobile capture sends to /invoices/extract) or an https URL.
 * Returns null when no QR is present (most invoices) — never throws on a
 * decode miss; the caller treats null as "no QR detected".
 */
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'

const RGBA_CHANNELS = 4

/** RGBA Uint8ClampedArray + dims — what jsQR consumes. */
interface DecodedImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

function decodePng(buf: Buffer): DecodedImage | null {
  try {
    const png = PNG.sync.read(buf)
    return { data: png.data as unknown as Uint8ClampedArray, width: png.width, height: png.height }
  } catch {
    return null
  }
}

function decodeJpeg(buf: Buffer): DecodedImage | null {
  try {
    const { data, width, height } = jpeg.decode(buf, { useTArray: true })
    if (!data || !width || !height) return null
    // jpeg-js may return RGB (3ch) or RGBA (4ch); jsQR needs RGBA.
    if (data.length === width * height * 3) {
      const rgba = new Uint8ClampedArray(width * height * RGBA_CHANNELS)
      for (let i = 0, j = 0; i < data.length; i += 3, j += RGBA_CHANNELS) {
        rgba[j] = data[i]; rgba[j + 1] = data[i + 1]; rgba[j + 2] = data[i + 2]; rgba[j + 3] = 255
      }
      return { data: rgba, width, height }
    }
    return { data: data as unknown as Uint8ClampedArray, width, height }
  } catch {
    return null
  }
}

/** Decode raw image bytes (PNG or JPEG) to RGBA. Returns null on any miss. */
function decodeImageBytes(buf: Buffer): DecodedImage | null {
  // Magic bytes: PNG = \x89PNG, JPEG/JFIF = \xFF\xD8\xFF.
  if (buf.length >= 3 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) return decodePng(buf)
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return decodeJpeg(buf)
  // Unknown header → try PNG then JPEG as a last resort.
  return decodePng(buf) ?? decodeJpeg(buf)
}

/**
 * Decode a QR code from a data: URL (base64 image). Returns the payload
 * string, or null if no detectable QR is present. Never throws (logs misses).
 */
export function decodeQrFromDataUrl(dataUrl: string): string | null {
  if (!dataUrl) return null
  // Accept both `data:image/png;base64,...` and a bare base64 string.
  const b64 = dataUrl.startsWith('data:')
    ? dataUrl.split(',')[1] ?? null
    : dataUrl
  if (!b64) return null
  const buf = Buffer.from(b64, 'base64')
  const img = decodeImageBytes(buf)
  if (!img) return null
  const result = jsQR(img.data, img.width, img.height)
  return result?.data || null
}

/**
 * Decode a QR from raw image bytes (already buffered). Returns the payload
 * or null. Useful when the caller already has the bytes (e.g. fetched an
 * https URL image before calling here).
 */
export function decodeQrFromBytes(buf: Buffer): string | null {
  const img = decodeImageBytes(buf)
  if (!img) return null
  const result = jsQR(img.data, img.width, img.height)
  return result?.data || null
}