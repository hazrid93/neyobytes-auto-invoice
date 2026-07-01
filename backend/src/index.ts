import './load-env' // load .env.local/.env.stg/.env.prod (selected by APP_ENV) BEFORE env.ts reads process.env
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bodyLimit } from 'hono/body-limit'
import { serve } from '@hono/node-server'
import { env } from './env'
import { health } from './routes/health'
import { auth } from './routes/auth'
import { invoices } from './routes/invoices'
import { myinvois } from './routes/myinvois'
import { publicRoutes } from './routes/public'
import { mapDomainError } from './lib/httpErrors'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.use('*', logger())
// Large base64 invoice photos: a 7MB phone JPEG becomes ~10MB as base64 JSON.
// Default limits would 413 the upload; raise to 25MB to be safe.
app.use('*', bodyLimit({ maxSize: 25 * 1024 * 1024 }))
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  }),
)

app.get('/', (c) =>
  c.json({
    name: 'auto-invoice-backend',
    docs: '/health, /auth/{register,login,refresh,me,logout}, /invoices, /myinvois',
  }),
)
app.route('/health', health)
app.route('/auth', auth)
app.route('/invoices', invoices)
app.route('/public', publicRoutes)
app.route('/myinvois', myinvois)

app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => mapDomainError(c, err))

const port = env.PORT
serve({ fetch: app.fetch, port }, (info) => {
  const appEnv =
    process.env.APP_ENV ?? (process.env.NODE_ENV === 'production' ? 'prod' : 'local')
  console.log(
    `🚀 auto-invoice backend listening on http://localhost:${info.port}  [env=${appEnv} · myinvois=${env.MYINVOIS_ENV}]`,
  )
})
