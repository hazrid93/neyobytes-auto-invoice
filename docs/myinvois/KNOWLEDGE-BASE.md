# LHDN MyInvois e-Invoicing — Knowledge Base

> The single reference for everything about this app's integration with LHDN's
> MyInvois System. Read this before working on the e-invoice pipeline (capture →
> extract → review → submit), the signing code, the UBL builder, or the mobile UI.
> Detailed sub-topic docs live alongside this file and are linked from here.

**Last verified:** 2026-07-01 (sandbox `preprod-api`, UBL v1.1, JSON variant).

---

## 0. What this app does

`neyobytes-auto-invoice` turns a photo of a paper invoice into a validated
LHDN e-Invoice. The pipeline:

1. **Capture** (mobile) — photograph the invoice.
2. **Extract** (backend, two-stage LLM) —
   - **Stage A — vision model:** pure OCR. Transcribes the image to text with
     *no* interpretation/judgment. This keeps narration leaks out of the data.
   - **Stage B — text model:** takes Stage A's transcript and produces the
     structured invoice JSON (seller, buyer, line items, totals, currency…).
     ALL massaging/interpretation lives here.
3. **Review** (mobile) — a human edits/confirms the extracted data. Code fields
   are dropdowns sourced from the real LHDN code tables; totals auto-calculate
   from line items.
4. **Submit** (backend) — build the UBL JSON, sign it (XAdES), `POST` to LHDN.
5. **Verify / retrieve** — the buyer/recipient decodes the QR and looks the
   invoice up on LHDN (public retrieval by UUID).

