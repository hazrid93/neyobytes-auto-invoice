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
  // Vision-capable model used for invoice OCR/extraction (probed: accepts image_url).
  LLM_VISION_MODEL: z.string().default('kimi-k2.7'),
  // Text-only model used as extraction fallback (probed: NOT multimodal).
  LLM_TEXT_MODEL: z.string().default('glm-5.2'),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),

  // Log level for the leveled logger (src/lib/logger.ts).
  // debug|info|warn|error — default 'info'. Lower to 'debug' to see per-LLM-call
  // timings + token usage; raise to 'warn' for quieter prod logs.
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── LHDN MyInvois e-Invoicing ──
  // mock:    no network — submit/validate return deterministic canned responses.
  //          Use this for local dev & tests. Client id/secret NOT required.
  // sandbox: preprod-api.myinvois.hasil.gov.my (needs client creds + a trial cert).
  // prod:    api.myinvois.hasil.gov.my (needs client creds + prod cert).
  // Submit is blocked by the POS Digicert/LHDNM signing cert in both sandbox/prod;
  // mock mode lets the whole flow be exercised without it.
  MYINVOIS_ENV: z.enum(['mock', 'sandbox', 'prod']).default('mock'),
  MYINVOIS_CLIENT_ID: z.string().optional(),
  MYINVOIS_CLIENT_SECRET: z.string().optional(),
  // PEM-encoded signing cert + private key (for sandbox/prod submit). Leave empty
  // in mock mode. See docs/myinvois/RESEARCH.md §6 — the signing cert must come
  // from POS Digicert (posdigicert.com.my) under LHDNM's Sub CA.
  MYINVOIS_CERT_PEM: z.string().optional(),
  MYINVOIS_KEY_PEM: z.string().optional(),
})

const parsed = schema.safeParse(process.env)

// When targeting a real LHDN environment, client creds are required.
if (parsed.success && parsed.data.MYINVOIS_ENV !== 'mock') {
  const missing: string[] = []
  if (!parsed.data.MYINVOIS_CLIENT_ID) missing.push('MYINVOIS_CLIENT_ID')
  if (!parsed.data.MYINVOIS_CLIENT_SECRET) missing.push('MYINVOIS_CLIENT_SECRET')
  if (missing.length) {
    console.error(`❌ MYINVOIS_ENV=${parsed.data.MYINVOIS_ENV} requires ${missing.join(', ')}.`)
    console.error('   Set MYINVOIS_ENV=mock for local development without LHDN credentials.')
    process.exit(1)
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
