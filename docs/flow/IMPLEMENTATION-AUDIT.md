# docs/flow → implementation audit

Date: 2026-06-30
Scope: everything the three flow diagrams require, **excluding** (per your instruction)
(1) digital signing of the payload and (2) the live production API send.
Those two are tracked in `docs/myinvois/TESTING-FLOWS.md` §4 + RESEARCH.md §6.

Legend: ✅ implemented · ⚠️ partial · ❌ missing

---

## Flow 1 — "IMPROVED SALES FLOW" (LHDN e-Invoice Submission & Customer Retrieval)

You issue an invoice → submit to LHDN → customer retrieves/verifies.

### A. Input capture
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| A1 | Public TIN (B2C) | ❌ | No public/individual-TIN mode. Buyer TIN is a free string; nothing distinguishes a B2C consumer (EI/IG general TIN) from a B2B company. |
| A2 | Company TIN (B2B) | ✅ | Buyer TIN captured on review screen → `customers.tin`. |
| A3 | APP feeds TIN into flow | ✅ | `review.tsx` buyer TIN field; `customers` table. |

### B. Data generation
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| B1 | Generate data (JSON/XML) | ✅ | `lib/ublJson.ts` builds the JSON UBL variant (XML retired from submit path). e-Invoice type is configurable (01-04, 11-14) via the Review screen CodePicker + `isValidEinsteinType` validation; builder emits `InvoiceTypeCode` from `input.invoiceType` (`6a9534a`). |
| B2 | Generate instant invoice | ✅ | `createDraftInvoice` / `createDraftFromExtraction` → `invoices` row (status `draft`). |

### C. Output / display
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| C1 | APP display invoice — PDF / hard copy / list with doc ID + QR | ✅ | Invoice list (`home.tsx`) shows the LHDN Document ID chip + a small validation QR for submitted invoices (commit `663d28d`). PDF / hard-copy render: `lib/receipt.ts` self-contained HTML receipt + `receipt.tsx` WebView with “View receipt / PDF” (browser print-to-PDF) — see F3-9 (`6a9534a`). |

### D. Submission to MyInvois
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| D1 | MyInvois API client/adapter | ✅ | `lib/myinvois.ts` (sandbox host verified). |
| D2 | Receive submission UID | ✅ | Parsed from response → `myinvois_submissions.submission_uid`. |
| D3 | Submission API call | ✅ | `POST /api/v1.0/documentsubmissions` (sandbox). Signing + prod send excluded per scope. |

### E. Acceptance & audit storage
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| E1 | Accept / reject detection | ✅ | `accepted` flag from document status; `status` written to audit row. |
| E2 | Audit Repository persistence | ✅ | `myinvois_submissions` + `invoices` store submissionUid, responseBody, timestamp, Cust TIN. `markInvoiceSubmitted` persists the human-readable `longId`→`myinvois_doc_id`, doc `uuid`→`validation_uuid`, and the QR link→`qr_url` (fixed in `6a9534a`). |
| E3 | QR verification link | ✅ | `buildValidationLink(uuid, longId)` constructs `{envbaseurl}/{uuid}/share/{longId}` and persists it to `invoices.qr_url` on acceptance (`6a9534a`). |

### F. Rejection / retry loop
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| F1 | Reject handling | ✅ | `status='rejected'` + `error` in audit row; rejection error parsed from `rejectedDocuments`. |
| F2 | Fix & resubmit | ✅ | `submit.tsx` rejects show a “Fix & resubmit” button routing to `/review?id=…` (the flow-1 loop) plus “Back to home”; `PATCH /invoices/:id` + re-`POST /myinvois/submit` re-runs. |

