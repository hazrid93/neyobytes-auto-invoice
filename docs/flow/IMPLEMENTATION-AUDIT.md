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
| B1 | Generate data (JSON/XML) | ⚠️ | `lib/ublJson.ts` builds the JSON UBL variant (XML retired from submit path). **Only `InvoiceTypeCode: '01'` (Invoice)** — credit/debit/refund notes are NOT supported (hardcoded). |
| B2 | Generate instant invoice | ✅ | `createDraftInvoice` / `createDraftFromExtraction` → `invoices` row (status `draft`). |

### C. Output / display
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| C1 | APP display invoice — PDF / hard copy / list with doc ID + QR | ⚠️ | Invoice list (`home.tsx`) now shows the LHDN Document ID chip + a small validation QR for submitted invoices (commit `663d28d`). **PDF / hard-copy render still missing** (no PDF generation). |

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
| F2 | Fix & resubmit | ⚠️ | `PATCH /invoices/:id` edits any invoice; `POST /myinvois/submit/:invoiceId` re-runs with no status gate. **But no guided flow**: on reject, `submit.tsx` offers "Back to home" / "Edit profile" (TIN-missing only) — not "edit the rejected invoice & resubmit". |

### G. Customer retrieval (the right-hand loop in flow 1)
| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| G1 | Request by Document ID | ❌ | No customer-facing lookup endpoint/screen. |
| G2 | Request by QR verify code | ❌ | No QR-scan/verify screen. |
| G3 | Retrieval reads Audit Repository | ❌ | No retrieval endpoint. (`GET /myinvois/document/:uuid` is supplier-side status, not customer retrieval.) |
| G4 | Retrieved data → OUTPUT display | ❌ | No display path. |

---

## Flow 2 — "Purchase suggest flow" (PURCHASE / EXPENSES side)

You receive a supplier invoice → photograph → AI extracts → store → financial account.

| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| P1 | Take picture & upload in APP | ✅ | `capture.tsx` (camera + image picker). |
| P2 | Add input — Payment Details (1. method, 2. account detail) | ⚠️ | Only `payment_method` is captured (review screen). **No account/bank-detail field.** |
| P3 | Image processing, retrieve info (AI model 1) | ✅ | Stage A — pure-OCR vision model (`VISION_TRANSCRIBE_PROMPT`). |
| P4 | Process info into data JSON/XML (AI model 2) | ✅ | Stage B — text structuring (`STRUCTURING_SYSTEM_PROMPT`). |
| P5 | APP store data output | ✅ | `createDraftFromExtraction` → `invoices` row (`kind: 'purchase'`). |
| P6 | → Financial Account | ❌ | No accounting/ERP integration. (Likely out of scope, but the diagram draws the arrow.) |
| P7 | OUTPUT JSON — seller Document ID / UUID / QR verification | ⚠️ | `extractedData.qr_verification` is now populated by Stage B (explicit extraction guidance for the printed verification reference near the "Scan to Verify" QR) and surfaced + editable on the Review screen (commit `c693dba`). A true QR-**image** decode (camera → QR reader → link) is a separate native-module step, not the LLM pipeline. |
| P8 | OUTPUT JSON — items include Payment method + Bank detail | ⚠️ | `payment_method` ✅; bank/account detail ❌ (no field). |

---

## Flow 3 — "INPUT / OUTPUT" (e-Invoice format + rendered output)

