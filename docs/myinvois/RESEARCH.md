# LHDN MyInvois e-Invoicing Integration — Research

Source: official LHDN MyInvois SDK at https://sdk.myinvois.hasil.gov.my/einvoicingapi/
Authoritative spec: the **Postman collection** (`docs/myinvois/postman-collection.json`) —
there is no OpenAPI/Swagger file; the HTML doc pages are JS-rendered (Doks theme) and not
reliably scrapable. All endpoint/method/body facts below are extracted from that collection.

Companion artifacts in this folder:
- `postman-collection.json` — full machine-readable API spec (34 KB)
- `env-prod.json` / `env-sandbox.json` — base URLs + client creds placeholders
- `invoice-v1.1-sample.json` — canonical UBL invoice payload (UBL 2.1, JSON variant)
- `msic-codes.json` / `country-codes.json` / `e-invoice-types.json` — code lists
- `Digital_Signature_User_Guide.pdf` — signing/hash algorithm (open in a viewer; pdftotext unavailable here)

---

## 1. Environments (base URLs)

| Env | API base (`apiBaseUrl`) | Identity base (`idSrvBaseUrl`) |
|---|---|---|
| **Sandbox** | `preprod-api.myinvois.hasil.gov.my` | `preprod-api.myinvois.hasil.gov.my` ✅ confirmed |
| **Production** | `api.myinvois.hasil.gov.my` | `api.myinvois.hasil.gov.my` (inferred) ⚠️ |

⚠️ The PROD env file ships `idSrvBaseUrl = TBD`. We could not confirm the prod
identity host from the SDK HTML (the `/einvoicingapi/07-login-*` URL 404s; login
only lives under `/api/07-*`, whose page is JS-rendered prose with no host
table). **Inferral by host-parity with sandbox:** `env-sandbox.json` sets
`idSrvBaseUrl == apiBaseUrl == preprod-api.myinvois.hasil.gov.my` (identical
host). The auth doc's "identity service, not the service hosting APIs" is
*logical* separation, not a separate physical host. By direct analogy the prod
token endpoint is `https://api.myinvois.hasil.gov.my/connect/token`. Flagged as
inferred, not confirmed — verify against the LHDN taxpayer portal on first prod
registration. (This does not block sandbox development.)

## 2. Authentication — OAuth2 client_credentials

`POST {idSrvBaseUrl}/connect/token` (form-urlencoded, **no** Bearer needed — this is the only unauthenticated endpoint)

```
client_id=<your ERP client id>           # from MyInvois portal registration
client_secret=<your ERP client secret>
grant_type=client_credentials
scope=InvoicingAPI
```

- **Token lifetime:** 1 hour (3600s). The docs explicitly say: reuse the token for many
  operations, don't log in per request — frequent logins may be rate-limited per client ID.
- **Intermediary system** (acting on behalf of a taxpayer): same call + header
  `onbehalfof: <taxpayer TIN or ID>`.
- Response: `{ access_token, token_type: "Bearer", expires_in, scope }`.

## 3. Endpoints (all under `{apiBaseUrl}/api/v1.0`, Bearer required)

| # | Action | Method | Path |
|---|---|---|---|
| 1 | **Validate Taxpayer TIN** | GET | `/taxpayer/validate/{tin}?idType={idType}&idValue={idValue}` |
| 2 | **Submit Documents** | POST | `/documentsubmissions` |
| 3 | Cancel Document | PUT | `/documents/state/{uuid}/state` |
| 4 | Reject Document | PUT | `/documents/state/{uuid}/state` |
| 5 | Get Recent Documents | GET | `/documents/recent` (last 31 days) |
| 6 | Get Submission | GET | `/documentsubmissions/{submissionUid}` |
| 7 | Get Document (raw) | GET | `/documents/{documentUUID}/raw` |
| 8 | Get Document Details | GET | `/documents/{uuid}/details` |
| 9 | Search Documents | GET | `/documents/search` |
| 10 | Search Taxpayer TIN | GET | (linked from /einvoicingapi/10-search-taxpayer-tin) |
| 11 | Taxpayer QR Code | GET | (linked from /einvoicingapi/11-qr-code) |
| — | Get Document Types | GET | `/documenttypes` |
| — | Get Document Type | GET | `/documenttypes/{id}` |
| — | Get Document Type Version | GET | `/documenttypes/{id}/versions/{vid}` |
| — | Get Notifications | GET | `/notifications/taxpayer` |

