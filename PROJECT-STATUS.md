# neyobytes-auto-invoice — Project Status

> Snapshot: 2026-07-01 · tracked on `main` (working tree clean; see `git log` for the latest commit)
> Backend live on staging (PM2 `auto-invoice-api-stg`, :4002, healthy) · web export deployed

---

## What this project is

A full-stack auto-invoice system: an **Expo React Native** mobile app + a
**Node.js / Hono** backend that captures invoice photos, extracts data via a
two-stage LLM vision pipeline, and submits to the **Malaysia LHDN MyInvois
e-Invoicing API** (UBL JSON, QR verification). Two flows: **sales** (you issue →
submit to LHDN → customer retrieves) and **purchase** (you receive a supplier
invoice → photograph → AI extracts → store).

---

## Overall status: pipeline complete, cert-gated items pending

The capture → extract → review → submit → accept/reject → audit → customer-
retrieval pipeline is **real and end-to-end on sandbox**, minus two deliberately
excluded items per scope: **(1) digital signing** of the payload and **(2) the
live production API send**. Both are blocked on the same gate: a real
**POS Digicert / LHDNM signing cert** (business KYC).

Every flow step in `docs/flow/IMPLEMENTATION-AUDIT.md` is ✅ **except**:
- **A1 — B2C public-TIN mode** — needs a **product decision** (Tier 4).
- **P6 — Financial Account / ERP integration** — **out of scope** (Tier 4).
- The **AllowanceCharge / PrepaidPayment / Rounding** block — **cert-gated**
  AND formula-ambiguous (no sample disambiguates it); the audit says **do not
  build until the cert round-trip confirms the balance equation**.

---

## Done (verified)

### Backend
- Hono server, Supabase (auth + Postgres + storage), Drizzle ORM, migrations 0001–0004
- Env separation: `.env.local` / `.env.stg` / `.env.prod` (secrets never committed)
- Two-stage LLM pipeline: Stage A vision OCR (`kimi-k2.7`) + Stage B text
  structuring (`glm-5.2`) via LiteLLM proxy (:4000)
- **Real QR-image decoder** (`lib/qrDecode.ts`, pure-JS jsQR+pngns+jpeg-js, no
  native modules) → primary source for `qr_verification`; Stage B text rule is
  the fallback when no scannable graphic is in frame
- UBL JSON builder (`lib/ublJson.ts`) — configurable e-invoice type (01-04,
  11-14), PaymentMeans, PayeeFinancialAccount, PartyIdentification/BRN
- **MyInvois client** (`lib/myinvois.ts`): token, submit, get-submission,
  document-details, TIN validation; sandbox host verified
- **Signing** (`lib/signing.ts`) + **UBL JSON** (`lib/ublJson.ts`) — implemented
  & unit-tested but NOT round-trip-validated (needs the cert)
- Domain layer: repositories / services / domain errors / pure totals
- Public retrieval: `GET /public/invoices/:ref` + `POST /public/invoices/qr` +
  receipt HTML (`GET /.../receipt`, auth + public)
- Mock submission pipeline (`MYINVOIS_ENV=mock`) for cert-free local dev

### Mobile (Expo)
- All screens: login, dashboard/home, capture, review, submit, receipt,
  profile, connect-myinvois, appoint-intermediary, tabs (home/settings/faq/contact)
- Glass-morphism premium theme, tab bar with notch, bottom nav icon-above-text,
  capture button integrated into the nav bar
- Coachmark tour (adapted from neyobytes-jemput), swipe-to-delete, confirm
  dialogs, ErrorBoundary
- Validated forms, `CodePicker`, validation library, non-editable auto-calced
  subtotals via `calc.ts`
- MyInvois intermediary: auto-appoint WebView, connect-myinvois screen
- Web export deployed; production nginx + PM2

