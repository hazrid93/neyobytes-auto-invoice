# Testing the LHDN credential flows (Flow 1 — Intermediary, Flow 2 — Taxpayer)

This is the actionable guide for exercising **both** LHDN submission models the app
supports, end-to-end, against the **sandbox** (preprod) environment. The two flows are
switchable at runtime via one env var — no code changes.

> **Read this first.** The app has **two** independent things you must do before a *real*
> (non-mock) sandbox submit succeeds:
> 1. **Pick a credential flow** (Flow 1 or Flow 2) and configure it (this guide).
> 2. **Procure a signing cert** and **resolve the signing target** — the e-invoice XML/JSON
>    must be digitally signed before LHDN accepts it. This is gated on a cert you buy from
>    POS Digicert **and** a one-time round-trip to confirm what gets signed. See
>    [§4 — Signing: procurement & round-trip runbook](#4--signing-procurement--round-trip-runbook)
>    at the end. Everything in §1–§3 (token + validate-tin) works **without** the cert;
>    only **submit** is cert-gated.

---

## 0. Prerequisites (both flows)

1. The staging backend runs the **sandbox** target:
   - Host: `preprod-api.myinvois.hasil.gov.my`
   - Portal: `https://preprod-mytax.hasil.gov.my` (taxpayer login + appointment)
   - The box runs it under pm2 as `auto-invoice-api-stg` on port `4002`; nginx serves it at
     `https://autoinvoice.neyobytes.com`.
2. `.env.stg` must have `MYINVOIS_ENV=sandbox` and a `PROFILE_SECRET_KEY` (≥32 chars). It
   already does.
3. The encryption key must be **stable** across restarts — never rotate it while users have
   stored secrets, or those become undecryptable.

Switch the **active flow** by setting `MYINVOIS_CRED_MODE` in `.env.stg`:

```bash
MYINVOIS_CRED_MODE=intermediary   # Flow 1
# or
MYINVOIS_CRED_MODE=taxpayer       # Flow 2 (default)
```

Then restart:
```bash
pm2 restart auto-invoice-api-stg --update-env
```

Confirm the active mode from the API:
```bash
# register/login first to get $TOKEN, then:
curl -s https://autoinvoice.neyobytes.com/myinvois/status \
  -H "Authorization: Bearer $TOKEN"
# → { "mode":"sandbox", "credMode":"intermediary"|"taxpayer", "intermediaryTin":..., ... }
```

---

## 1. Flow 1 — Intermediary (Login as Intermediary System, 08)

**You hold ONE ERP key (your company's). Each taxpayer appoints you by your TIN; you submit
on their behalf with header `onbehalfof: <taxpayer TIN>`.** No per-user client_secret.

### 1a. One-time: register your company + generate its ERP key

1. Register your business on the sandbox portal → it gets a **TIN** + **BRN**.
   - Sandbox portal: `https://preprod-mytax.hasil.gov.my`
2. In that portal, **Generate ERP** → copy your company's `client_id` + `client_secret`
   (the secret is shown **once**).
3. Put them in `.env.stg`:
   ```bash
   MYINVOIS_CRED_MODE=intermediary
   MYINVOIS_CLIENT_ID=<your company client_id>
   MYINVOIS_CLIENT_SECRET=<your company client_secret>
   MYINVOIS_INTERMEDIARY_TIN=<your company TIN, e.g. C24050894070>
   MYINVOIS_INTERMEDIARY_ROB=<your company BRN, or leave blank>
   ```
4. `pm2 restart auto-invoice-api-stg --update-env`.
   - `env.ts` validates that intermediary mode has `CLIENT_ID` + `SECRET` + `INTERMEDIARY_TIN`,
     so a misconfig fails loudly at boot.

### 1b. Per taxpayer: they appoint you as intermediary

Each taxpayer (a real user of your app) does this **once**:

1. **They set their own TIN** in the app (Profile → TIN). This is the value used as
   `onbehalfof`, so it's mandatory.
2. They open **Settings → Intermediary → Appoint intermediary**:
   - **Manual (always works):** the screen shows your company TIN (+ROB) with a copy button,
     step-by-step portal instructions, and an "Open MyInvois portal" button. They log into
     their own portal → Intermediaries → Add Intermediary → paste your TIN → grant
     **View Document** + **Submit Document**.
   - **Auto-appoint (beta, mobile app only):** they tap "Auto-appoint" → an in-app WebView
     opens the portal; they log in themselves (password never touches your server); injected
     JS adds you as their intermediary automatically. Web shows manual only (the portal blocks
     cross-origin iframing). If it fails, the manual steps are the supported fallback.

### 1c. Verify the token fetch uses `onbehalfof`

With the taxpayer logged into the app (their TIN set), call validate-tin — it forces a token
fetch:
```bash
curl -s -X POST https://autoinvoice.neyobytes.com/myinvois/validate-tin \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"tin":"<some buyer TIN>"}'
```
- **If your platform creds are valid** and the taxpayer appointed you → `200` with the TIN
  validation result from LHDN.
- **If your platform creds are fake/invalid** → `502 lhdn_error` with
  `LHDN token endpoint 400: invalid_client` (this proves the request reached LHDN with the
  `onbehalfof` header — the wiring is correct).
- **If the taxpayer hasn't set their TIN** → `400 invalid_input`: *"Set your TIN in your
  profile first so we can submit on your behalf."*

Inspect the live token fetch in the logs:
```bash
pm2 logs auto-invoice-api-stg --lines 50 | grep -i token
```

---

## 2. Flow 2 — Taxpayer (Login as Taxpayer System, 07)

**Each taxpayer generates their OWN ERP key and pastes it into the app.** No appointment, no
`onbehalfof` — the token is fetched with that user's own creds and is already scoped to them.

### 2a. Configure the backend

```bash
# .env.stg
MYINVOIS_CRED_MODE=taxpayer
# MYINVOIS_CLIENT_ID/SECRET are an OPTIONAL single-tenant fallback; leave blank
# for the pure per-user flow (the user's own stored creds take priority).
```
`pm2 restart auto-invoice-api-stg --update-env`.

### 2b. Per taxpayer: generate + paste their own ERP key

1. The taxpayer logs into their own MyInvois portal (sandbox:
   `https://preprod-mytax.hasil.gov.my`) → **Generate ERP** → copies `client_id` +
   `client_secret` (shown once).
2. In the app: **Settings → LHDN account → Connect LHDN** → paste both values → **Connect**.
   - The secret is **AES-256-GCM encrypted at rest** (keyed by `PROFILE_SECRET_KEY`); only the
     `client_id` + connection timestamp ever come back to the frontend.

### 2c. Verify

```bash
# GET /myinvois/connection — shows clientId (never the secret)
curl -s https://autoinvoice.neyobytes.com/myinvois/connection \
  -H "Authorization: Bearer $USER_TOKEN"
# → { "connected": true, "clientId":"...", "connectedAt":"..." }
```
Then validate-tin (forces a token fetch with that user's own creds):
```bash
curl -s -X POST https://autoinvoice.neyobytes.com/myinvois/validate-tin \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"tin":"<buyer TIN>"}'
# connected + valid creds → 200 LHDN result
# not connected → 409 myinvois_not_connected
```

Disconnect any time:
```bash
curl -X DELETE https://autoinvoice.neyobytes.com/myinvois/connection \
  -H "Authorization: Bearer $USER_TOKEN"
```

---

## 3. Submit (gated on the signing cert — see §4)

`POST /myinvois/submit/:invoiceId` builds the UBL document and submits. **Real submit is
gated on the signing cert** — without it the service throws `SigningNotConfiguredError`
(`503 signing_not_configured`). The signing scaffolding (Steps 1,2,4,5,6 + a switchable
Step 3) is implemented in `backend/src/lib/signing.ts` with unit tests, but **the
`SignatureValue` target is not yet confirmed** — see §4.

Until the cert + round-trip are done, the **mock** env (`MYINVOIS_ENV=mock`) exercises the
full capture → review → submit → status flow with canned responses. That's the path for UI
development.

---

## 4 — Signing: procurement & round-trip runbook

> **This is the real remaining blocker for sandbox/prod submit.** Be honest about it: token +
> validate-tin work now; submit does not, because the document must be signed and the exact
> signing target can only be confirmed with a real cert + a successful round-trip.

### 4a. Procure the signing cert

The cert must come from **POS Digicert Sdn Bhd** (Malaysia's government CA,
`posdigicert.com.my`), issued under LHDNM's Sub CA. See `docs/myinvois/RESEARCH.md §6`.

> ⚠️ **This cannot be done for you by anyone else.** A POS Digicert signing cert is
> issued to *your* registered business identity after identity verification, and
> the private key must be generated for and controlled by you. The cert's subject
> IS your taxpayer identity (TIN/BRN + emailAddress), and the CA is legally
> required to verify that identity before issuing. Having someone else buy one
> and hand you a keypair LHDN will accept is impossible — it would be cert
> fraud, not a shortcut. So this step is **yours to execute**.

There are two tiers — do the sandbox tier first:

#### Tier 1 — Sandbox: a **Trial** cert (free, do this first)

- Issued under `CN=Trial LHDNM Sub CA V1, O=LHDNM, C=MY`.
- This is **exactly** the cert the official signing sample uses (the `KKBSTy…`
  cert digest our unit tests in `scripts/verify-signing.ts` reproduce).
- It's meant for integration testing against `preprod-api.myinvois.hasil.gov.my`.
- Source: the **LHDN MyInvois sandbox portal** (`preprod-mytax.hasil.gov.my`) and/or
  POS Digicert's site, referencing the **"Digital Signature Certificate Profile"**
  for e-invoicing (`/signature/#digital-signing-certificate-profile` on the LHDN
  SDK site).

#### Tier 2 — Production: a **paid** cert

- Issued under the **production** LHDNM Sub CA.
- Required before you submit to `api.myinvois.hasil.gov.my` (prod).
- Same CA, identity-verified, paid. Reuse the exact same code path; only the cert
  in `.env` differs.

#### The procurement flow (you execute this — it can't be delegated)

1. **Have a registered business** (SSM) with a TIN + BRN. The cert subject *is* your
   business identity — there's no way around this.
2. **Request the cert** through POS Digicert (their e-invoicing signing cert
   product). They'll perform KYC: SSM business registration + the representative's
   NRIC/passport + contact verification.
3. **Receive the cert + private key** via secure download (some CAs issue via a USB
   token — confirm what POS Digicert offers for e-invoicing specifically; if a
   token is the only option, extract the PEM/key per their guidance so you can put
   it in `.env`).
4. **Drop it into `.env` and run the round-trip in §4c below.**

> ℹ️ **Pricing / forms / turnaround:** check `posdigicert.com.my` directly for the
> current application form, fees, and processing time — these aren't in this repo
> and may change. The structural steps above (the parts that matter for wiring it
> into the app) are stable.

You'll receive a cert + private key. Put them in `.env.stg` (or `.env.prod`):
```bash
MYINVOIS_CERT_PEM=<PEM cert>
MYINVOIS_KEY_PEM=<PEM private key>
```
`pm2 restart auto-invoice-api-stg --update-env`. The `SigningNotConfiguredError` gate then
passes and submit proceeds to the signing step.

> **You don't have to wait for the cert to keep building.** Both flows' token +
> `validate-tin` already work against the live sandbox (verified end-to-end), and
> `MYINVOIS_ENV=mock` runs the full capture → review → submit → status loop with
> the new JSON builder. The cert only gates the final *real* submit.

### 4b. Resolve the signing target (the coin-flip)

LHDN's signing doc (`docs/myinvois/signature-creation-json.md`) is **ambiguous** on what
`SignatureValue` signs — your own `RESEARCH.md §6` calls this a co-equal blocker:

- **Option A — `docdigest`:** the prose literally says sign the bare Step-2 document digest
  (`SignHash(docDigest, SHA256, PKCS1)`). Analytically favoured (Step 3 precedes Step 6 in the
  doc, which only makes sense if Step 3 signs the doc digest, not `SignedInfo`).
- **Option B — `signedinfo`:** standard XAdES — sign `c14n(SignedInfo)`. The wire sample
  carries a full `SignedInfo` with two `Reference`s, which structurally implies this.

**Neither is confirmed.** A blind guess wastes days when LHDN rejects it. The implemented
scaffolding makes this a **one-line env flip** once you have the cert:

```bash
# .env.stg
MYINVOIS_SIGN_TARGET=docdigest    # Option A (prose)
# or
MYINVOIS_SIGN_TARGET=signedinfo   # Option B (standard XAdES)
```

Until you set this (and have a cert), `signSignatureValue(...)` throws
`SigningTargetUnverifiedError` by design — so you can't accidentally ship a guessed
signature.

### 4c. The round-trip (do this once, with the cert)

1. Set `MYINVOIS_CERT_PEM`/`KEY_PEM` + `MYINVOIS_SIGN_TARGET=docdigest`.
2. Submit one sandbox invoice:
   ```bash
   curl -X POST https://autoinvoice.neyobytes.com/myinvois/submit/<invoiceId> \
     -H "Authorization: Bearer $USER_TOKEN"
   ```
3. **If accepted** → `MYINVOIS_SIGN_TARGET=docdigest` is correct; you're done. Update
   `RESEARCH.md §6` to mark the blocker resolved and remove the throw.
4. **If rejected with a signature error** → flip to `MYINVOIS_SIGN_TARGET=signedinfo` and
   retry. If that also fails, the remaining unknown is the exact **minified-doc byte
   serialization** (the doc's v1.1 sample digest didn't reproduce from a `json.dumps`
   minify — see `scripts/verify-signature.py`). At that point you reverse-engineer the
   minification from a known-good sample (capture a successful submit's request body from the
   portal's devtools and diff the byte serialization).
5. Either way, record the working target + minification in `RESEARCH.md §6` and the test
   in `scripts/verify-signing.ts` so it's locked in.

### 4d. What's already implemented + verified (no cert needed)

`backend/src/lib/signing.ts` — pure functions, unit-tested in
`backend/scripts/verify-signing.ts` (run: `npm run signing:verify`). Uses
Node's built-in `node:test`; all 14 tests pass, including the byte-exact
**crypto-confirmed** assertions against the official LHDN trial-cert wire sample.

| Step | Function | Status |
|------|----------|--------|
| 1 | `transformDocument` (strip UBLExtensions/Signature + minify) | **implemented + tested** (deterministic, idempotent) |
| 2 | `documentDigest` = `base64(SHA256(UTF8(minified)))` | **implemented + tested** (byte-serialization NOT yet matched to LHDN for arbitrary invoices — see §4c4) |
| 4 | `certDigest` = `base64(SHA256(cert DER))` | **BYTE-EXACT VERIFIED** → reproduces `KKBSTyiPKGkGl1AFqcPziKCEIDYGtnYUTQN4ukO7G40=` |
| 5 | `buildSignedProperties` | **implemented + tested** (issuer RDNs normalized to `CN, …, C`; serial parsed hex→decimal) |
| 6 | `signedPropertiesDigest` | **BYTE-EXACT VERIFIED** → reproduces `Rzuzz+70GSnGBF1YxhHnjSzFpQ1MW4vyX/Q9bTHkE2c=` |
| 3 | `signSignatureValue` (`docdigest`) | **implemented + self-consistent round-trip tested** (sign→verify passes, tamper fails) — but ⚠️ LHDN acceptance UNVERIFIED until §4c |
| 3 | `signSignatureValue` (`signedinfo`) | **throws `PendingImplementationError`** (c14n of SignedInfo not implemented) |
| 3 | `signSignatureValue` (empty/unknown) | **throws `SigningTargetUnverifiedError`** (defensive — never silently signs) |
| verify | `verifyDocumentSignature` | **implemented + tested** (mirror of `docdigest`; pass the document, not a pre-hashed digest — Node hashes once) |
| 7 | `assembleSignedDocument` | **implemented** (structural); embeds UBLExtensions + KeyInfo + SignedInfo into the JSON doc. Not validated against LHDN until §4c passes |
| — | `buildUblJson` (`lib/ublJson.ts`) | **implemented + tested** — produces the JSON UBL v1.1 envelope the submit path now sends (`format:"JSON"`) |

**What this means concretely:** the deterministic, cert-independent pieces are
locked in with byte-exact tests. The ONLY remaining unknowns (both gated on a
real cert + round-trip) are (a) which signing target LHDN accepts (`docdigest`
vs `signedinfo`), and (b) the exact minified-doc byte serialization for
arbitrary invoices. The submit service refuses to sign until you set
`MYINVOIS_SIGN_TARGET` after a round-trip — so you cannot accidentally ship a
guessed signature.

---

## Quick reference — which flow am I on?

| Symptom | Meaning |
|---------|---------|
| `/myinvois/status` → `credMode: "intermediary"` | Flow 1 (platform creds + onbehalfof) |
| `/myinvois/status` → `credMode: "taxpayer"` | Flow 2 (per-user paste) |
| Settings shows **"Intermediary"** row → `/appoint-intermediary` | Flow 1 |
| Settings shows **"LHDN account"** row → `/connect-myinvois` | Flow 2 |
| validate-tin → `409 myinvois_not_connected` | Flow 2, user hasn't pasted their key |
| validate-tin → `400 invalid_input` "Set your TIN…" | Flow 1, user hasn't set their supplier TIN |
| validate-tin → `502 lhdn_error` `invalid_client` | Reached LHDN; platform/user creds are wrong/expired |
| submit → `503 signing_not_configured` | No cert yet (expected in sandbox until §4a) |
| submit → `502 lhdn_error` after signing | Cert present but signing target/minification wrong (§4c) |