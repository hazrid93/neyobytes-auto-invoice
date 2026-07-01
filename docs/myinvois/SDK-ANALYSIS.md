# LHDN MyInvois SDK — deep analysis vs our implementation

Date: 2026-06-30
Sources (fetched locally under `docs/myinvois/sdk-ref/`):
- `sdk.myinvois.hasil.gov.my/einvoicingapi/` — 11 e-Invoicing APIs (each sub-page fetched)
- `sdk.myinvois.hasil.gov.my/document-validation-rules/` — 8 validators
- `sdk.myinvois.hasil.gov.my/types/` — 9 document types × v1.0/v1.1 (structure pages fetched)
- `sdk.myinvois.hasil.gov.my/sample/` — 44 sample JSON/XML (all downloaded to `samples/`)
- `sdk.myinvois.hasil.gov.my/faq/` — full FAQ extracted (263 lines)
- `sdk.myinvois.hasil.gov.my/codes/` — e-invoice-types, tax-types, payment-methods, state-codes (+ countries, currencies, msic, classification, unit-types)
- `github.com/pyhoon/myinvois-b4x-sdk` — working reference SDK (B4X/Basic4Android), `MyInvois.bas` fetched

This doc is the authoritative gap list. The implementation work to close these gaps
follows in code commits.

---

## 1. The 9 document types + versions

e-Invoice type **codes** (from `codes/e-invoice-types.txt`):

| Code | Type | Our status |
|------|------|------------|
| 01 | Invoice | ✅ hardcoded |
| 02 | Credit Note | ❌ |
| 03 | Debit Note | ❌ |
| 04 | Refund Note | ❌ |
| 11 | Self-billed Invoice | ❌ |
| 12 | Self-billed Credit Note | ❌ |
| 13 | Self-billed Debit Note | ❌ |
| 14 | Self-billed Refund Note | ❌ |

- **v1.0 vs v1.1**: identical structure; v1.1 enables signature validation, v1.0 disables it.
  v1.0 will be deprecated. We target `listVersionID: "1.1"`. ✅
- **Credit/Debit/Refund notes reference original invoices** via `BillingReference` /
  `InvoiceDocumentReference` (Referenced Documents Validator checks these are valid).
- Our `buildUblJson` hardcodes `InvoiceTypeCode: '01'` and has no `BillingReference`.
  → **Must add an `invoiceType` input + BillingReference for notes.**

---

## 2. The 8 document validators (what rejects our payload)

From `document-validation-rules.txt`:

1. **Structure Validator** — checks the doc matches the document-type-version structure
   (UBL 2.1). Our key ORDER + missing mandatory elements would fail here.
2. **Core Fields Validator** — checks the main fields any doc must have. **This is the
   one our current `buildUblJson` would FAIL** (see §4).
3. **Signature Validator** — validates the signature (excluded from this scope; gated
   behind `MYINVOIS_SIGN_TARGET`).
4. **Taxpayer Validator** — validates the taxpayers (supplier/buyer) referenced are valid
   at the issuance date; issuer async checks. Relies on TIN being correct.
5. **Referenced Documents Validator** — for credit/debit/refund notes, the referenced
   invoices must be valid. We don't build notes yet.
6. **Code Validator** — currency codes, tax types, state codes, payment codes, MSIC, unit
   codes must be from the official tables. We hardcode `C62`, `MYS`, `MYR`, `01` — must
   ensure these are valid code-list values.
7. **Duplicate Document Validator** — flags duplicates within a 2-hour window using
   (type+version) AND (issuance date+time) AND (internal ID/invoice number) AND (supplier
   TIN, or buyer TIN for self-billed). We must not re-submit identical docs.
8. **Currency Validator** — correct currency codes + exchange rates. Foreign currency
   needs `TaxExchangeRate/CalculationRate`.

---

## 3. The 11 e-Invoicing APIs — what we implement vs miss

