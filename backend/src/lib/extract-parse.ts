import type { ExtractedInvoice } from './extraction'
import { ExtractedInvoiceSchema } from './extraction'
import { log } from './logger'

// Vision models often wrap JSON in ```json ... ``` fences despite the prompt
// asking for raw JSON. Strip fences + trailing prose before JSON.parse.
export function stripCodeFences(s: string): string {
  let out = s.trim()
  // Remove a leading ```json or ``` and a trailing ```.
  out = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  // If there's still prose after the object, cut at the last balanced '}'.
  const firstBrace = out.indexOf('{')
  if (firstBrace > 0) out = out.slice(firstBrace)
  const lastBrace = out.lastIndexOf('}')
  if (lastBrace >= 0 && lastBrace < out.length - 1) out = out.slice(0, lastBrace + 1)
  return out.trim()
}

export function parseExtracted(content: string): ExtractedInvoice {
  const cleaned = stripCodeFences(content)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    log.error('extract', 'JSON.parse failed', {
      content_len: content.length,
      err: String((e as Error).message).slice(0, 160),
      head: content.slice(0, 160),
    })
    throw new Error(
      `extraction returned non-JSON: ${String((e as Error).message).slice(0, 160)}`,
    )
  }
  const result = ExtractedInvoiceSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    log.error('extract', 'schema validation failed', {
      issues,
      head: cleaned.slice(0, 160),
    })
    throw new Error(`extraction schema validation failed: ${issues}`)
  }
  return result.data
}