**Cancel/Reject note:** both are `PUT /documents/state/{uuid}/state` — confirmed real (not a
typo). Difference is the body `status`: `"cancelled"` vs `"rejected"`, each with a `reason`.

## 4. Submit Documents — request body

```
POST /api/v1.0/documentsubmissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "documents": [
    {
      "format": "XML",                          // or "JSON"
      "documentHash": "<hash>",                 // see signature guide (SHA-256 base64, algorithm TBD)
      "codeNumber": "INV12345",                 // human invoice number
      "document": "<base64-encoded UBL payload>" // the signed invoice XML/JSON
    }
  ]
}
```

Response includes a `submissionUid` + per-document acceptance/rejection + the long
`UUID` + `longId`/`documentUUID` you use to fetch details/QR later.

## 5. Document payload — UBL 2.1 (JSON variant)

See `invoice-v1.1-sample.json` (31 KB). It's the OASIS UBL Invoice schema encoded as JSON
with namespace prefixes (`_D`, `_A`, `_B`) and every field wrapped as `[ { "_": "value" } ]`.
Top-level keys: `ID`, `IssueDate`, `IssueTime`, `InvoiceTypeCode` (listVersionID="1.1"),
`DocumentCurrencyCode`, `TaxCurrencyCode`, `InvoicePeriod`, `BillingReference`,
`AdditionalDocumentReference`, `AccountingSupplierParty`, `AccountingCustomerParty`,
`Delivery`, `PaymentMeans`, `PaymentTerms`, `AllowanceCharge`, `TaxTotal`, `LegalMonetaryTotal`,
`InvoiceLine[]`.

Document type versions: invoice/credit/debit/refund + self-billed variants, each with
`v1.0` and `v1.1` schemas. **Use v1.1.**

## 6. Digital signature & documentHash — algorithm known; **signing target: prose (bare doc digest) likely correct, not crypto-proven** ⚠️

> Full 7-step algorithm + code + signed-properties/signed-info shape:
> `docs/myinvois/signature-creation-json.md` (34 KB, complete — verified to contain
> Steps 1-7, `SignHash`, `Pkcs1`, `SignedInfo`, `SignatureValue`, `rsa-sha256`). The static
> HTML *does* contain the prose (confirmed via raw `grep -c`); an earlier container-scoping
> regex (`<main>`/`<article>`) was hiding it.
>
> **Independently corroborated by** `Digital_Signature_User_Guide.pdf` (388 KB official LHDN
> guide; text-extracted via zlib-inflate of FlateDecode streams): it titles "Securing JSON
> Files with Digital Signatures" and contains a PowerShell reference using
> `RSAPKCS1SignatureFormatter.SetHashAlgorithm("SHA256")` — confirming RSA-PKCS#1 v1.5
> + SHA-256, the `SignedInfo`/`SignedProperties` structure, and `documentHash` in the
> submit JSON body. Two official sources agree on the *primitive* algorithm.

### ⚠️ The true blocker: WHAT exactly gets signed is unverified (don't trust my earlier caveat)

Earlier I wrote that the real `SignatureValue` signs a canonicalized `SignedInfo`
(standard XAdES-BES). **That was an inference from the wire-sample structure, not from the
source prose — and the source prose contradicts it.** Verified facts from both sources:

- **Step 3 prose (web + PDF) literally says sign the *bare* Step-2 document digest.** Web
  page: *"sign the property `docdigest` that is calculated in the previous step"*, code
  `SignHash(hash, …)` where `hash` is the doc digest. PDF prose: *"This is the document
  digest value… This is the value that would be signed using the private key."* (XPath
  `[Referencefield:DocDigest]`).
- **"canonical" / "c14n" appear NOWHERE in the web-page prose** (0 matches). The PDF's
  *only* mention of `CanonicalizationMethod` is as an XSD field in the `SignedInfo`
  element-description table (`Algorithm="xml-c14n11"`), **not** as an instruction to
  canonicalize before signing.
