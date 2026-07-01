import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Default 4001 — 4000 is occupied by the litellm LLM gateway on this host
  // (shared by whatsapp-bot / jemput-api). Set PORT in .env.* to override.
  PORT: z.coerce.number().int().positive().default(4001),
  CORS_ORIGIN: z.string().default('*'),

  // Supabase project: auto-invoice. Backend uses the service-role key for
  // everything (Auth admin + data + storage); the publishable/anon key isn't
  // needed because the frontend never talks to Supabase directly.
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1), // service-role key — bypasses RLS
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(), // only for reset-email later

  // Backend-issued JWT (HS256). The frontend authenticates with the backend
  // and carries this token; the backend validates it with the shared secret.
  // jemput-style: we do NOT use Supabase's access tokens or JWKS.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // Public app URL — used for email redirects (password reset). Optional.
  APP_URL: z.string().url().optional(),

  // Direct Postgres via Supavisor pooler (transaction mode 6543 recommended).
  // Optional: server still boots and Auth works if unset; DB routes return 503.
  DATABASE_URL: z.string().url().optional(),

  // ── LLM gateway (litellm) — OpenAI-compatible /v1/chat/completions ──
  // The gateway runs locally on this host (litellm.service, port 4000).
  // llm1.neyobytes.com has no DNS record yet; point at localhost until you add it.
  LITELLM_BASE_URL: z.string().url().default('http://localhost:4000/v1'),
  LITELLM_API_KEY: z.string().min(1), // LITELLM_MASTER_KEY from the gateway's env
  // Stage A backend: an instruction-tuned VISION LLM ('vision', default) or a
  // dedicated OCR model ('ocr'). The value selects the Stage A PROMPT — the
  // anti-narration rules in VISION_TRANSCRIBE_PROMPT are load-bearing for a
  // reasoning-capable vision LLM (kimi-k2.7) but dead weight for a dedicated OCR
  // model (which can't chain-of-thought), and 'one line per visual row' would
  // fight a dedicated OCR model's natural HTML-table output. The model NAME
  // still comes from LLM_VISION_MODEL (repoint it to the OCR model when you
  // swap); this flag is purely about prompt behavior. See lib/extraction.ts.
  LLM_OCR_BACKEND: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['vision', 'ocr']).default('vision'),
  ),
  // Vision-capable model used for invoice OCR/extraction (probed: accepts image_url).
  LLM_VISION_MODEL: z.string().default('kimi-k2.7'),
  // Text-only model used as extraction fallback (probed: NOT multimodal).
  LLM_TEXT_MODEL: z.string().default('glm-5.2'),
  // Reasoning/thinking effort per stage (sent as top-level `reasoning_effort`
  // to the litellm gateway). Two separate knobs because the stages want
  // opposite settings and you may need to tune either at runtime:
  //   vision (Stage A — pure OCR transcription): default 'low'. A literal copy
  //     task; deeper CoT only wastes tokens and risks narration leaking into
  //     `content` (see lib/extraction.ts stripReasoningPreamble).
  //   text   (Stage B — structuring OCR text to JSON): default 'high'. Date
  //     math, currency normalization, total reconciliation benefit from CoT.
  // Accepted values: low | medium | high | none. Empty string → default.
  LLM_VISION_REASONING_EFFORT: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['low', 'medium', 'high', 'none']).default('low'),
  ),
  LLM_TEXT_REASONING_EFFORT: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['low', 'medium', 'high', 'none']).default('high'),
  ),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),

  // Log level for the leveled logger (src/lib/logger.ts).
  // debug|info|warn|error — default 'info'. Lower to 'debug' to see per-LLM-call
  // timings + token usage; raise to 'warn' for quieter prod logs.
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── LHDN MyInvois e-Invoicing ──
  // mock:    no network — submit/validate return deterministic canned responses.
  //          Use this for local dev & tests. Client id/secret NOT required.
  // sandbox: preprod-api.myinvois.hasil.gov.my. Per-user creds required (each
  //          taxpayer registers their own ERP on the MyInvois portal).
  // prod:    api.myinvois.hasil.gov.my. Same per-user model + a prod cert.
  //
  // Credential model (MYINVOIS_CRED_MODE):
  //   taxpayer     — PER-USER (Login as Taxpayer System, 07). Each taxpayer
  //                 generates their own ERP client_id/client_secret on the portal
  //                 and pastes it in the app; we fetch a token with THOSE creds
  //                 (no onbehalfof). Stored encrypted per profile. Default.
  //   intermediary — PLATFORM (Login as Intermediary System, 08). OUR company has
  //                 ONE ERP key (env MYINVOIS_CLIENT_ID/SECRET). Each taxpayer
  //                 appoints us as intermediary in their portal (by our TIN),
  //                 and we fetch a per-taxpayer token with header
  //                 onbehalfof: <taxpayer TIN> (the SDK's intermediary login).
  //                 Requires MYINVOIS_INTERMEDIARY_TIN (our company TIN, shown
  //                 to users in the appointment instructions).
  // Submit is additionally gated by the POS Digicert/LHDNM signing cert
  // (MYINVOIS_CERT_PEM/KEY_PEM) in sandbox/prod.
  MYINVOIS_ENV: z.enum(['mock', 'sandbox', 'prod']).default('mock'),
  MYINVOIS_CRED_MODE: z.enum(['taxpayer', 'intermediary']).default('taxpayer'),
  MYINVOIS_CLIENT_ID: z.string().optional(), // optional global fallback (single-tenant)
  MYINVOIS_CLIENT_SECRET: z.string().optional(),
  // Our company's TIN (+ optional ROB) shown to users in the intermediary
  // appointment instructions. Required when MYINVOIS_CRED_MODE=intermediary.
  MYINVOIS_INTERMEDIARY_TIN: z.string().optional(),
  MYINVOIS_INTERMEDIARY_ROB: z.string().optional(),
  // The taxpayer profile portal (where users log in, generate ERP, and appoint
  // intermediaries). Defaulted to the prod portal; override for sandbox.
  // Used by the frontend's "open portal" link + the native WebView auto-appoint.
  MYINVOIS_PORTAL_URL: z
    .string()
    .url()
    .default('https://profile.myinvois.hasil.gov.my/TaxpayerProfile'),
  // Base URL for the portal's INTERNAL /iapi/ API (the auto-appoint PUT). The
  // /iapi endpoints are NOT part of the public /api/v1.0 e-invoicing API; they
  // require the taxpayer's live session token. Defaulted to prod; override
  // for sandbox. Only used by the native WebView auto-appoint (Option B).
  MYINVOIS_IAPI_BASE: z.string().url().default('https://api.myinvois.hasil.gov.my'),
  // PEM-encoded signing cert + private key (for sandbox/prod submit). Leave empty
  // in mock mode. See docs/myinvois/RESEARCH.md §6 — the signing cert must come
  // from POS Digicert (posdigicert.com.my) under LHDNM's Sub CA.
  MYINVOIS_CERT_PEM: z.string().optional(),
  MYINVOIS_KEY_PEM: z.string().optional(),
  // The LHDN signing target — which value SignatureValue signs. UNVERIFIED until
  // a real round-trip (see docs/myinvois/RESEARCH.md §6 + TESTING-FLOWS.md §4b):
  //   docdigest  → Sign(SHA256(transformed document))  [prose-literal]
  //   signedinfo → Sign(c14n(SignedInfo))              [standard XAdES]
  // If unset/empty, the submit service throws SigningTargetUnverifiedError rather
  // than ship a guessed signature. Set it ONLY after a round-trip confirms.
  // The preprocess coerces the empty string (dotenv emits `KEY=  # comment` →
  // "") to undefined so the `.optional()` enum accepts it — otherwise zod
  // rejects "" as an invalid enum value and the whole app fails to boot.
  MYINVOIS_SIGN_TARGET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['docdigest', 'signedinfo']).optional(),
  ),
  // Key used to AES-256-GCM-encrypt each user's stored LHDN client_secret at
  // rest (lib/crypto.ts). MUST be stable across restarts or stored secrets
  // become undecryptable. Required for sandbox/prod (where per-user creds live
  // in the DB); unused in mock mode.
  PROFILE_SECRET_KEY: z.string().optional(),
})

