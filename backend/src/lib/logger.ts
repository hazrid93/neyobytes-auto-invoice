// Lightweight leveled logger. pm2 already prefixes stdout/stderr with a
// timestamp, so we keep lines single-line and tag-prefixed for greppability:
//
//   [llm]     ok model=kimi-k2.7 ms=9421 tok_in=128 tok_out=1180 content_len=1180
//   [extract]  stage=A done ms=9421 ocr_len=1180 preview="Seller: NEYO..."
//   [extract]  stage=B done ms=3204 model=glm-5.2 items=2 subtotal=2500 total=2700
//
// Levels via LOG_LEVEL env (debug|info|warn|error), default `info`.
// stdout  → pm2 out log (info, debug)
// stderr  → pm2 error log (warn, error)

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level
const threshold = ORDER[configured] ?? ORDER.info

function fmtVal(v: unknown): string {
  if (v == null) return '-'
  if (typeof v === 'string') return JSON.stringify(v.slice(0, 160))
  if (v instanceof Error) return JSON.stringify(v.message.slice(0, 160))
  return String(v)
}

function fmt(tag: string, msg: string, meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return `[${tag}] ${msg}`
  const kv = Object.entries(meta).map(([k, v]) => `${k}=${fmtVal(v)}`).join(' ')
  return `[${tag}] ${msg} ${kv}`
}

function emit(level: Level, tag: string, msg: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < threshold) return
  const line = fmt(tag, msg, meta)
  if (level === 'warn' || level === 'error') console.error(line)
  else console.log(line)
}

export const log = {
  debug: (tag: string, msg: string, meta?: Record<string, unknown>) => emit('debug', tag, msg, meta),
  info: (tag: string, msg: string, meta?: Record<string, unknown>) => emit('info', tag, msg, meta),
  warn: (tag: string, msg: string, meta?: Record<string, unknown>) => emit('warn', tag, msg, meta),
  error: (tag: string, msg: string, meta?: Record<string, unknown>) => emit('error', tag, msg, meta),
}