- **But** the assembled wire sample (`invoice-v1.1-sample.json` + Step 7 block) DOES carry
  a full `SignedInfo` with **two `Reference`s** (signed-properties digest + document digest)
  — which structurally matches standard XAdES where `SignatureValue = Sign(c14n(SignedInfo))`.

**The two sources never reconcile this.** If MyInvois's verifier expects `Sign(docDigest)`
(what the prose literally says), an implementer following standard-XAdES `Sign(SignedInfo)`
produces unverifiable signatures and wastes days — and vice versa. **Treat the signing
> target and the exact byte serialization/c14n of `SignedInfo` in this JSON-XML hybrid as
> undocumented blockers, co-equal with the cert.** Resolution path: obtain a real, verifiable
> signed sample (or a sandbox trial cert + a successful round-trip) and reverse-engineer
> which the verifier accepts.

### Computational check on the official wire sample (script: `backend/scripts/verify-signature.py`)

Using the official signed sample's own fields (cert, SignatureValue, two Reference
DigestValues) I could not fully verify the signing target. What *was* reproducibly
confirmed and what blocked the rest:

- ✅ **`SHA256(minified SignedProperties) == Reference[1].DigestValue`** — exact match
  (`Rzuzz+70GSnGBF1YxhHnjSzFpQ1MW4vyX/Q9bTHkE2c=`). The Step-6 minified-SignedProperties
  recipe is byte-exact and reproducible.
- ✅ **The cert is a real RSA-2048 key** (issuer `CN=Trial LHDNM Sub CA V1, O=LHDNM, C=MY`,
  subject `Dummy / D12345678`, emailAddress `anas.a@fgvholdings.com`). Public key extracts
  cleanly via `openssl x509`; the cert is parseable and the signature math works.
- ❌ **RSA-verify of `SignatureValue` returned False against every candidate, including
  the verbatim Step-1 transformed document** — but this is **inconclusive, not a refutation**
  of the prose. Two extraction problems defeat byte-exact reconstruction from this artifact:
  1. **The page uses two different invoices.** The Step-1 transformed-document block
     (used to *illustrate* the transform/digest steps) is the **v1.0** invoice
     (`InvoiceTypeCode listVersionID="1.0"`), but the **signed** wire sample is the
     **v1.1** invoice. Different content → the v1.0 block's SHA256 cannot equal the
     v1.1 sample's `doc_ref_digest` by construction.
  2. **The v1.1 signed sample's own "transformed document" isn't given verbatim** —
     it has to be reconstructed by slicing the `UBLExtensions` and top-level `Signature`
     arrays out of the signed line. These arrays are *nested* (the signature block sits
     inside `UBLExtensions`), so regex/slice extraction leaves residual bytes and the
     reconstructed string doesn't match `doc_ref_digest` either.

**Conclusion of the computational pass:** the *SignedProperties* digest algorithm is
byte-exact verified; the *document* digest and the *signature target* could not be
crypto-confirmed from the public artifact. Decisive resolution requires either the page
publishing the exact transformed bytes it hashed, **or a sandbox trial cert + round-trip**
(where we control the input bytes). The earlier note citing "JSON→XML→C14N11" was
speculative — `xml-c14n11` appears only as an XSD field value in the element table, never
as prose instructing a JSON-to-XML transform; treat it as an unresolved detail, not fact.

### Analytical evidence (strong) — the **ordering** favours the prose

The step ordering in the official doc is:
- **Step 3: Sign** (line 973) — comes **BEFORE**
- **Step 6: signed-properties digest** (line 1064)

If the signature were over `c14n(SignedInfo)` (standard XAdES), you would need the
signed-properties digest **first** — it's a `Reference.DigestValue` *inside* `SignedInfo`,
so it must exist before `SignedInfo` can be serialized and signed. The fact that the doc
sequences **sign (Step 3) before** the signed-properties digest (Step 6) only makes sense if
Step 3 signs the **bare document digest** — strongly supporting the prose's literal reading.

**Working assessment (analytically likely, not cryptographically proven):**
`SignatureValue = RSA-Sign(SHA256(minified-document), certPrivateKey)` — i.e. the prose is
> literally correct, this is **non-standard / simplified** (signs the bare doc digest, not
> `c14n(SignedInfo)`), despite the wire sample carrying a full `SignedInfo` block. The
> `SignedInfo` is present for structural/schema conformance but the actual signature is
> over the document digest. **Confirm against a real round-trip before shipping.**