See `docs/flow/flow1.jpeg` (purchase-side verify), `flow2.jpeg` (submit/sign),
`flow3.jpeg` (this app's end-to-end). `docs/flow/IMPLEMENTATION-AUDIT.md` tracks
every gap against those flows.

---

## 1. Environments & base URLs

| Env | API base | Identity (token) base | `MYINVOIS_ENV` |
|---|---|---|---|
| **Sandbox** | `preprod-api.myinvois.hasil.gov.my` | `preprod-api.myinvois.hasil.gov.my` | `sandbox` |
| **Production** | `api.myinvois.hasil.gov.my` | `api.myinvois.hasil.gov.my` (inferred) | `prod` |

- Only the **stg backend** runs (`auto-invoice-api-stg`, port 4002,
  `MYINVOIS_ENV=sandbox`). Public site `autoinvoice.neyobytes.com` → nginx →
  `:4002`. Production backend is shut down.
- The prod identity host is inferred by host-parity with sandbox (the SDK HTML
  is JS-rendered, no host table). Verify against the LHDN portal on first prod
  registration. Does not block sandbox work.
- Source: `docs/myinvois/env-sandbox.json`, `env-prod.json`.

---

## 2. Authentication — OAuth2 client_credentials

`POST https://{idSrvBaseUrl}/connect/token` (form-urlencoded, **no** Bearer — the
only unauthenticated endpoint):

```
client_id=<ERP client id>      # from MyInvois portal registration
client_secret=<ERP client secret>
grant_type=client_credentials
scope=InvoicingAPI
```

- **Token lifetime: 1 hour (3600s).** Reuse the token across operations; do not
  log in per request — frequent logins are rate-limited per client ID.
- **Rate limit:** 100 requests/minute per Client ID (recommended).
- **Header convention:** `Accept-Language: en` (or
  `Accept-Language: en-US,en;q=0.9,ms;q=0.8`) on all API calls.
- Response: `{ access_token, token_type: "Bearer", expires_in, scope }`.

### Two credential flows (`MYINVOIS_CRED_MODE`)

| Mode | Token source | Header | Use when |
|---|---|---|---|
| **`taxpayer`** (default) | the user's own stored client_id/secret (Login as Taxpayer System) | — | Each taxpayer registers their own ERP client in the MyInvois portal and pastes the creds into the app's **Connect** screen. |
| **`intermediary`** | the platform's env-level client_id/secret (Login as Intermediary System) | `onbehalfof: <taxpayer TIN>` on the `/connect/token` request | A single platform account acts for many taxpayers; the `onbehalfof` binding is embedded in the resulting token. Subsequent API calls use Bearer only. |

Implementation: `backend/src/lib/myinvois.ts` — `credMode = env.MYINVOIS_CRED_MODE`.
Per-user/per-taxpayer token cache keyed by `userId` (taxpayer) or
`interm:<taxpayerTIN>` (intermediary). Env global fallback pair supported.

The **Connect** screen (`mobile/src/app/connect-myinvois.tsx`) collects the
client_id/secret; it also links to the two portals where the user registers:
the MyInvois portal and MyTax.

---

## 3. API endpoints (all under `/api/v1.0`, Bearer required)

Source: `docs/myinvois/postman-collection.json` (the machine-readable spec —
there is no OpenAPI file). HTML pages are JS-rendered and not reliably scrapable;
the `.txt` extracts under `docs/myinvois/sdk-ref/api/` are the readable versions.

| # | Action | Method | Path | Used by this app |
|---|---|---|---|---|
| 01 | Validate Taxpayer TIN | GET | `/taxpayer/validate/{tin}?idType=&idValue=` | (validation) |
| **02** | **Submit Documents** | **POST** | `/documentsubmissions` | ✅ submit |
| 03 | Cancel Document | PUT | `/documents/state/{uuid}/state` | ✅ |
| 04 | Reject Document | PUT | `/documents/state/{uuid}/state` | ✅ |
| 05 | Get Recent Documents | GET | `/documents/recent` (last 31d) | (list) |
| **06** | **Get Submission** | GET | `/documentsubmissions/{uuid}` | ✅ status |
| **07** | **Get Document** | GET | `/documents/{uuid}/raw` | ✅ retrieve |
| **08** | **Get Document Details** | GET | `/documents/{uuid}/details` | ✅ validation results |
| 09 | Search Documents | GET | `/documents/search` | |
| 10 | Search Taxpayer TIN | GET | `/taxpayer/search` | |
| **11** | **Taxpayer QR Code** | GET | `/documents/{uuid}/qr` | ✅ QR image |

### Submit Documents body (`format: "JSON"`)

```
POST /api/v1.0/documentsubmissions/   Content-Type: application/json
{
  "documents": [
    {
      "format": "JSON",
      "document": "<base64 of the signed UBL JSON>",
      "documentHash": "<SHA-256 of the minified bare document>",
      "codeNumber": "INV12345"   // supplier's internal ref
    }
  ]
}
```

- JSON **and** XML are accepted; this app uses the **JSON variant** (the only
  LHDN signing doc that operates on JSON — see §5).
- Response: `{ submissionId, documentId (uuid) }` → persist as
  `validation_uuid` / `longId` for retrieval + QR.

### Standard error response

Shape (typical LHDN): `{ "error": "...", "error_description": "...",
"timestamp": "...", "traceId": "...", "errors": [ ... ] }`.

| HTTP | Meaning |
|---|---|
| **401** | token expired → re-login (`/connect/token`) |
| **400** | validation error — see response body for which field/rule failed |

**Server-side validation rules** (`/document-validation-rules/`) define
accept/reject at submission and differ per document type/version; the readable
extracts are under `docs/myinvois/sdk-ref/api/` (the HTML pages are
JS-rendered). Client-side field constraints live separately in §9 (`FIELD_RULES`).

---

## 4. The UBL document (v1.1, JSON variant)

**Canonical reference:** `docs/myinvois/invoice-v1.1-sample.json` (31 KB) — match
this structure byte-for-byte. Builder: `backend/src/lib/ublJson.ts`
(`buildUblJson`).

**Document type versions supported** (`docs/myinvois/sdk-ref/types-pages/`):
`invoice`, `credit`, `debit`, `refund`, and the `self-billed-*` variants, each
at v1.0 and **v1.1**. This app submits **Invoice v1.1**.

Top-level element order (matches the sample's insertion order; JS preserves
string-key order so `JSON.stringify` is the on-wire order):

```
Invoice
├─ ID                         supplier's invoice number
├─ IssueDate / IssueTime       YYYY-MM-DD / HH:MM:SSZ (now, within 72h of submit)
├─ InvoiceTypeCode             01..14 + 16, listVersionID="1.1"
├─ DocumentCurrencyCode        ISO-4217 (MYR default)
├─ [BillingReference]          supplier internal ref, ≤150
├─ [PrepaidPayment]            PaidAmount/PaidDate/PaidTime/ID (advance paid)
├─ AllowanceCharge[]           invoice-level discount(false)/charge(true)
├─ TaxTotal                    TaxAmount + TaxSubtotal[] (per tax type)
├─ LegalMonetaryTotal          the totals block — see §6
├─ InvoiceLine[]               per-line; see §7
└─ [UBLExtensions] (signature) added by signing.ts before submit
```

### Party structure (Supplier / Buyer)

`PartyIdentification[TIN, BRN, SST, TTX]` → `PartyLegalEntity/RegistrationName`
(NOT PartyName) → `PostalAddress` (AddressLine, CityName, PostalZone,
CountrySubentityCode, Country) → `Contact` (Telephone, ElectronicMail).

- **TIN normalization** (`backend/src/lib/tin.ts`): Individual OG/SG → `IG`
  prefix; Non-Individual strips leading zeros + ensures trailing `0`.
- BRN scheme: `BRN|NRIC|PASSPORT|ARMY`. Absent BRN → `'NA'`.
- State code `17` = Not Applicable (non-Malaysia / consolidated).

---

## 5. Signing pipeline (XAdES enveloped, JSON)

Algorithm: `docs/myinvois/signature-creation-json.md` ("Securing JSON Files with
Digital Signatures"). Code: `backend/src/lib/signing.ts`. Verified by
`npm run signing:verify` (`scripts/verify-signing.ts`, 14 unit tests).

**The 7 steps:**

1. **Transform** — strip `UBLExtensions` + `Signature`, minify (no whitespace).
   `transformDocument()`.
2. **Document digest** — `SHA-256` of the minified transformed doc → `docDigest`.
3. (SignedProperties prep.)
4. **Certificate digest** — `SHA-256` of the DER cert → `certDigest`.
   ✅ **byte-exact verified** → reproduces `KKBSTyiPKGkGl1AFqcPziKCEIDYGtnYUTQN4ukO7G40=`.
5. Build `SignedInfo` (Reference[docDigest] + SignedProperties ref).
6. **SignedProperties digest** — `SHA-256` of canonical SignedProperties.
   ✅ **byte-exact verified** → reproduces `Rzuzz+70GSnGBF1YxhHnjSzFpQ1MW8vyX/Q9bTHkE2c=`.
7. **SignatureValue** — RSA sign the signing target.

**Helpers:** `rdnString()` / `issuerString()` / `subjectString()` (reverse RDN
order, join with `", "`); serial as `BigInt('0x'+cert.serialNumber).toString(10)`.

### ⚠️ Two co-equal blockers (both must resolve before a real submit succeeds)

1. **Cert procurement** — the signing cert must come from **POS Digicert Sdn Bhd**
   under LHDNM's Sub CA (Malaysia's only gov CA LHDN accepts). The cert is tied
   to the taxpayer's TIN/BRN after SSM + identity verification. The assistant
   **cannot** procure it — it requires business KYC.
   - **Sandbox trial cert = free.** Production = paid. See
     `docs/myinvois/POS-DIGICERT-REQUEST.md` (the procurement runbook).
   - Configured via `MYINVOIS_CERT_PEM` / `MYINVOIS_KEY_PEM` env.

2. **Signing target** — the doc's prose says sign the bare Step-2 `docDigest`
   (`SignHash(docDigest)`), but the wire sample carries a full `SignedInfo`
   (standard XAdES implies `Sign(c14n(SignedInfo))`). LHDN accepts exactly one;
   the public artifact couldn't disambiguate (RSA-verify of `SignatureValue`
   was inconclusive: the page's Step-1 transform block is the v1.0 invoice but
   the signed wire sample is v1.1, so the digests can't match by construction).
   Analytical evidence favours the prose: Step 3 (sign) is sequenced *before*
   Step 6 (signed-properties digest) — only sensible if Step 3 signs the bare
   doc digest, since `SignedInfo` can't be serialized without its
   `SignedProperties` `Reference.DigestValue` first.
   - **Gated behind `MYINVOIS_SIGN_TARGET`** env (`'docdigest' | 'signedinfo'`).
     `signSignatureValue` throws `SigningTargetUnverifiedError` until a real
     round-trip confirms which the verifier accepts. **Never ship a guessed
     SignatureValue.**
   - See `docs/myinvois/TESTING-FLOWS.md` for the round-trip runbook.

### Defensive guards

- `SigningNotConfiguredError` — submit service refuses without cert+key in env.
- `SigningTargetUnverifiedError` — refuses on an unrecognized sign target.
- No private keys in git — test keypairs generated in-memory.

---

## 6. The monetary / totals model (auto-calculated)

**Reference:** `docs/myinvois/sdk-ref/types-pages/invoice-v1-1.txt` lines 196–269.
**Canonical sample:** `invoice-v1.1-sample.json` lines 575–665.

Totals are **derived from line items — the user does not type them.** The mobile
review screen computes them live (`mobile/src/lib/calc.ts`) mirroring the backend
builder's math (`backend/src/lib/ublJson.ts`).

### Per line (excl. tax)

| Field | Formula | UBL path |
|---|---|---|
| **LineExtensionAmount** (net) | `quantity × unitPrice` | `InvoiceLine/cbc:LineExtensionAmount` |
| **ItemPriceExtension** (subtotal) | `quantity × unitPrice` | `InvoiceLine/cac:ItemPriceExtension/cbc:Amount` |
| **TaxAmount** (line) | `net × taxRate%` (percentage types) | `InvoiceLine/cac:TaxTotal/cbc:TaxAmount` |

### Invoice-level `LegalMonetaryTotal`

| Field | Meaning | Formula | Mand. |
|---|---|---|---|
| **LineExtensionAmount** | Total Net Amount | `Σ line net` | Optional |
| **TaxExclusiveAmount** | Total Excluding Tax | `Σ line net` (incl. discounts/charges, excl. tax) | **Mandatory** |
| **TaxInclusiveAmount** | Total Including Tax | `subtotal + taxTotal` | **Mandatory** |
| **AllowanceTotalAmount** | Total Discount Value | `Σ discounts` | Optional |
| **ChargeTotalAmount** | Total Fee/Charge (pre-tax) | `Σ charges` | Optional |
| **PayableRoundingAmount** | Rounding added to payable | rounding delta | Optional |
| **PayableAmount** | Total Payable | `TaxInclusiveAmount + rounding − prepaid` | **Mandatory** |

### Invoice-level `TaxTotal` (grouped by tax type → `TaxSubtotal[]`)

| Field | Meaning |
|---|---|
| `TaxAmount` | total tax payable (Mandatory) |
| `TaxSubtotal[]/TaxableAmount` | taxable amount per tax type |
| `TaxSubtotal[]/TaxAmount` | tax payable per tax type |
| `TaxSubtotal[]/Percent` | rate % (percentage types) |
| `TaxSubtotal[]/TaxCategory/ID` | tax type code (01..06, E) |
| `TaxSubtotal[]/TaxExemptionReason` | only when code = `E` (exempt); `TaxAmount = 0` |

### Tax types & rate semantics

| Code | Name | Rate semantics |
|---|---|---|
| 01 | Sales Tax | % (or fixed PerUnitAmount × units) |
| 02 | Service Tax | % |
| 03 | Tourism Tax | **fixed** — PerUnitAmount × BaseUnitMeasure (e.g. RM10/room/night) |
| 04 | High-Value Goods Tax | % |
| 05 | Sales Tax on Low Value Goods | % |
| 06 | Not Applicable | rate 0 (default) |
| E | Tax exemption | TaxAmount = 0, TaxExemptionReason required |

> **Current line model carries a single `tax_rate` treated as a percentage**
> (mobile + backend in lockstep). Per-unit tourism tax (code 03) needs
> `PerUnitAmount` + `BaseUnitMeasure` — a documented next tier.

### Invoice-level + line-level AllowanceCharge (discounts/charges)

- **Line level:** `InvoiceLine/AllowanceCharge` — `ChargeIndicator` false =
  discount, true = charge; `MultiplierFactorNumeric` = rate, `Amount` = value,
  `AllowanceChargeReason` = description.
- **Invoice level:** `Invoice/AllowanceCharge` — same shape; sums feed
  `AllowanceTotalAmount` / `ChargeTotalAmount`.
- **Freight:** `Delivery/Shipment/FreightAllowanceCharge` (shipping charge).

---

## 7. Line item fields (`InvoiceLine`)

| Field | UBL path | Max chars | Mand. |
|---|---|---|---|
| Classification (CLASS) | `Item/CommodityClassification[CLASS]` | 3 | ✅ |
| Description | `Item/cbc:Description` | 300 | ✅ |
| Unit Price | `Price/cbc:PriceAmount` | — | ✅ |
| Tax Type | `TaxTotal/TaxSubtotal/TaxCategory/ID` | 2 | ✅ |
| Tax Rate | `TaxSubtotal/cbc:Percent` | — | when applicable |
| Tax Amount | `TaxTotal/cbc:TaxAmount` | — | ✅ |
| Subtotal | `ItemPriceExtension/cbc:Amount` | — | ✅ |
| LineExtensionAmount | `cbc:LineExtensionAmount` | — | ✅ |
| Quantity | `cbc:InvoicedQuantity` | ≤5 dp | optional |
| Unit code | `InvoicedQuantity/@unitCode` | UN/ECE Rec 20 | optional |
| Discount rate/amount | `AllowanceCharge[ChargeIndicator=false]` | — | optional |
| Charge rate/amount | `AllowanceCharge[ChargeIndicator=true]` | — | optional |
| Product Tariff Code (PTC) | `CommodityClassification[PTC]` | 12 | goods only |
| Country of origin | `Item/OriginCountry/IdentificationCode` | 3 (ISO-3166) | optional |

> **MSIC vs Classification** — two separate systems. **MSIC** (5-digit) is the
> *supplier-level* `IndustryClassificationCode` (one per supplier, from 1175
> codes). **Classification** (3-char "CLASS" list) is the *line-item*
> `CommodityClassification` (45 codes). Different tables, different UBL elements.

---

## 8. Code tables (sourced from the live SDK)

Parsed from `sdk.myinvois.hasil.gov.my` into `mobile/src/data/*.json` + a typed
module `mobile/src/data/codes.ts` (`CodeEntry { code, label, description }`,
`FIELD_RULES`, `codeLabel()`, `findEntry()`).

| Table | Count | Used for |
|---|---|---|
| e-Invoice types | 8 | `InvoiceTypeCode` (01–04, 11–14) |
| Payment methods | 8 | `PaymentMeansCode` (01–08) |
| State codes | 17 | address `CountrySubentityCode` (MY; 17 = N/A) |
| Tax types | 7 | `TaxCategory/ID` (01–06, E) |
| Classification (CLASS) | 45 | line `CommodityClassification` |
| MSIC | 1175 | supplier `IndustryClassificationCode` |
| Countries | 253 | address + line `OriginCountry` (ISO-3166-1) |
| Currencies | 180 | `DocumentCurrencyCode` (ISO-4217) |
| Unit types | 2163 | `InvoicedQuantity/@unitCode` (UN/ECE Rec 20) |

- **Bundle strategy:** all 9 JSON tables imported statically into the mobile
  bundle (MSIC ~156 KB + units ~152 KB are the largest — acceptable for mobile,
  no lazy loading needed).
- `CodePicker` (`mobile/src/components/CodePicker.tsx`) — searchable bottom-sheet
  for any table, with a help (?) popup listing every option's code + description.
- `FIELD_RULES` co-locates max-char / required constraints from the v1.1 data
  structure so validators + pickers agree with LHDN.

---

## 9. Field validation rules (`FIELD_RULES`)

Mirrors the LHDN v1.1 data structure. Validators in `mobile/src/lib/validation.ts`
(`required`, `minLength`, `maxLength`, `exactLength`, `pattern`, `email`,
`phone`, `tin`, `isoDate`, `decimal`, `positiveNumber`, `compose`).

| Field | Max | Required | Notes |
|---|---|---|---|
| TIN | 14 | ✅ | prefix (C/CS/D/F/FA/PT/TA/TC/TN/TR/TP/J/LE/IG/EI/OG/SG) + 6–13 digits |
| BRN (SSM) | 20 | ✅ | scheme BRN/NRIC/PASSPORT/ARMY; 'NA' if none |
| SST number | 35 | | format or 'NA' |
| TTX number | 17 | | format or 'NA' |
| MSIC | 5 | ✅ | supplier industry classification |
| Contact (phone) | 20 | ✅ | E.164-ish |
| Email | 320 | | RFC-ish |
| Address line | 150 | | line 1 required |
| City | 50 | ✅ | |
| Postal zone | 50 | | |
| Invoice number | 50 | ✅ | supplier internal ref |
| Payment account | 150 | | supplier bank account |
| Description | 300 | ✅ | per line |
| State code | 17 list | | 17 = Not Applicable |
| Country | 253 list | | ISO-3166-1 |

- Validation UX: `ValidatedField` (on-blur, red error underneath) +
  `useValidatedForm` (validate-all on submit, block while invalid).

---

## 10. The mobile app (Expo / React Native, static export)

- **Stack:** Expo Router, TypeScript, react-native-web → static HTML/JS/CSS.
- **No bare `.env`** — reads `.env.local` / `.env.stg` / `.env.prod` via
  `load-env.ts` based on `APP_ENV`. `EXPO_PUBLIC_API_BASE_URL` is set at build.
- **Deploy (web):**
  `cd mobile && EXPO_PUBLIC_API_BASE_URL= npx expo export --output-dir dist`
  → nginx serves `dist` immediately (no reload; hashed bundles cached forever,
  `Cache-Control: no-store` on `index.html`). SPA fallback via
  `try_files $uri $uri/ /index.html`.
- **Stg-only backend:** only `auto-invoice-api-stg` (port 4002,
  `MYINVOIS_ENV=sandbox`) runs via pm2.
- **QR codes:** pure-JS (`qrcode` package) → PNG data URL → `Image`
  (`mobile/src/components/QRCode.tsx`).

### Screens & their validation/dropdowns

| Screen | Inputs | Notes |
|---|---|---|
| `login` | email, password, name (register) | format + min-length validation |
| `profile` | supplier identity: TIN, BRN, SST, TTX, MSIC, contact, address | MSIC + State = searchable CodePickers; MSIC auto-fills business activity |
| `connect-myinvois` | client_id, client_secret | eye-toggle; portal links |
| `review` (read+edit) | invoice #, dates, parties, line items, totals | e-Invoice type / payment means / currency / per-line tax-type / unit / classification / country = CodePickers; **totals auto-calc from items (non-editable)** |
| `submit` | — | pre-flight checks profile (names the missing fields) |
| `receipt` | — | server-rendered HTML receipt + QR via WebView |

---

## 11. Data model (persisted)

- `invoice_items` table columns: `id, invoiceId, description, quantity,
  unitPrice, taxRate, amount, sortOrder` — **no** classification /
  tax_type_code / unit_code / origin_country columns.
- Per-line codes (classification, tax_type_code, unit_code, origin_country) are
  persisted into the `extractedData` JSONB blob on the invoice row.
- **⚠️ Known gap:** the submission service reads line items from the
  `invoice_items` TABLE but maps only description/quantity/unitPrice/taxRate,
  dropping the codes (UBL builder falls back to defaults '06'/'C62'/'000'/'MYS').
  Need either a migration (add columns) or merge from `extractedData.items[i]`
  in the submission service. **Tracked as a follow-up.**

---

## 12. Key files map

| Concern | File |
|---|---|
| UBL JSON builder | `backend/src/lib/ublJson.ts` (`buildUblJson`) |
| Signing pipeline | `backend/src/lib/signing.ts` |
| LHDN client (auth + endpoints) | `backend/src/lib/myinvois.ts` |
| TIN normalization | `backend/src/lib/tin.ts` |
| Two-stage extraction | `backend/src/lib/llm.ts`, `extraction.ts` |
| Receipt renderer | `backend/src/lib/receipt.ts` |
| Public retrieval route | `backend/src/routes/public.ts` |
| Submission service | `backend/src/services/invoiceSubmissionService.ts` |
| Schema | `backend/src/db/schema.ts` (migrations under `backend/db/migrations/`) |
| Env config | `backend/src/env.ts` |
| Totals calc (mobile) | `mobile/src/lib/calc.ts` |
| Code tables | `mobile/src/data/codes.ts` + `*.json` |
| Validation | `mobile/src/lib/validation.ts` |
| CodePicker dropdown | `mobile/src/components/CodePicker.tsx` |
| ValidatedField | `mobile/src/components/ValidatedField.tsx` |
| Review screen | `mobile/src/app/review.tsx` |

---

## 13. Official links

| What | URL |
|---|---|
| **SDK home** | https://sdk.myinvois.hasil.gov.my/ |
| e-Invoicing API overview | https://sdk.myinvois.hasil.gov.my/einvoicingapi/ |
| Submit Documents | https://sdk.myinvois.hasil.gov.my/einvoicingapi/02-submit-documents/ |
| Get Submission | https://sdk.myinvois.hasil.gov.my/einvoicingapi/06-get-submission/ |
| Get Document | https://sdk.myinvois.hasil.gov.my/einvoicingapi/07-get-document/ |
| Get Document Details | https://sdk.myinvois.hasil.gov.my/einvoicingapi/08-get-document-details/ |
| QR Code | https://sdk.myinvois.hasil.gov.my/einvoicingapi/11-qr-code/ |
| Document validation rules | https://sdk.myinvois.hasil.gov.my/document-validation-rules/ |
| Standard header params | https://sdk.myinvois.hasil.gov.my/standard-header-parameters/ |
| Signature creation (JSON) | https://sdk.myinvois.hasil.gov.my/signature/ |
| Invoice v1.1 type page | https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/ |
| Codes index | https://sdk.myinvois.hasil.gov.my/codes/ |
| FAQ | https://sdk.myinvois.hasil.gov.my/faq/ |
| Integration practices | https://sdk.myinvois.hasil.gov.my/integration-practices/ |
| Release notes | https://sdk.myinvois.hasil.gov.my/release-notes/ |
| API host — sandbox | `https://preprod-api.myinvois.hasil.gov.my` |
| API host — production | `https://api.myinvois.hasil.gov.my` |
| Token endpoint | `https://{host}/connect/token` |
| MyInvois portal (register ERP client) | https://myinvois.hasil.gov.my/ |
| MyTax portal | https://mytax.hasil.gov.my/ |

> Local copies of every SDK page live under `docs/myinvois/sdk-ref/` (HTML +
> `.txt` extracts + the Postman collection). The `.txt` extracts are the
> reliable readable versions since the HTML is JS-rendered.

---

## 14. Companion docs in this folder

| Doc | What it covers |
|---|---|
| `SDK-ANALYSIS.md` | Gap audit of our UBL builder vs the canonical sample; party-structure notes |
| `TESTING-FLOWS.md` | Flow 1/2 test guide + the signing round-trip runbook (resolves the two blockers) |
| `POS-DIGICERT-REQUEST.md` | How to procure the POS Digicert cert (sandbox trial → production) |
| `signature-creation-json.md` | The signing algorithm this app implements |
| `invoice-v1.1-sample.json` | The canonical UBL payload to match byte-for-byte |
| `postman-collection.json` | The machine-readable API spec (no OpenAPI exists) |
| `Digital_Signature_User_Guide.pdf` | LHDN's signing/hash reference (open in a viewer) |
| `docs/flow/IMPLEMENTATION-AUDIT.md` | Tier 1–4 gap audit against the three flows |

---

## 15. Glossary

- **LHDN** — Lembaga Hasil Dalam Negeri (Malaysia's Inland Revenue Board).
- **MyInvois** — LHDN's national e-Invoicing platform.
- **e-Invoice** — a digitally-signed invoice submitted to MyInvois.
- **UBL** — Universal Business Language (OASIS); the document schema MyInvois
  uses (v2.1, JSON or XML variant).
- **TIN** — Tax Identification Number (the taxpayer's ID).
- **BRN / SSM** — Business Registration Number (Companies Commission of Malaysia).
- **SST** — Sales and Service Tax.
- **TTX** — Tourism Tax.
- **MSIC** — Malaysia Standard Industrial Classification (5-digit supplier code).
- **XAdES** — XML Advanced Electronic Signature (the signing format).
- **POS Digicert** — the only Malaysian CA whose certs LHDN accepts.
- **Intermediary** — a platform acting on behalf of taxpayers (`onbehalfof`).
- **Taxpayer** — the business issuing the invoice (self-submitting).