### G. Customer retrieval (the right-hand loop in flow 1)
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| G1 | Request by Document ID | ✅ | `GET /public/invoices/:ref` public lookup by Document ID (longId) or UUID (`6a9534a`). |
| G2 | Request by QR verify code | ✅ | `POST /public/invoices/qr` decodes a scanned QR payload (full validation link or raw uuid/longId) → resolves to the public invoice (`6a9534a`). |
| G3 | Retrieval reads Audit Repository | ✅ | `findPublicInvoice(ref)` reads the submitted `invoices` row (audit repository) by `myinvois_doc_id` or `validation_uuid` (`6a9534a`). |
| G4 | Retrieved data → OUTPUT display | ✅ | `GET /public/invoices/:ref` returns a `PublicInvoiceView` (supplier name/TIN/SSM, items, total, Document ID, Validation UUID, QR) — raw `extractedData` NOT exposed. Verified 9/9 e2e (`verify-public-retrieval.ts`). |

---

## Flow 2 — "Purchase suggest flow" (PURCHASE / EXPENSES side)

You receive a supplier invoice → photograph → AI extracts → store → financial account.

| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| P1 | Take picture & upload in APP | ✅ | `capture.tsx` (camera + image picker). |
| P2 | Add input — Payment Details (1. method, 2. account detail) | ✅ | `payment_method` (means code 01-08) + `payment_account` (supplier bank account) both captured on the Review screen, persisted, and emitted as UBL `PaymentMeans` + `PayeeFinancialAccount` (`6a9534a`). |
| P3 | Image processing, retrieve info (AI model 1) | ✅ | Stage A — pure-OCR vision model (`VISION_TRANSCRIBE_PROMPT`). |
| P4 | Process info into data JSON/XML (AI model 2) | ✅ | Stage B — text structuring (`STRUCTURING_SYSTEM_PROMPT`). |
| P5 | APP store data output | ✅ | `createDraftFromExtraction` → `invoices` row (`kind: 'purchase'`). |
| P6 | → Financial Account | ❌ | No accounting/ERP integration. (Likely out of scope, but the diagram draws the arrow.) |
| P7 | OUTPUT JSON — seller Document ID / UUID / QR verification | ✅ | `extractedData.qr_verification` is now populated end-to-end. **Primary source:** `lib/qrDecode.ts` — a pure-JS QR-image decoder (jsQR + pngjs + jpeg-js, no native modules) wired into `extractInvoice` step 3, decodes the captured photo's QR matrix to the LHDN validation link and overrides `qr_verification` (commit `b7483b0`, 6/6 unit tests in `verify-qr-decode.ts`). **Fallback:** Stage B's text rule captures a printed verification reference near the "Scan to Verify" QR when no scannable graphic is in frame (commit `c693dba`). Surfaced + editable on the Review screen. |
| P8 | OUTPUT JSON — items include Payment method + Bank detail | ✅ | `payment_method` (PaymentMeansCode) + `payment_account` (PayeeFinancialAccount) both in the review form + UBL builder (`6a9534a`). |

---

## Flow 3 — "INPUT / OUTPUT" (e-Invoice format + rendered output)

| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| F3-1 | e-Invoice in IRBM format: XML or JSON | ✅ | JSON variant (`buildUblJson`). |
| F3-2 | 4 document types: Invoice, Credit note, Debit note, Refund note | ✅ | e-Invoice type is configurable (01-04, 11-14) via the Review screen CodePicker; `buildUblJson` emits `InvoiceTypeCode` from `input.invoiceType`; `isValidEinsteinType` validates (`6a9534a`). |
| F3-3 | JSON structure (invoiceNumber, issueDate, supplier, buyer, items, totalAmount) | ✅ | `buildUblJson` covers these and more (per canonical sample). |
| F3-4 | OUTPUT rendered invoice — header (company, TIN, **SSM/BRN**) | ✅ | Supplier name + TIN + BRN (SSM) all stored (`profiles.brn`, `6a9534a`) and emitted in UBL `PartyIdentification` + `PartyLegalEntity/RegistrationName`. |
| F3-5 | OUTPUT — **MyInvois Document ID** (longId) | ✅ | Fetched via Get Submission API (06) on acceptance and persisted to `invoices.myinvois_doc_id` (`6a9534a`); shown on the home list + submit screen. |
| F3-6 | OUTPUT — **Validation UUID** | ✅ | Persisted to `invoices.validation_uuid` on acceptance (`6a9534a`). |
| F3-7 | OUTPUT — **QR code "Scan to Verify"** | ✅ | `qr_url` stored on acceptance + rendered as a QR on the submit result screen (`QRCode.tsx`) and the home list card (`6a9534a`, `663d28d`). |
| F3-8 | OUTPUT — bank details | ✅ | `invoices.payment_account` captured on the Review screen + emitted as UBL `PayeeFinancialAccount/ID` (`6a9534a`). |
| F3-9 | OUTPUT — PDF / hard copy render | ✅ | `lib/receipt.ts` renders a self-contained HTML receipt (QR as server-side PNG data URL, Document ID, validation UUID, supplier/buyer, items, totals) served at `GET /invoices/:id/receipt` (auth) + `GET /public/invoices/:ref/receipt` (public); `mobile/src/app/receipt.tsx` renders it in a WebView with a “View receipt / PDF” button on the submit screen. Browser print-to-PDF satisfies the PDF requirement (`6a9534a`). |

---

## Summary: what's DONE (besides signing + prod send)

The **core submission pipeline** is real and end-to-end on sandbox:
- Two-stage extraction (vision OCR → text structuring) ✅
- Draft creation + persistence ✅
- UBL JSON payload builder (Invoice type) ✅
- MyInvois client: token, submit, document details, TIN validation ✅
- Two credential flows (intermediary + taxpayer) ✅
- Submit → accept/reject → audit row ✅
- Submission history (audit trail) ✅
- Mobile: capture → review → submit → result/history ✅

## What's MISSING (the real gaps, excluding signing + prod send)

> **Superseded — see "Update log (post-audit)" below + the flow status tables
> above.** The original Tier 1–3 gap list below was written at audit time; every
> Tier 1–3 item (1–9) has since been implemented and verified (persist
> longId/uuid/qr_url, Fix & resubmit, profiles.brn, QR display, PDF/receipt
> render, payment account, document types, customer retrieval/public route,
> line-item codes, QR-image decode). Do NOT re-do them — check the flow tables
> + the Update log for the current status before starting. Only the Tier 4
> items below remain genuinely open (and they are product/out-of-scope, not
> implementation gaps).

Grouped by how much they cost to close:

### Tier 1 — ~~small, mostly-persist-the-data-we-already-have~~ ✅ DONE
1. **Persist `longId` as the Document ID** — ✅ `markInvoiceSubmitted` stores `longId`→`myinvois_doc_id`, `uuid`→`validation_uuid` (`6a9534a`).
2. **Populate `qr_url`** — ✅ `buildValidationLink` persists `{base}/{uuid}/share/{longId}` on acceptance (`6a9534a`).
3. **Submit screen: "Fix & resubmit"** — ✅ `submit.tsx` routes rejects → `/review` (`ccaead6` era).
4. **`profiles.brn` column** — ✅ schema + UBL `PartyIdentification` BRN (`6a9534a`).

### Tier 2 — ~~feature work, clearly in the diagrams~~ ✅ DONE
5. **QR code display** — ✅ submit result + home list card (`6a9534a`, `663d28d`).
6. **PDF / hard-copy render** — ✅ `receipt.ts` HTML + `receipt.tsx` WebView + "View receipt / PDF" (`6a9534a`).
7. **Payment account/bank detail** — ✅ `payment_account` + UBL `PayeeFinancialAccount` (`6a9534a`).
8. **Document types** — ✅ configurable 01-04/11-14 via Review CodePicker + `isValidEinvoiceType` (`6a9534a`).