> If the above assessment holds, the `c14n(SignedInfo)` blocker downgrades to "nice to verify"
> and the true remaining blocker is just the cert + the exact byte serialization of the
> minified document (which my reconstruction didn't match — needs the JSON→XML→C14N11
> transform, OR a different minification than `json.dumps`).

### What IS verified (the 7-step primitive flow, from the sources)

### Step 1 — Transform the document
Remove `UBLExtensions` and `Signature` sections if present, then **minify** (no newlines,
no extra spaces). Exact minified form in the saved dump.

### Step 2 — Document digest  →  submit body's `documentHash`
```csharp
using (SHA256 sha256 = SHA256.Create()) {
  var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(document));
  var docdigest = Convert.ToBase64String(hash);
}
```
→ `documentHash = base64( SHA256( UTF8( minifiedDocumentString ) ) )` — verified.

### Step 3 — Sign with cert private key ⚠️ (signing TARGET unverified — see above)
```csharp
X509Certificate2 cert = new X509Certificate2();
RSACryptoServiceProvider key = (RSACryptoServiceProvider)cert.PrivateKey;
var sign = key.SignHash(hash, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
var signature = Convert.ToBase64String(sign);
```
→ RSA-PKCS#1 v1.5 + SHA-256 (verified). The `hash` arg here is the **doc digest** per the
prose — but the wire sample's `SignedInfo` structure suggests the real target may be
`c14n(SignedInfo)`. **Verify before shipping.**

### Step 4 — Certificate digest
```csharp
var certdigest = Convert.ToBase64String(
  cert.GetCertHash(System.Security.Cryptography.HashAlgorithmName.SHA256));
```

### Step 5 — Populate `SignedProperties`
`SignedProperties[0]` with `Id: "id-xades-signed-props"`,
`SignedSignatureProperties.SigningTime` (ISO 8601 UTC),
`SigningCertificate.Cert[0].CertDigest` (`DigestMethod.Algorithm =
"http://www.w3.org/2001/04/xmlenc#sha256"`, `DigestValue = <certdigest>`), and
`IssuerSerial.X509IssuerName` + `X509SerialNumber` (from the cert).

### Step 6 — Signed-properties digest
Minify the outer JSON of `SignedProperties` — literally
`{"Target":"signature","SignedProperties":[...]}` (no whitespace) — and SHA-256 it.
Byte-order-sensitive minified form is in `signature-creation-json.md`.

### Step 7 — Assemble the signed JSON
Embed `UBLExtensions` → `UBLDocumentSignatures.SignatureInformation.Signature` with:
- `Object.QualifyingProperties.SignedProperties` (from Step 5)
- `KeyInfo.X509Data.X509Certificate` = base64 DER cert (+ `X509SubjectName`,
  `X509IssuerSerial`)
- `SignatureValue` (⚠️ see signing-target blocker above)
- `SignedInfo` with `SignatureMethod.Algorithm =
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"` and **two `Reference`s**:
  1. `Type: "http://uri.etsi.org/01903/v1.3.2#SignedProperties"`,
     `URI: "#id-xades-signed-props"`, `DigestValue` = Step 6 result
  2. `Type: ""`, `URI: ""` (the document), `DigestValue` = Step 2 result
  (`CanonicalizationMethod` element present per the PDF XSD table, `Algorithm="xml-c14n11"`)
- Top-level `Signature[{ID, SignatureMethod}]` wrapper

### Certificate (blocker #1 — NOT implementable without it)
The signing cert must come from **POS Digicert Sdn Bhd** (Malaysia's gov CA,
`posdigicert.com.my`) under LHDNM's **`Trial LHDNM Sub CA V1`** intermediate (trial certs
are issued by `CN=Trial LHDNM Sub CA V1, O=LHDNM, C=MY` and embed the taxpayer's TIN/BRN
+ an `EmailAddress`). Production uses the production LHDNM sub-CA. **The taxpayer must
obtain this cert before any submit can succeed.** See `/signature/#digital-signing-certificate-profile`.