### Test suite (all green)
| Script | Tests | What it guards |
|---|---|---|
| `signing:verify` | 14/14 | UBL XML digital-signature structure |
| `ubl:verify` | 17/17 | UBL JSON structure + BR-CO-18 + same-code/different-rate |
| `items:verify` | 17/17 | `buildSubmitItems` blob→UBL mapping (no-DB) |
| `qr:verify` | 6/6 | QR-image decode (jsQR) |
| `totals:verify` | 5/5 | DB totals math |
| `lockstep:verify` | 5/5 | **calc.ts (mobile) == ublJson == totals (DB)** incl 1000-line stress |
| `mock-submit:verify` | 9/9 | submit pipeline (manual + real extract path) |
| `public:verify` | 9/9 | public retrieval e2e |
| `llm:verify` | 6/6 | LLM extraction |
| `db:verify` | — | DB connectivity |

Backend + mobile `tsc --noEmit` clean.

---

## Key invariant now enforced & tested: display == submission

All three totals paths — mobile `calc.ts` (review screen), backend
`domain/totals.ts` (DB/dashboard), `lib/ublJson.ts` (submitted UBL) — use the
same round-each-line-then-sum + **EN 16931 BR-CO-18** document-tax formula and
agree exactly. `verify-lockstep.ts` proves it across the divergence case
(3×RM0.08@6%), same-code/different-rate, fractional-cent multi-line,
multi-tax-type, and a 1000-line stress. A future regression in any one path
that the path's own tests would miss gets caught here.

---

## Open / blocked (do NOT re-implement — already shipped or genuinely blocked)

### 1. BR-CO-18 document-tax vs Σ-line-tax — **UNVERIFIED against live LHDN**
The document-level `TaxSubtotal.TaxAmount` uses `round2(aggregated Σ net ×
rate/100)` (BR-CO-18), NOT `Σ per-line round2(net×rate/100)`. These diverge
when a per-line tax rounds to 0 but the aggregate doesn't (3×RM0.08@6% →
per-line 0.00 each, doc 0.01). The test suite ASSERTS this is correct
(EN-16931-compliant), but it has **never been validated against the live LHDN
validator** — only EN 16931 logic. If LHDN enforces
`TaxTotal.TaxAmount == Σ InvoiceLine tax`, the fix is one line.
**→ Highest-value next step not blocked by a product decision:** submit a
fractional-cent invoice to the real sandbox to confirm acceptance. This also
de-risks the AllowanceCharge work for whenever the cert arrives.

### 2. Invoice-level AllowanceCharge / PrepaidPayment / Rounding — **cert-gated**
Not shipped live. Cert-gated (needs the signing cert for a real round-trip) AND
formula-ambiguous (the KB and EN 16931 give divergent balance equations; no
real-valued sample disambiguates). The audit says: gate behind a flag, always
*derive* TaxExclusive/Payable in the builder, defer per-line AllowanceCharge
until invoice-level is validated. Do **before** this: resolve #1 above.

### 3. Signing round-trip — **needs the cert**
`lib/signing.ts` is implemented & unit-tested (14/14) but the live XAdES-BES
round-trip needs the real POS Digicert cert (business KYC).

### 4. A1 — B2C public-TIN mode — **product decision**
No code distinguishes a consumer (EI/IG general TIN) from a company. May be a
UI/UX distinction only. Needs a product decision (Tier 4).

### 5. P6 — Financial Account / ERP integration — **out of scope**
Flow 2 draws an arrow to "Financial Account"; no accounting/ERP integration
exists (Tier 4).

---

## Reference docs
- `docs/flow/IMPLEMENTATION-AUDIT.md` — per-flow-step status tables (authoritative)
- `docs/myinvois/KNOWLEDGE-BASE.md` — MyInvois/LHDN API reference
- `docs/myinvois/RESEARCH.md` — API research, §6 signing
- `docs/myinvois/SDK-ANALYSIS.md` — SDK analysis
- `docs/myinvois/TESTING-FLOWS.md` — §4 signing + prod send