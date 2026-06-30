import { env } from '../env'
import { log } from './logger'

// OpenAI-compatible chat-completions client for the litellm gateway.
// Modeled on neyobytes-whatsapp-agent's LLMService: retry with exponential
// backoff + jitter (retryable on 429 / 5xx / network-timeout), primary →
// fallback model, per-attempt fetch timeout via AbortController.
//
// Gateway (probed live 2026-06-30):
//   base:  http://localhost:4000/v1   (litellm.service on this host)
//   models: kimi-k2.7 (vision-capable), glm-5.2 (text-only, reasoning)

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
}

export interface ChatResult {
  content: string
  model: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

function retryable(status: number | undefined, err?: unknown): boolean {
  if (status && RETRYABLE_STATUS.has(status)) return true
  // Network / timeout / abort (no HTTP status) — retry per whatsapp-agent pattern.
  if (!status) {
    const m = String((err as Error)?.message ?? err ?? '').toLowerCase()
    if (/abort|timeout|fetch failed|econnreset|enotfound|socket hang up/.test(m)) return true
  }
  return false
}

async function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((r) => {
    const t = setTimeout(() => r(), ms)
    if (signal) {
      if (signal.aborted) {
        clearTimeout(t)
        r()
      } else {
        signal.addEventListener('abort', () => { clearTimeout(t); r() }, { once: true })
      }
    }
  })
}

/**
 * Call the gateway's /chat/completions once. Returns parsed JSON or throws.
 * `model` overrides the request body's model (used for fallback).
 */