| # | API | Path | Our status |
|---|-----|------|-----------|
| 01 | Validate Taxpayer TIN | `GET /api/v1.0/taxpayer/validate/{tin}` | ✅ |
| 02 | Submit Documents | `POST /api/v1.0/documentsubmissions/` | ✅ |
| 03 | Cancel Document | `PUT /api/v1.0/documents/{uuid}/cancel` | ❌ |
| 04 | Reject Document | `PUT /api/v1.0/documents/{uuid}/reject` | ❌ (buyer rejects received invoice — flow 2) |
| 05 | Get Recent Documents | `GET /api/v1.0/documents/recent` | ❌ |
| 06 | Get Submission | `GET /api/v1.0/documentsubmissions/{submissionUid}` | ❌ — **THIS is where `longId` comes from** |
| 07 | Get Document | `GET /api/v1.0/documents/{uuid}/raw` | ❌ — returns original source + metadata (customer retrieval) |
| 08 | Get Document Details | `GET /api/v1.0/documents/{uuid}/details` | ✅ (but doesn't surface `longId`/validation link) |
| 09 | Search Documents | `GET /api/v1.0/documents/search` | ❌ |
| 10 | Search Taxpayer TIN | `GET /api/v1.0/taxpayer/search/{...}` | ❌ |
| 11 | Taxpayer's QR Code | `GET /api/v1.0/taxpayers/qrcodeinfo/{qrCodeText}` | ❌ — decode a scanned QR → taxpayer info |

### The `longId` + validation-link flow (closes the audit-repository gap)

- The **submit response** (02) returns `submissionUid` + `acceptedDocuments[{uuid, invoiceCodeNumber}]`. It does **NOT** contain `longId`.
- The **`longId`** ("unique long temporary Id that can be used to query document data
  anonymously, returned only for valid documents") comes from **Get Submission (06)**,
  **Get Document (07)**, or **Get Document Details (08)** — in `documentSummary[].longId`.
- The **validation link** format (stated in FAQ + Get Document + Get Document Details):
  ```
  {envbaseurl}/uuid-of-document/share/longid
  ```
  - PROD `envbaseurl` = `https://myinvois.hasil.gov.my`
  - SANDBOX `envbaseurl` = `https://preprod.myinvois.hasil.gov.my`
- The **QR code** on the rendered invoice is generated (client-side, any QR generator)
  from that validation link. (FAQ: "How to get validation link and generate QR code?")
- **Our gap**: `submitInvoice` stores `uuid` into `myinvois_doc_id` (wrong field — that
  should hold the human `longId` "Document ID"); `validation_uuid` + `qr_url` columns are
  never written. Fix: after a successful submit, poll **Get Submission (06)** to fetch
  `longId` per document, build the validation link, store `uuid → validation_uuid`,
  `longId → myinvois_doc_id` (or a new `long_id` column), `link → qr_url`.

### Document statuses (integer in DB, string in API responses)

Submitted=1, Valid=2, Invalid=3, Cancelled=4. API Get Submission/Get Document return
the string form. Our `getDocumentDetails` maps `raw.status` — fine.

---

## 4. Core Fields Validator — mandatory fields our `buildUblJson` is MISSING

This is the headline finding. Comparing our builder to the canonical
`1.1-Invoice-Sample.json` + the `invoice-v1-1` structure page:

### Invoice-level (mandatory, we omit)
| Field | Canonical | Ours | Fix |
|-------|----------|------|-----|
| `IssueTime` | `[{_: "00:30:00Z"}]` UTC | ❌ omitted | add `IssueTime` (current UTC `HH:MM:SSZ`) |
| `TaxCurrencyCode` | `[{_: "MYR"}]` | ❌ omitted | add (== DocumentCurrencyCode, or MYR for foreign) |
| `TaxTotal/TaxSubtotal` | breakdown per tax type | ❌ only `TaxAmount` | add `TaxSubtotal[]` with `TaxableAmount`, `TaxAmount`, `TaxCategory.ID` (tax type), `TaxScheme.ID='OTH'` |

### Supplier (AccountingSupplierParty.Party) — mandatory, we emit wrong/missing
| Canonical field | Mandatory | Ours | Fix |
|-----------------|-----------|------|-----|
| `PartyLegalEntity.RegistrationName` | ✅ | ❌ we use `PartyName` (wrong element) | use `PartyLegalEntity/RegistrationName` |
| `PartyIdentification[TIN]` | ✅ | ✅ | keep |
| `PartyIdentification[BRN]` | ✅ | ✅ ('NA' fallback) | keep |
| `PartyIdentification[SST]` | ✅ ('NA' if none) | ❌ | add |
| `PartyIdentification[TTX] | ✅ ('NA' if none) | ❌ | add |
| `IndustryClassificationCode` (MSIC, 5-digit + `name`) | ✅ | ❌ | add (profile column + UI) |
| `PostalAddress.CityName` | ✅ | ❌ | add (structured address) |
| `PostalAddress.CountrySubentityCode` (state code 01-17) | ✅ | ❌ | add |
| `PostalAddress.AddressLine[].Line` (≥1 line) | ✅ | ❌ (we emit `StreetName`) | add `AddressLine[]` |
| `PostalAddress.Country.IdentificationCode` (MYS) | ✅ | ✅ (but no listID/listAgencyID attrs) | add attrs |
| `Contact.Telephone` (E.164) | ✅ | ❌ | add |
| `Contact.ElectronicMail` | optional | ❌ | add if present |

### Buyer (AccountingCustomerParty.Party) — same set
- `RegistrationName` (mandatory), `PartyIdentification[TIN,BRN,SST]`, `PostalAddress`,
  `Contact.Telephone` (mandatory, `'NA'` for consolidated), `ElectronicMail` (optional).
- We emit only TIN/BRN + a single address string + PartyName. Same fixes as supplier.

### InvoiceLine — mandatory, we omit
| Canonical field | Mandatory | Ours | Fix |
|-----------------|-----------|------|-----|
| `ItemPriceExtension.Amount` | ✅ | ❌ | add (== line subtotal) |
| `Item.CommodityClassification[CLASS].ItemClassificationCode` | ✅ (3-char) | ❌ | add (line MSIC) |
| `TaxTotal.TaxAmount` | ✅ | ✅ | keep |
| `TaxTotal.TaxSubtotal` (TaxableAmount, TaxAmount, `TaxCategory.ID`, `TaxScheme.ID='OTH'`) | ✅ | ❌ | add per line |
| `TaxCategory.Percent` (tax rate) | where applicable | ❌ | add |
| `Item.Description` | ✅ | ✅ | keep (drop the duplicate `Name`) |
| `InvoicedQuantity` + `unitCode` | optional / recommended | ✅ `C62` | keep, make configurable |

### Net effect
Our current builder would be **rejected by the Core Fields Validator** for missing
`IssueTime`, `RegistrationName`, `IndustryClassificationCode`, `PostalAddress` proper,
`Contact.Telephone`, line `ItemPriceExtension`, line `CommodityClassification`, and the
`TaxSubtotal` breakdown. **This is the centerpiece of the work.**

---

## 5. FAQ findings — constraints we don't enforce

### TIN normalization (FAQ: "How to retrieve and validate the accuracy of my TIN?")
- **Individual** TIN: prefix is now `IG` (replacing `OG`/`SG`), max 14 chars incl. prefix.
- **Non-Individual** TIN (prefix C, CS, D, F, FA, PT, TA, TC, TN, TR, TP, J, LE):
  - strip leading zeros after the prefix (`C0123...` → `C123...`)
  - **must end with `0`** (`C123456789` → `C1234567890`). Non-Individual TIN always ends with zero.
- We pass TINs through verbatim. → Add a `normalizeTin()` helper applied before submit +
  validate.

### Supplier/Buyer field validation (FAQ table) — length/format limits
| Field | Rule |
|-------|------|
| Name | ≤ 300 chars |
| Email | RFC 5321/5322, ≤ 320, no spaces; **leave blank if none** (NOT 'NA') |
| Phone | 8–20 chars, optional leading `+`, no spaces between digits |
| Address Line 1-3 | ≤ 150 chars each |
| City Name | ≤ 50 chars |
| Postal Code | MY = 5 digits; other = ≤ 50 alphanumeric+special |
| SST Number | ≤ 35 chars, only `-`/`;`, up to 2 separated by `;`, `'NA'` if none |
| TTX Number | ≤ 17 chars, only `-`, `'NA'` if none |

### Other FAQ rules
- **IssueDateTime within 72h of submission, UTC** ("Issuance date time value too old").
  Future dates rejected. → set IssueDate/IssueTime to now() at submit.
- **Authenticated TIN must match document issuer TIN**: taxpayer → issuer TIN == their
  TIN; intermediary → issuer TIN == the represented taxpayer's TIN. (403 IncorrectSubmitter
  otherwise.) → we already enforce supplier.tin presence; document issuer TIN must equal
  the authenticated profile's TIN for taxpayer mode.
- **UBL JSON `_` convention**: "every attribute value should be paired with a key `_`".
  ✅ confirmed — our `v()` helper is correct.
- **documentHash = SHA-256(document)**, **document = Base64(document)**. ✅ we do this.
- **Minification** recommended for >300KB / 1000-line limit. ✅ `transformDocument`.
- **Submission limits**: 5 MB submission, 100 docs, 300 KB per doc, 100 RPM.
- **Negative values allowed**. ✅ (no special handling needed)
- **Single buyer email**, ≤ 320 chars.
- **Duplicate window**: 2h, AND of (type+version, date+time, internal ID, supplier TIN).
- **State code `00` invalid** — must use 01-17 (17 = Not Applicable).
- **Tax exemption**: tax type code `E` + `TaxExemptionReason` + `TaxScheme.ID='OTH'`.
- **Multiple tax types per line**: repeat `TaxSubtotal`.
- **Credit/Debit/Refund referencing multiple originals**: JSON adds a new
  `InvoiceDocumentReference` line.
- **API-submitted invoices can't be printed from the Portal** — printing/PDF is OUR app's
  job (validates our PDF-render gap as a real requirement).

---

## 6. Work plan (closes both the flow audit gaps + the SDK validator gaps)

### A. Data model (enables everything)
- `profiles`: add `brn`, `sst_number`, `ttx_number`, `msic_code`, `msic_description`,
  `contact_number`, `address_line1..3`, `city`, `postal_zone`, `state_code`.
- `customers`: add `brn`, `sst_number`, `contact_number`, `address_line1..3`, `city`,
  `postal_zone`, `state_code`.
- migrations + Drizzle schema.

### B. `buildUblJson` overhaul (Core Fields Validator)
- Emit the canonical structure: IssueTime, TaxCurrencyCode, TaxSubtotal breakdown,
  PartyLegalEntity/RegistrationName (not PartyName), PartyIdentification[TIN,BRN,SST,TTX],
  IndustryClassificationCode, structured PostalAddress, Contact, line
  CommodityClassification + ItemPriceExtension + per-line TaxSubtotal.
- Add `invoiceType` param (01-04, 11-14) + `billingReference` for notes.
- Add `paymentMeans` (PaymentMeansCode + PayeeFinancialAccount) — closes the bank-detail gap.
- Defaults: absent SST/TTX → `'NA'`; absent address → CityName `''`? No — use sensible
  `'NA'` for line0 + state `17` so the doc is still submittable per the FAQ's "NA" convention.
- Add a structure-diff test against the canonical sample (keys present, mandatory ✓).

### C. Audit-repository gap (Tier 1)
- `getSubmission(submissionUid)` → `documentSummary[].longId`.
- After accept: store `uuid → validation_uuid`, `longId → myinvois_doc_id`,
  `qr_url = {envbaseurl}/{uuid}/share/{longId}`.
- Resubmit routing on submit screen.

### D. Extraction + UI wiring
- Stage B prompt: capture buyer SST/contact/structured-address (best-effort); line
  CommodityClassification is rarely on a paper invoice → default to a placeholder MSIC.
- Profile settings UI: supplier MSIC + business activity + contact + SST + TTX +
  structured address + BRN.
- Review screen: editable buyer structured fields + payment means/bank account.

### E. QR + PDF + customer retrieval (Tier 2/3)
- Render the validation-link QR (client-side) on the submit result + a PDF.
- Generate a PDF (server-side, e.g. a light HTML→PDF or a RN view) showing company/TIN/
  SSM, items, total, Document ID, Validation UUID, QR.
- Public (unauthenticated) customer-retrieval endpoint: look up by Document ID or QR
  (decoded) → render the invoice. (Get Document API or read our stored data.)

### F. Code-list hygiene (Code Validator)
- Save the fetched code tables locally (`codes-tax-types.json`, `codes-state-codes.json`,
  `codes-e-invoice-types.json`, `codes-payment-methods.json`, …) for validation/reference.
- Add a `normalizeTin()` + field-length validators (§5) as pre-submit checks.

---

## 7. Out of scope / deferred
- Digital signing + prod send (gated, KNOWLEDGE-BASE.md §5 / TESTING-FLOWS.md §4).
- Self-billed flows (11-14) full support — structurally same as 01-04 with buyer/issuer
  swapped; add once notes (02-04) are proven.
- Search Documents / Get Recent / Search Taxpayer TIN / Taxpayer QR Code APIs — lower
  priority; customer retrieval (Get Document) covers the flow-1 loop.
- Financial Account integration (flow 2) — product decision.
- B2C public-TIN UX distinction — product decision.
---

## 8. Resolution status (2026-06-30/07-01)

All work-plan items in §6 are implemented, verified, and pushed (excluding the
explicitly-deferred signing + prod-send + Tier-4 product decisions).

### A. Data model ✅
Migration `0004_einvoice_fields.sql` (applied to the live DB) + Drizzle schema:
profiles + customers + invoices carry every Core-Fields-Validator field.
`PATCH /auth/me` + `PATCH /invoices/:id` accept them (FAQ length limits).

### B. `buildUblJson` canonical overhaul ✅ (verify-ubl.ts 10/10)
Emits IssueTime, TaxCurrencyCode, invoice+line TaxSubtotal breakdown,
PartyLegalEntity/RegistrationName, PartyIdentification[TIN,BRN,SST,TTX],
IndustryClassificationCode/MSIC, structured PostalAddress, Contact/Telephone,
line CommodityClassification + ItemPriceExtension, PaymentMeans (bank detail),
invoiceType (01-04,11-14) + BillingReference. 'NA' fallback where absent.

### C. Audit-repository gap ✅ (verify-mock-submit.ts 6/6)
Get Submission API (06) added → fetches `longId`; `buildValidationLink` builds
`{envbaseurl}/{uuid}/share/{longId}`; on accept, persists validation_uuid,
longId (→ myinvois_doc_id), qr_url. Submit-screen "Fix & resubmit" on reject.

### D. Extraction + UI wiring ✅
Profile screen: all supplier identity fields (BRN/SST/TTX/MSIC/contact/
structured address). Review screen: e-Invoice type + payment means + bank
account. DTOs + services carry the new fields end-to-end.

### E. QR + PDF + customer retrieval ✅ (verify-public-retrieval.ts 14/14)
QRCode component (pure-JS `qrcode` → PNG data URL, native+web). Submit screen
shows Document ID + "Scan to Verify" QR. Receipt: server-side HTML render with
inline QR (GET /invoices/:id/receipt authed; GET /public/invoices/:ref/receipt
public) + mobile WebView screen. Public lookup: GET /public/invoices/:ref +
POST /public/invoices/qr (decodes the validation link) — the flow-1 right-hand
loop, no raw-data leak.

### F. Code-list hygiene + FAQ validators ✅ (codes.ts 3/3)
Official code sets embedded + pre-flight validators (Code Validator + FAQ
field-length/format). submitInvoice fails fast on bad codes/lengths before a
signed LHDN call (proven: '99' rejected, valid passes). TIN normalization
(tin.ts 6/6) applied in validateTin + submit. Doc artifacts: codes-*.json.

### Deferred (out of scope / product decisions)
- Digital signing + prod send (gated, KNOWLEDGE-BASE.md §5 / TESTING-FLOWS.md §4).
- Cancel/Reject/Get-Recent/Search/Search-TIN/Taxpayer-QR APIs — lower
  priority; customer retrieval (Get Document / public) covers the flow-1 loop.
- Self-billed (11-14) full flows — structurally identical; invoiceType is
  selectable, BillingReference wired.
- B2C public-TIN UX distinction + Financial Account integration (flow 2) —
  product decisions.
