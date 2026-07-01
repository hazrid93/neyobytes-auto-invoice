// Verifies the LLM client end-to-end against the live litellm gateway:
//   1. a plain text completion (proves auth + endpoint + retry wrapper)
//   2. the REAL two-stage OCR pipeline production uses:
//        Stage A (vision): image pixels  → plain-text field transcription
//        Stage B (text):   transcription  → strict JSON (zod-validated)
//      The invoice data lives ONLY in the rendered pixels — the prompt carries
//      NO field data — so the model must read the image. Driving both stages
//      verifies the actual `messagesForTranscription` → `messagesForStructuring`
//      path the invoiceService runs on every upload.
// Run:  npm run llm:verify   (uses .env.local/.env.stg/.env.prod via load-env; APP_ENV picks which)
import '../src/load-env'
import { chat } from '../src/lib/llm'
import { messagesForTranscription, messagesForStructuring } from '../src/lib/extraction'
import { parseExtracted } from '../src/lib/extract-parse'
import { env } from '../src/env'
import { buildInvoiceImage } from './text-png'
import { join } from 'node:path'

let passed = 0
let failed = 0
const ok = (m: string) => (passed++, console.log(`  ✅ ${m}`))
const bad = (m: string, e?: unknown) => (
  failed++,
  console.error(`  ❌ ${m}${e ? ': ' + String((e as Error)?.message ?? e) : ''}`)
)

async function main() {
  console.log('\nLLM gateway:', env.LITELLM_BASE_URL)
  console.log('vision model:', env.LLM_VISION_MODEL, '| text model:', env.LLM_TEXT_MODEL)
  console.log('retries:', env.LLM_MAX_RETRIES, '| timeout(ms):', env.LLM_TIMEOUT_MS)
  console.log()

  console.log('1) Text completion (auth + endpoint + fallback path reachable):')
  try {
    const r = await chat({
      messages: [
        { role: 'system', content: 'You output only uppercase.' },
        { role: 'user', content: 'reply with the single word: ok' },
      ],
      model: env.LLM_TEXT_MODEL,
      maxTokens: 1024, // reasoning models spend tokens thinking before answering
      temperature: 0,
    })
    const up = r.content.trim().toUpperCase()
    if (up.includes('OK')) ok(`text model responded (${r.model}): "${r.content.trim().slice(0, 40)}"`)
    else bad(`unexpected text response: "${r.content}"`)
  } catch (e) {
    bad('text completion', e)
  }

  console.log('\n2) Two-stage OCR extraction (must read fields from image pixels, not prompt):')
  // The invoice data lives ONLY in the rendered pixels. The user message contains
  // no invoice fields — just the transcription instruction — so this is a true test
  // of the vision path. If kimi-k2.7's image handling is broken, Stage A returns
  // garbage/missing fields and the structuring checks fail. This drives the SAME
  // two-stage pipeline production uses (messagesForTranscription →
  // messagesForStructuring), not a single-shot image→JSON path.
  const pngPath = join(process.cwd(), 'scripts', 'verify-invoice.png')
  const pngDataUrl = buildInvoiceImage(pngPath, [
    'ABC SDN BHD',
    'INVOICE',
    'Invoice No: INV-2026-001',
    'Date: 30/06/2026',
    'TIN: C1234567890',
    '',
    'Consulting Service qty 1 RM 1000.00',
    'SST 8% RM 80.00',
    'Total RM 1080.00',
    'Pay to ABC Bank 123456789',
  ])
  ok(`invoice image rendered to PNG pixels (${Math.round(pngDataUrl.length * 0.75)} bytes)`)

  const deadline = AbortSignal.timeout(60_000)

  // Stage A — vision transcription (image → plain-text field lines).
  let ocrText = ''
  try {
    const a = await chat({
      messages: messagesForTranscription(pngDataUrl),
      requireVision: true,
      reasoningEffort: 'low', // transcription is a literal copy task, not reasoning
      temperature: 0,
      maxTokens: 2048,
      signal: deadline,
    })
    ocrText = a.content
    ok(`stage A vision transcription (${a.model}, ${ocrText.length} chars)`)
    console.log(`     ocr preview: ${ocrText.slice(0, 120).replace(/\n/g, ' | ')}`)
  } catch (e) {
    bad('stage A vision transcription', e)
    console.log(`\n────────────────────────────────────────\n  PASS=${passed}  FAIL=${failed}\n────────────────────────────────────────`)
    process.exit(1)
  }

  // Stage B — text structuring (OCR text → strict JSON).
  try {
    const b = await chat({
      messages: messagesForStructuring(ocrText),
      model: env.LLM_TEXT_MODEL,
      fallbackModel: env.LLM_VISION_MODEL, // kimi-k2.7 handles text fine as a fallback
      requireVision: false,
      reasoningEffort: 'high', // currency/date normalization + total reconciliation benefit from CoT
      structured: true, // disables reasoning_content fallback (would break JSON.parse)
      temperature: 0,
      maxTokens: 4096,
      signal: deadline,
    })
    ok(`stage B text structuring (${b.model}, ${b.content.length} chars)`)

    // The route's parse helper — same code path production uses.
    const ext = parseExtracted(b.content)
    ok(`parsed + zod-validated (items=${ext.items.length})`)

    console.log(
      `     invoice_number=${ext.invoice_number ?? '∅'} seller="${ext.seller?.name ?? '∅'}" ` +
        `total=${ext.total ?? '∅'} TIN=${ext.seller?.tin ?? '∅'}`,
    )

    // The real OCR proof: these fields exist ONLY in the image, not the prompt.
    const hasNum = ext.invoice_number && /2026-001/.test(String(ext.invoice_number))
    const hasSeller = /abc/i.test(ext.seller?.name ?? '')
    const hasTin = /C1234567890/.test(String(ext.seller?.tin ?? ''))
    const hasItem = /consulting/i.test(ext.items[0]?.description ?? '')
    const hasTotal = Number(ext.total ?? 0) === 1080 || Number(ext.total ?? 0) === 1080.0

    const ocrFields = [hasNum, hasSeller, hasTin, hasItem, hasTotal].filter(Boolean).length
    if (ocrFields >= 4) {
      ok(`OCR read ${ocrFields}/5 fields from pixels (num,seller,tin,item,total)`)
    } else {
      bad(
        `OCR only read ${ocrFields}/5 fields — vision path may be weak`,
        new Error(JSON.stringify({ hasNum, hasSeller, hasTin, hasItem, hasTotal })),
      )
    }
  } catch (e) {
    bad('stage B structuring', e)
  }

  console.log(`\n────────────────────────────────────────`)
  console.log(`  PASS=${passed}  FAIL=${failed}`)
  console.log(`────────────────────────────────────────`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error('verify crashed:', e)
  process.exit(1)
})