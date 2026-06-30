# Neyobytes Auto Invoice

Turn a photo of an invoice into a confirmed, LHDN-ready digital record.
Targeting micro & SME users in Malaysia.

```
docs/        → requirements (flow diagrams)
backend/     → Hono API (Node.js) — the only thing that talks to Supabase
frontend/    → Expo (React Native + Web) — talks only to the backend
```

## Architecture

- **Frontend** (Expo, runs on iOS/Android/Web). Never touches Supabase directly.
  Authenticates with the backend and carries a backend-issued JWT.
- **Backend** (Hono on **Node.js**, via `@hono/node-server`). Holds the Supabase
  **service-role** key and is the sole Supabase integration point.
  - **Auth (jemput-style):** Supabase Auth admin API (createUser /
    signInWithPassword / reset password) verifies credentials, but the backend
    issues its **own HS256 JWT** (`jsonwebtoken` + `JWT_SECRET`) and the frontend
    carries *that*. Supabase's access tokens are never returned to the client.
  - **Data:** Drizzle ORM over a **direct Postgres connection** to the Supabase
    pooler (Supavisor). Atomic invoice + items writes use `db.transaction()`.
  - **Storage:** `supabase.storage` for raw invoice images.
- **Supabase**: Auth + Postgres + Storage. RLS is enabled with **no policies** —
  the anon key can do nothing, the service-role key bypasses RLS. Zero maintenance.

### Connection: Supavisor pooler (not direct host)

The direct DB host `db.{ref}.supabase.co` is **IPv6-only** (no IPv6 egress here).
Use the **connection pooler** instead (Dashboard → Project Settings → Database →
Connect), region `ap-southeast-1` (Singapore):

```
postgresql://postgres.iivmrhluihdsmgxyhljo:<password>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

- **6543 = transaction mode** (recommended for web backends; multiplexes,
  `db.transaction()` still pins one connection).
- **5432 = session mode** (only if you need prepared statements / LISTEN / advisory locks).

`prepare: false` is set in `db/client.ts` and must stay off on **both** ports —
it's required because we run a client-side pool (`max: 10`) and Drizzle's adapter
doesn't guarantee prepared-statement/connection affinity; enabling it triggers
"prepared statement already exists / does not exist".

### Drizzle schema vs. DB

- **Migration source of truth:** hand-written SQL in `backend/db/migrations/`.
  Run `0001_init.sql` **once** via psql over the pooler (idempotent; DDL,
  triggers, and the `profiles.id → auth.users(id)` FK all work).
- **Drizzle is query-builder only.** `src/db/schema.ts` mirrors the tables for
  typed queries but intentionally omits the cross-schema `auth.users` FK.
- **Do NOT use `drizzle-kit push`** — it would introspect the live DB and propose
  `DROP CONSTRAINT profiles_id_fkey`, silently severing the profiles↔auth cascade.
  There are no `db:push` / `db:generate` / `db:studio` scripts for this reason.

## Quick start

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env.local     # fill in secrets (or use the existing .env.local for dev)
npm run dev                   # http://localhost:4001  (mock LHDN)
# Staging — real LHDN sandbox (preprod) API, no mock:
#   npm run dev:stg            # http://localhost:4002  (MYINVOIS_ENV=sandbox)
```

Verify the DB connection + schema match against the live pooler:
```bash
npm run db:verify     # real SELECT against each table + a transaction round-trip
```

### 2. Database (one-time)
The migration was applied via the pooler. To re-apply (idempotent):
```bash
psql "postgresql://postgres.iivmrhluihdsmgxyhljo:<password>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  -f backend/db/migrations/0001_init.sql
```
This creates `profiles`, `customers`, `invoices`, `invoice_items` + triggers and
enables RLS (no policies).

### 3. Frontend
```bash
cd frontend
npm install
npx expo start --web    # http://localhost:8081
```

## Environment files

`APP_ENV` selects which file loads (`src/load-env.ts`); with it unset,
`NODE_ENV=production` → `.env.prod`, else `.env.local`.

| File | Committed | Purpose |
|---|---|---|
| `.env.example` | ✅ | template — copy to `.env.local` / `.env.stg` / `.env.prod` |
| `.env.local` | ❌ gitignored | dev — `APP_ENV=local` (default); `MYINVOIS_ENV=mock` |
| `.env.stg` | ❌ gitignored | staging — `APP_ENV=stg`; LHDN **sandbox** (preprod) API on `:4002` |
| `.env.prod` | ❌ gitignored | production — `APP_ENV=prod`; real LHDN API on `:4001` |

Run staging locally: `npm run dev:stg`. Both backends run side-by-side under
pm2 (`auto-invoice-api` → 4001, `auto-invoice-api-stg` → 4002); see
`ecosystem.config.cjs`.

Generate a JWT secret: `openssl rand -hex 32`
Generate the per-user-secret encryption key (required for sandbox/prod):
`openssl rand -base64 48`

## Security note

All secrets (Supabase service key, DB password, JWT secret, LITELLM key) live
only in gitignored `.env.*` files. Never commit real credentials — `.env.example`
holds placeholders. Generate a fresh JWT secret with `openssl rand -hex 32`.

## Status

- [x] Backend: health, auth (register/login/me/logout/reset/update via jemput-style JWT), invoice list + draft create, **OCR extract route**
- [x] DB schema + live pooler migration (`npm run db:verify`)
- [x] LLM gateway integration — litellm (`localhost:4000`), kimi-k2.7 (vision OCR) + glm-5.2 (text fallback), retry+backoff, route-scoped 60s deadline (`npm run llm:verify`)
- [x] OCR pipeline end-to-end: image → storage → vision extraction → JSON parse/validate → draft persisted
- [ ] Frontend: scaffold + auth screens + dashboard (web preview)
- [ ] Invoice review/confirm screen from extracted pre-filled form
- [ ] PDF generation
- [ ] LHDN MyInvois submission (Document ID, Validation UUID, QR)
