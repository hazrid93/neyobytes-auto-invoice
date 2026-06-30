// Verifies the LLM client end-to-end against the live litellm gateway:
//   1. a plain text completion (proves auth + endpoint + retry wrapper)
//   2. a TRUE OCR extraction: invoice text rendered into PNG pixels only,
//      the prompt carries NO field data — the model must read the image.
// Run:  npm run llm:verify   (uses .env.local / .env.prod via load-env)
import '../src/load-env'
import { chat } from '../src/lib/llm'
import { ExtractedInvoiceSchema, EXTRACTION_SYSTEM_PROMPT } from '../src/lib/extraction'
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

  console.log('\n2) OCR extraction (must read fields from image pixels, not prompt):')
  // The invoice data lives ONLY in the rendered pixels. The user message contains
  // no invoice fields — just the extraction instruction — so this is a true test
  // of the vision path. If kimi-k2.7's image handling is broken, extraction
  // returns garbage/missing fields and the schema/key-field checks fail.
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

  try {
    const r = await chat({
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          // Deliberately NO invoice text here — the model must read the image.
          content: [
            { type: 'text', text: 'Extract this invoice into the JSON schema.' },
            { type: 'image_url', image_url: { url: pngDataUrl } },
          ],
        },
      ],
      model: env.LLM_VISION_MODEL,
      requireVision: true,
      structured: true, // disables reasoning (chain-of-thought would break JSON.parse)
      temperature: 0,
      maxTokens: 4096,
    })
    ok(`vision model responded (${r.model}, ${r.content.length} chars)`)

    // The route's parse helper — same code path production uses.
    const { parseExtracted } = await import('../src/lib/extract-parse')
    const ext = parseExtracted(r.content)
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
    bad('OCR extraction', e)
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