const parsed = schema.safeParse(process.env)

// When targeting a real LHDN environment, the per-user encryption key is
// required (we store each taxpayer's secret encrypted). The global client
// creds are NOT required — they're an optional single-tenant fallback in
// taxpayer mode, and the platform creds in intermediary mode.
if (parsed.success && parsed.data.MYINVOIS_ENV !== 'mock') {
  if (!parsed.data.PROFILE_SECRET_KEY || parsed.data.PROFILE_SECRET_KEY.length < 32) {
    console.error(`❌ MYINVOIS_ENV=${parsed.data.MYINVOIS_ENV} requires PROFILE_SECRET_KEY (>=32 chars) to encrypt per-user LHDN secrets at rest.`)
    console.error('   Generate one, e.g.:  openssl rand -base64 48')
    console.error('   Set MYINVOIS_ENV=mock for local development without LHDN credentials.')
    process.exit(1)
  }
  // Intermediary mode needs the platform ERP key + our company TIN.
  if (parsed.data.MYINVOIS_CRED_MODE === 'intermediary') {
    const missing: string[] = []
    if (!parsed.data.MYINVOIS_CLIENT_ID) missing.push('MYINVOIS_CLIENT_ID')
    if (!parsed.data.MYINVOIS_CLIENT_SECRET) missing.push('MYINVOIS_CLIENT_SECRET')
    if (!parsed.data.MYINVOIS_INTERMEDIARY_TIN) missing.push('MYINVOIS_INTERMEDIARY_TIN')
    if (missing.length) {
      console.error(`❌ MYINVOIS_CRED_MODE=intermediary requires ${missing.join(', ')}.`)
      console.error('   Set MYINVOIS_CRED_MODE=taxpayer for the per-user paste flow.')
      process.exit(1)
    }
  }
}

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:')
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
export const isProd = env.NODE_ENV === 'production'
