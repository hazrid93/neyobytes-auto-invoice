# POS Digicert — Trial signing cert request (template)

> Copy-paste starting point for requesting a **trial** LHDN MyInvois e-invoicing
> signing certificate from POS Digicert (sandbox / preprod). Fill the `[...]`
> placeholders with your real business details before sending.
>
> ⚠️ **Check `posdigicert.com.my` first.** POS Digicert likely has an **online
> application form/portal** (not just email) with specific fields, required
> uploads, and a fixed fee schedule (for prod; trial is usually free). This
> template covers the *information* they'll ask for so you have it ready; use the
> portal form where one exists, and attach this as a cover note if helpful.

---

## Where to submit
- **POS Digicert Sdn Bhd** — `posdigicert.com.my`
- Look for their **e-invoicing / LHDN MyInvois digital signature certificate**
  product page, or the general "digital certificate" application portal.
- Reference spec on the LHDN SDK site:
  **"Digital Signature Certificate Profile"** for e-invoicing
  (`/signature/#digital-signing-certificate-profile`) — mention this so they
  issue the correct cert profile under the right Sub CA.

---

## Email / cover-note template

**Subject:** Request for Trial LHDN MyInvois e-Invoicing Digital Signing
Certificate (sandbox) — `[Your Company Name]`

**To:** POS Digicert Sdn Bhd (certificates / support inbox)
`[support@posdigicert.com.my — confirm the exact address on their site]`

---

To whom it may concern at POS Digicert,

We would like to request a **trial digital signing certificate** for LHDN
MyInvois e-invoicing integration testing, issued under the
**Trial LHDNM Sub CA V1** intermediate (sandbox environment), as per the
LHDN "Digital Signature Certificate Profile" for e-invoicing.

Our intended use is integration testing of e-invoice document submission
against the MyInvois **pre-production (sandbox)** API
(`preprod-api.myinvois.hasil.gov.my`), in line with LHDN's
"Securing JSON Files with Digital Signatures" guidance (XAdES-BES enveloped
signature, RSA-2048 + SHA-256, RSA-PKCS#1 v1.5).

### Applicant / business details
- **Registered business name:** `[Your Company Name]`
- **SSM registration no.:** `[202401000123 / 1234567-A]`
- **TIN (Tax Identification Number):** `[e.g. C24050894070 or IG25292137020]`
- **BRN (Business Registration Number):** `[if different/applicable]`
- **Nature of business (MSIC):** `[e.g. 46510 — Wholesale of computer hardware]`
- **Registered address:** `[full address]`

### Authorized representative (for KYC)
- **Name:** `[Full name as per NRIC]`
- **NRIC / Passport no.:** `[xxxxxxxx-xx-xxxx]`
- **Designation:** `[Director / Owner / Authorized signatory]`
- **Contact no.:** `[+60xx-xxxxxxx]`
- **Email:** `[you@yourcompany.com — this is embedded in the cert]`
- **Relationship to business:** `[e.g. Director / Sole proprietor]`

### Certificate requirements
- **Certificate profile:** LHDN MyInvois e-invoicing signing certificate
  (Trial), per the LHDN Digital Signature Certificate Profile.
- **Issuing Sub CA:** `Trial LHDNM Sub CA V1` (sandbox trial; not the
  production Sub CA).
- **Subject should embed:** our TIN/BRN and the representative email above.
- **Key type:** RSA-2048 (or as per the LHDN profile).
- **Environment:** sandbox / preprod only at this stage. We will request the
  production cert separately after successful sandbox integration.

### Attachments provided
- [ ] SSM business registration document (certified copy)
- [ ] Authorized representative's NRIC / Passport (certified copy)
- [ ] `[any other form POS Digicert requires]`

Kindly confirm:
1. The correct application form / portal link (and fee, if any, for a trial cert).
2. The required supporting documents for KYC.
3. The estimated turnaround time.
4. The delivery format for the cert and private key (secure download, USB
   token, or PEM files — we need to load the PEM into our backend's `.env`, so
   please confirm the format allows this).
5. Whether a self-service CSR-based issuance is available (we can generate the
   keypair locally and submit a CSR, which avoids transmitting the private key).

We are available for any verification call. Thank you.

Best regards,
`[Your name]`
`[Designation]` — `[Your Company Name]`
`[Phone]` · `[Email]`

---

## Before you send — checklist

- [ ] Confirm the **POS Digicert support/applications email** on their site
      (don't assume `support@posdigicert.com.my`).
- [ ] Check whether they have an **online portal form** — prefer it over email
      if one exists (faster, structured).
- [ ] Ask about **CSR-based issuance** (item 5) — this is the cleanest path: you
      generate the RSA keypair locally, submit only the public CSR, and they
      return the signed cert. Your private key never leaves your machine.
- [ ] Have **certified true copies** of SSM + NRIC ready (POS Digicert / a
      commissioner of oaths can certify).
- [ ] Use a **business email** (not personal) — it gets embedded in the cert
      subject.
- [ ] Specify **Trial / sandbox Sub CA** explicitly, so they don't start you on
      the paid production cert.

## After you receive the cert

Drop the PEM cert + private key into `.env.stg` and run the round-trip in
[`TESTING-FLOWS.md §4c`](./TESTING-FLOWS.md#4c-the-round-trip-do-this-once-with-the-cert):

```bash
# .env.stg
MYINVOIS_CERT_PEM=<PEM cert>
MYINVOIS_KEY_PEM=<PEM private key>
MYINVOIS_SIGN_TARGET=docdigest   # prose-literal candidate; flip to signedinfo if rejected
pm2 restart auto-invoice-api-stg --update-env
```

Then submit one sandbox invoice. If accepted → `docdigest` confirmed; record it
in `docs/myinvois/KNOWLEDGE-BASE.md §5` and the signing gate is satisfied. If rejected
→ flip `MYINVOIS_SIGN_TARGET=signedinfo` and retry.