### Tier 3 — ~~customer-side (the flow-1 right-hand loop)~~ ✅ DONE
9. **Customer retrieval** — ✅ `GET /public/invoices/:ref` + `POST /public/invoices/qr` + `findPublicInvoice` + `PublicInvoiceView` (`6a9534a`, 9/9 e2e).

### Tier 4 — arguably out of scope, but drawn (STILL OPEN)
10. **B2C public-TIN mode** — flow 1 draws "Public TIN (B2C)" as a distinct input. No code distinguishes a consumer (EI/IG general TIN) from a company. May be a UI/UX distinction only; **needs a product decision**.
11. **Financial Account integration** — flow 2 draws an arrow to "Financial Account". No accounting/ERP integration exists. **Out of scope.**

---

## ~~Recommended order to close the gaps~~ (Superseded)

All Tier 1–3 items above are closed (see the Update log). The only remaining
work is the Tier 4 product decisions (B2C public TIN, ERP integration) and the
**cert-gated** items documented in "Blocked — invoice-level AllowanceCharge /
monetary fields" + signing below.

## Update log (post-audit)

- **Line-item codes wired end-to-end** (`50b6559`): the submit service now
  sources UBL line items (incl. `tax_type_code`/`unit_code`/`classification`/
  `origin_country`) from `invoices.extracted_data.items` (the blob the review
  screen edits), falling back to `invoice_items` table rows for manually-
  created invoices. This also fixed a latent bug where captured invoices
  (stored only in the blob) submitted with **zero** `InvoiceLine[]`. `buildLine`
  honors `it.originCountry` (was hardcoded `MYS`). 12/12 UBL structure tests.
- **Home list Document ID + QR** (`663d28d`): dashboard cards show the LHDN
  Document ID chip + a 40px validation QR for submitted invoices.
- **QR verification capture** (`c693dba`): Stage B now captures the printed
  verification reference near the e-invoice QR into `qr_verification`; the
  field is surfaced + editable on the Review screen (was hard-null on save).
- **QR-image decoder** (`b7483b0`): `lib/qrDecode.ts` — a pure-JS QR decoder
  (jsQR + pngjs + jpeg-js, no native modules) wired into `extractInvoice` as the
  PRIMARY source for `qr_verification`, decoding the captured photo's QR to the
  LHDN validation link. Stage B's text rule (above) is the fallback when no
  scannable graphic is in frame. 6/6 unit tests (`qr:verify`).
- **Type-safe blob item parsing** (`0e6d224`, `975ebb9`): the submit service
  validates each blob line item via `PersistedItemSchema.safeParse` with
  `z.coerce.number().catch(0)` — a field-name drift or stringified numeric
  degrades ONE field instead of dropping the whole line (and its codes).
- **Per-line discount preserved** (`bde0d09`): Stage B captures a per-line
  discount, but the mobile round-trip had no `discount` field and silently
  stripped it. Added to DTO + `EditItem` + `toForm`/`fromForm` (read-only for
  now; editing is part of the blocked per-line AllowanceCharge work).
- **`buildSubmitItems` pure + unit-tested** (`4c57b52`): extracted the blob→
  UblLineItem mapping into a pure helper with 17 no-DB unit tests
  (`items:verify`) guarding the exact code that previously dropped the line-
  item codes — the builder-level `ubl:verify` could not catch that regression.
- **Extract-path regression test** (`416e423`): `verify-mock-submit` now
  exercises the REAL capture path (`createDraftFromExtraction` → blob items,
  zero `invoice_items` rows) in addition to the manual path, so a blob-sourcing
  regression can't hide behind a green manual-path test.
- **UBL aggregate consistency** (`db5d20d`, `261f2d5`): the builder always
  derives the monetary aggregates from line items (ignoring stored overrides)
  using round-each-line-then-sum, so `LineExtensionAmount`/`TaxTotal.TaxAmount`
  always equal `Σ` of the per-line/per-type values MyInvois validates against.