async function callOnce(
  messages: ChatMessage[],
  opts: {
    model: string
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
    extraBody?: Record<string, unknown>
    structured?: boolean
    /**
     * Reasoning/thinking effort for reasoning-capable models ('low' | 'medium' |
     * 'high' | 'none'). Sent as the top-level `reasoning_effort` field — the
     * pattern the neyobytes-whatsapp-agent uses for these same models. Probed
     * on the litellm gateway (2026-06-30): both kimi-k2.7 and glm-5.2 accept it
     * at the top level. `none` is best-effort — some models still emit
     * `reasoning_content` — so for a hard 'minimal reasoning' intent use 'low'.
     */
    reasoningEffort?: 'low' | 'medium' | 'high' | 'none'
  },
): Promise<{ json: any; model: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS)
  // Cooperatively abort if the caller's signal fires.
  const onAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages,
      temperature: opts.temperature ?? 0.2,
    }
    if (opts.maxTokens) body.max_tokens = opts.maxTokens
    if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort
    if (opts.extraBody) Object.assign(body, opts.extraBody)
    // NOTE: we deliberately do NOT send chat_template_kwargs.enable_reasoning=false
    // — litellm's passthrough rejects it with HTTP 500 for some model groups
    // (kimi-k2.7: "unexpected keyword argument 'chat_template_kwargs'"). Reasoning
    // depth is controlled instead via the top-level `reasoning_effort` field
    // (the whatsapp-agent pattern), with a generous max_tokens budget so the
    // model transitions from reasoning_content to content on its own.
    // `structured: true` only affects CONTENT SELECTION on the response side
    // (never return reasoning_content as the answer, to keep JSON.parse safe).

    const res = await fetch(`${env.LITELLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LITELLM_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const err = new Error(`LLM API error (${res.status}): ${text.slice(0, 500)}`) as Error & {
        status?: number
      }
      err.status = res.status
      throw err
    }
    return { json: await res.json(), model: opts.model }
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Select the answer text from a chat-completion response.
 * - Plain-text chat: prefer `content`; fall back to `reasoning_content` when the
 *   model is a reasoning one that starved `content` on a short token budget.
 * - Structured output: NEVER fall back to `reasoning_content` — it is
 *   chain-of-thought, not the JSON the caller will JSON.parse. Returning ''
 *   surfaces a clear "malformed response" error instead of a parse failure.
 */
function pickContent(json: any, structured?: boolean): string {
  const content = json?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) return content
  if (structured) return ''
  const reasoning = json?.choices?.[0]?.message?.reasoning_content
  return typeof reasoning === 'string' ? reasoning : ''
}

/**
 * Chat completion with retry + fallback. Mirrors the whatsapp-agent flow:
 * try primary model with exponential-backoff retries; on terminal failure, try
 * the fallback model once. `requireVision` forces the vision model and skips
 * the text-only fallback (since glm-5.2 can't see images).
 */
export async function chat(opts: {
  messages: ChatMessage[]
  model?: string
  fallbackModel?: string
  temperature?: number
  maxTokens?: number
  requireVision?: boolean
  signal?: AbortSignal
  /** Extra body fields (e.g. chat_template_kwargs for vLLM backends). */
  extraBody?: Record<string, unknown>
  /**
   * Reasoning/thinking effort for reasoning-capable models ('low' | 'medium' |
   * 'high' | 'none'). Probed on the litellm gateway (2026-06-30): both
   * kimi-k2.7 and glm-5.2 accept the top-level `reasoning_effort` field — the
   * pattern the neyobytes-whatsapp-agent uses for these same models.
   */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'none'
  /**
   * Structured-output mode: the caller will JSON.parse the result.
   * RESPONSE-SIDE ONLY: `pickContent` returns '' (a clear, retryable error)
   * instead of falling back to `reasoning_content` (chain-of-thought that
   * would break JSON.parse). It does NOT disable reasoning server-side — the
   * model may still spend tokens on CoT first. Robustness comes from a generous
   * `max_tokens` budget (so reasoning completes and `content` fills) plus retry
   * on empty content. Reasoning depth is controlled by `reasoningEffort`.
   */
  structured?: boolean
}): Promise<ChatResult> {
  const primary = opts.model ?? env.LLM_VISION_MODEL
  // Default fallback: text model, unless the request needs vision (then none).
  const fallback = opts.requireVision
    ? undefined
    : opts.fallbackModel ?? env.LLM_TEXT_MODEL

  const maxRetries = env.LLM_MAX_RETRIES
  const baseDelay = 2_000
  const maxDelay = 30_000
  let lastErr: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (opts.signal?.aborted) throw new Error('chat aborted by caller')
    const t0 = Date.now()
    try {
      const result = await callOnce(opts.messages, {
        model: primary,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
        extraBody: opts.extraBody,
        reasoningEffort: opts.reasoningEffort,
        structured: opts.structured,
      })
      const text = pickContent(result.json, opts.structured)
      if (!text) {
        throw new Error(
          'malformed response: no message.content' +
            (opts.structured ? ' (structured output empty — the model likely exhausted its token budget on reasoning before producing JSON; raise max_tokens)' : ''),
        )
      }
      const u = result.json?.usage ?? {}
      log.info('llm', 'ok', {
        model: result.model,
        ms: Date.now() - t0,
        tok_in: u.prompt_tokens ?? '-',
        tok_out: u.completion_tokens ?? '-',
        content_len: text.length,
      })
      return { content: text, model: result.model, usage: result.json?.usage }
    } catch (e) {
      lastErr = e
      const status = (e as { status?: number })?.status
      log.warn('llm', 'attempt failed', {
        model: primary,
        attempt: attempt + 1,
        of: maxRetries + 1,
        status: status ?? 'network/timeout',
        ms: Date.now() - t0,
      })
      if (attempt >= maxRetries || !retryable(status, e)) {
        // Non-retryable on primary → try fallback model (once) if allowed.
        break
      }
      const is429 = status === 429
      const initial = is429 ? 5_000 : baseDelay
      const exp = initial * Math.pow(2, attempt)
      const jitter = exp * (0.5 + Math.random() * 0.5)
      const delay = Math.min(Math.round(jitter), maxDelay)
      await sleep(delay, opts.signal)
    }
  }

  if (fallback && fallback !== primary) {
    log.warn('llm', 'primary exhausted, trying fallback', { from: primary, to: fallback })
    const t0 = Date.now()
    try {
      const result = await callOnce(opts.messages, {
        model: fallback,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
        extraBody: opts.extraBody,
        reasoningEffort: opts.reasoningEffort,
        structured: opts.structured,
      })
      const text = pickContent(result.json, opts.structured)
      if (text) {
        const u = result.json?.usage ?? {}
        log.info('llm', 'ok (fallback)', {
          model: result.model,
          ms: Date.now() - t0,
          tok_in: u.prompt_tokens ?? '-',
          tok_out: u.completion_tokens ?? '-',
          content_len: text.length,
        })
        return { content: text, model: result.model, usage: result.json?.usage }
      }
      throw new Error('malformed response: no message.content')
    } catch (e) {
      lastErr = e
      log.error('llm', 'fallback failed', { model: fallback, err: String((e as Error)?.message ?? e).slice(0, 200) })
    }
  }

  log.error('llm', 'request failed', { model: primary, err: String((lastErr as Error)?.message ?? lastErr).slice(0, 200) })
  throw new Error(
    `LLM request failed: ${String((lastErr as Error)?.message ?? lastErr)}`,
  )
}