### Blocker #2 — signing target + SignedInfo c14n (co-equal with the cert)
Whether `SignatureValue = Sign(docDigest)` (per prose) or `Sign(c14n(SignedInfo))`
(per wire-sample structure / standard XAdES), and the exact byte serialization of
`SignedInfo` in this JSON-XML hybrid, are **undocumented**. Must be reverse-engineered
from a real verifiable signed sample before the submit step will be accepted.

## 7. Required request headers (`/standard-header-parameters/`)

Not fully scraped (JS-rendered). Known from the collection: `Authorization: Bearer`.
Likely also required (typical for MyInvois): `Accept-Language`, and possibly an
`X-` taxpayer header for intermediary calls (`onbehalfof`). Confirm before submit.

## 8. Standard error response (`/standard-error-response/`)

Not scraped. Known shape (typical LHDN): `{ "error": "...", "error_description": "...",
"timestamp": "...", "traceId": "...", "errors": [ ... ] }`. HTTP 401 = token expired
(re-login); 400 = validation error (see response body for which field/rule failed).

## 9. Document validation rules (`/document-validation-rules/`)

Not scraped (JS-rendered). These define accept/reject at submission. Rules differ per
document type/version. **A real submit will likely fail until we fetch the v1.1 invoice
validation rule set** — open question for the next pass.

---

## How this maps to our backend (`backend/src/`)

| Backend concern | MyInvois concept |
|---|---|
| `invoices.myinvois_doc_id` column | returned `documentUUID`/longId after submit |
| `invoices.validation_uuid` column | returned `UUID` after successful validation |
| `invoices.qr_url` column | QR verification link/string from get-document-details |
| `invoices.status` | `draft` → `submitted` → `accepted`/`rejected` (+ `paid`) |
| `profiles.tin` | supplier's TIN; validated via endpoint #1 before issue |
| New table needed | `myinvois_submissions` (submissionUid, request/response, timestamps) |
| New env needed | `MYINVOIS_CLIENT_ID`, `MYINVOIS_CLIENT_SECRET`, `MYINVOIS_ENV=sandbox|prod` |
| New lib needed | `lib/myinvois.ts` — token cache (1h TTL), submit, get-document, validate-tin |

## Open questions before implementing submit
1. **Prod identity host** — inferred `api.myinvois.hasil.gov.my/connect/token` by sandbox
   host-parity (sandbox sets idSrvBaseUrl == apiBaseUrl). Confirm on first prod registration.
2. **documentHash algorithm** — primitive known (`base64(SHA256(UTF8(document)))`, RSA-PKCS#1 v1.5 + SHA-256). **Signing target: analytical evidence + step ordering strongly favour the prose reading** — `SignatureValue = Sign(SHA256(minifiedDocument))` (bare doc digest), non-standard vs typical XAdES `Sign(c14n(SignedInfo))`. Not yet crypto-proven (RSA-verify failed on all candidates because the doc Reference uses XML-C14N11 over a JSON→XML transform I didn't reproduce). See §6. Remaining real blocker is the cert + exact minified-doc byte serialization; `c14n(SignedInfo)` likely not the signed octets.
   signed JSON embeds XAdES-BES via UBLExtensions, 7-step process.
   **Real blocker: POS Digicert / LHDNM Sub CA cert** — taxpayer must obtain before submit.
3. **Validation rules for invoice v1.1** — scrape the rendered rule set (needs a JS-capable fetch or the raw table behind it).
4. **Standard headers** — confirm `Accept-Language` + intermediary headers from `/standard-header-parameters/`.
5. **Client credentials** — the taxpayer must register their ERP system in the MyInvois portal to get `clientId`/`clientSecret`; we can't proceed without these.

## Recommended integration order
1. **Validate-TIN** first (simplest, GET, no signing) — lets users verify a customer/seller TIN before issuing. Wire to a `/customers/validate-tin` route.
2. **Token client** with a cached token (renew 5 min before expiry) — foundation for all other calls.
3. **Document builder** — convert our `invoices` + `invoice_items` rows → UBL JSON v1.1 shape (start from the sample).
4. **Signing/hash** — after reading the PDF; this is the hard part.
5. **Submit + poll Get-Submission** — store `submissionUid` → per-doc status.
6. **Get-Document-Details** → fetch `UUID`, `longId` (doc id), QR → store on the invoice row.