- **Home audit chip gated on validation** (`ccaead6`): the home card's Document-
  ID chip + QR gate on `myinvoisDocId != null` (proof of LHDN acceptance), not
  `status` (a rejected submit keeps status but null docId).

### Blocked — invoice-level AllowanceCharge / monetary fields

Wiring `AllowanceTotalAmount` / `ChargeTotalAmount` / `PayableRoundingAmount` /
`PrepaidPayment` + invoice-level `AllowanceCharge[]` into `buildUblJson` is
**NOT shipped live**. Rationale: it is (a) **cert-gated** — the sandbox requires
a POS Digicert/LHDNM signing cert and no real round-trip has confirmed which
balance equation MyInvois enforces, and (b) **formula-disambiguated by nothing
in the repo** — the KB says `Payable = TaxInclusive + rounding − prepaid` with
`TaxExclusiveAmount = Σ line net`, while EN 16931 (UBL 2.1's basis) folds
invoice-level allowance/charge into `TaxExclusiveAmount = ΣLineExtension −
AllowanceTotal + ChargeTotal`. These diverge when allowance/charge ≠ 0, and
**no sample disambiguates** — every sample with nonzero allowance/charge/rounding
reuses the placeholder `1436.50` for all (mathematically impossible), and the
only real-valued samples (Consolidated, MultiLineItem) have all three = 0.

The current builder emits only the 4 mandatory `LegalMonetaryTotal` fields
(LineExtension/TaxExclusive/TaxInclusive/Payable) — which the canonical 1.1
Consolidated sample confirms is correct for a simple invoice (it OMITS the
optional fields when there are no invoice-level allowances/charges). So the
working zero-allowance path stays the default.

**When the cert round-trip is available**, implement as first-class
`BuildUblInput` fields (allowance/charge/prepaid/rounding) + an invoice-level
`AllowanceCharge[]`, emit conditionally (omit when absent/zero), and ALWAYS
*derive* `TaxExclusiveAmount`/`PayableAmount` in the builder (never accept a
stored value that could contradict the derivation — `subtotal` must always mean
raw Σ line-extension, `total` must mean TaxInclusive pre-prepaid/rounding). The
retired `buildUbl` XML in `myinvois.ts` has no live caller and can stay as-is.
Treat the equation as unvalidated and gate behind a flag until the real submit
confirms. Per-line `AllowanceCharge` is a larger change still (it alters each
line's `LineExtensionAmount` math) — defer until invoice-level is validated.

### Open validation risk — BR-CO-18 document-tax vs Σ-line-tax (UNVERIFIED)

The document-level `TaxSubtotal.TaxAmount` now uses EN 16931 BR-CO-18
(`round2(aggregated Σ net × rate/100)`), NOT `Σ per-line round2(net × rate/100)`.
These diverge when a per-line tax rounds to 0 but the aggregate doesn't (e.g.
3×RM0.08@6% → per-line 0.00 each, doc `round2(0.24×0.06)=0.01`). All three
calc paths (mobile `calc.ts`, backend `domain/totals.ts`, `lib/ublJson.ts`) use
the BR-CO-18 formula and agree exactly (`verify-lockstep`, 5/5 incl a 1000-line
stress). The test suite ASSERTS this divergence is correct (EN-16931-compliant).

**This has NOT been validated against the live LHDN validator** — only against
EN 16931 logic. The mock-submit can't exercise balance equations, and the
repo's type pages don't state whether LHDN cross-checks document-tax vs
Σ-line-tax. If LHDN *does* enforce `TaxTotal.TaxAmount == Σ InvoiceLine tax`,
the fix is one line (use `Σ ltax` for the document subtotal instead of
`round2(aggregate×rate)`). Resolving this empirically needs the cert round-trip
(the same gate as signing). Recommend submitting a fractional-cent invoice
(3×0.08@6% or similar) to the real sandbox to confirm acceptance BEFORE building
allowances/charges (#1) on top — which multiplies rounding-divergence
opportunities.