| # | Flow step | Status | Where / note |
|---|-----------|--------|--------------|
| F3-1 | e-Invoice in IRBM format: XML or JSON | ✅ | JSON variant (`buildUblJson`). |
| F3-2 | 4 document types: Invoice, Credit note, Debit note, Refund note | ❌ | Only Invoice (`InvoiceTypeCode '01'` hardcoded in `ublJson.ts`). |
| F3-3 | JSON structure (invoiceNumber, issueDate, supplier, buyer, items, totalAmount) | ✅ | `buildUblJson` covers these and more (per canonical sample). |
| F3-4 | OUTPUT rendered invoice — header (company, TIN, **SSM/BRN**) | ⚠️ | Supplier name + TIN ✅. **SSM/BRN not stored** — `profiles` has no `brn` column; UBL emits `'NA'` (documented follow-up). |
| F3-5 | OUTPUT — **MyInvois Document ID** (longId) | ✅ | Fetched via Get Submission API (06) on acceptance and persisted to `invoices.myinvois_doc_id` (`6a9534a`); shown on the home list + submit screen. |
| F3-6 | OUTPUT — **Validation UUID** | ✅ | Persisted to `invoices.validation_uuid` on acceptance (`6a9534a`). |
| F3-7 | OUTPUT — **QR code "Scan to Verify"** | ✅ | `qr_url` stored on acceptance + rendered as a QR on the submit result screen (`QRCode.tsx`) and the home list card (`6a9534a`, `663d28d`). |
| F3-8 | OUTPUT — bank details | ❌ | No account/bank field captured. |
| F3-9 | OUTPUT — PDF / hard copy render | ❌ | No PDF generation. |

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

Grouped by how much they cost to close:

### Tier 1 — small, mostly-persist-the-data-we-already-have
1. **Persist `longId` as the Document ID** — it's in the LHDN response, just discarded. Fix `markInvoiceSubmitted` to take `longId` too and store it in `myinvois_doc_id`; store the doc `uuid` in `validation_uuid`.
2. **Populate `qr_url`** — construct the LHDN validation QR URL from the uuid/longId (format to confirm from SDK) and store it on acceptance.
3. **Submit screen: "Fix & resubmit"** — on reject, route back to `/review?id=…` instead of just "Back to home".
4. **`profiles.brn` column + profile/settings field** — already a documented follow-up; needed for SSM in the rendered invoice and the UBL `PartyIdentification` BRN.

### Tier 2 — feature work, clearly in the diagrams
5. **QR code display** — render the stored `qr_url` as a scannable QR on the submit result + invoice list (flow 1 OUTPUT, flow 3).
6. **PDF / hard-copy render** — generate a PDF of the invoice showing company/TIN/SSM, items, total, Document ID, Validation UUID, QR (flow 1 OUTPUT, flow 3).
7. **Payment account/bank detail** — add a `bank_account`/`payment_account` field to capture (review screen + schema + UBL `PaymentMeans`/`PayeeFinancialAccount`).
8. **Document types** — support Credit Note / Debit Note / Refund Note (`InvoiceTypeCode` 02/03/04) via an `invoiceType` selector; `buildUblJson` is currently hardcoded to `'01'`.

### Tier 3 — customer-side (the flow-1 right-hand loop), biggest gap
9. **Customer retrieval** — a public/unauthenticated endpoint to look up an invoice by **Document ID** or **QR code** that reads the audit repository and renders the invoice (PDF / doc-ID / QR). No screen, no endpoint, no public route today.

### Tier 4 — arguably out of scope, but drawn
10. **B2C public-TIN mode** — flow 1 draws "Public TIN (B2C)" as a distinct input. No code distinguishes a consumer (EI/IG general TIN) from a company. May be a UI/UX distinction only; needs a product decision.
11. **Financial Account integration** — flow 2 draws an arrow to "Financial Account". No accounting/ERP integration exists.

---

## Recommended order to close the gaps

If you want the diagrams "implemented" (minus signing + prod send) in the
fewest changes:

1. Tier 1 #1–#3 (persist longId/uuid/qr_url + resubmit routing) — 1 short session.
2. Tier 2 #5–#6 (QR display + PDF render) — makes flow 1 OUTPUT + flow 3 real.
3. Tier 2 #7–#8 (bank detail + doc types) — completes the data model.
4. Tier 3 #9 (customer retrieval) — the biggest single missing piece; a new
   public route + screen.
5. Tier 1 #4 (`profiles.brn`) — already documented; do alongside #7.
6. Tier 4 — product decisions, defer.

---

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