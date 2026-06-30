/**
 * Unit tests for the LHDN signing primitives (`src/lib/signing.ts`) +
 * JSON UBL builder (`src/lib/ublJson.ts`).
 *
 * Run:  npm run signing:verify
 *
 * These lock in the BYTE-EXACT-VERIFIED steps against the official wire sample
 * in docs/myinvois/signature-creation-json.md (the trial LHDNM cert +
 * SigningTime 2024-07-23T15:14:54Z):
 *   - Step 4 certDigest            → KKBSTyiPKGkGl1AFqcPziKCEIDYGtnYUTQN4ukO7G40=
 *   - Step 6 signedPropertiesDigest → Rzuzz+70GSnGBF1YxhHnjSzFpQ1MW4vyX/Q9bTHkE2c=
 *
 * The UNVERIFIED step (Step 3 SignatureValue) is tested with a throwaway
 * self-signed key we generate here (NOT a real LHDN cert): we only prove the
 * sign→verify round-trip is self-consistent for the `docdigest` candidate —
 * NOT that LHDN accepts it. The `signedinfo` candidate must throw
 * PendingImplementationError (it's not implemented yet), and an unrecognized
 * target must throw SigningTargetUnverifiedError (defensive gate).
 *
 * Uses node:test (built into Node 22) — no extra test runner needed.
 */
import '../src/load-env'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateKeyPairSync, createHash } from 'node:crypto'
import {
  transformDocument,
  documentDigest,
  certDigest,
  buildSignedProperties,
  signedPropertiesDigest,
  signSignatureValue,
  verifyDocumentSignature,
  SigningTargetUnverifiedError,
  PendingImplementationError,
} from '../src/lib/signing'
import { buildUblJson } from '../src/lib/ublJson'

const TRIAL_CERT = readFileSync(
  new URL('./fixtures/trial-lhdnm-cert.pem', import.meta.url),
  'utf8',
)

// Generate a throwaway RSA-2048 keypair IN-MEMORY for the Step 3 sign→verify
// round-trip. NOT a real LHDN cert (no procurement value); only proves the
// docdigest candidate is self-consistent. verifyDocumentSignature accepts a
// bare public-key PEM (SPKI) via its cert-or-pubkey fallback.
function makeTestKeypair(): { certPem: string; keyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { certPem: publicKey as string, keyPem: privateKey as string }
}
const { certPem: TEST_CERT, keyPem: TEST_KEY } = makeTestKeypair()

// Known-good values from the official wire sample (signature-creation-json.md).
const EXPECTED_CERT_DIGEST = 'KKBSTyiPKGkGl1AFqcPziKCEIDYGtnYUTQN4ukO7G40='
const EXPECTED_SIGNEDPROPS_DIGEST = 'Rzuzz+70GSnGBF1YxhHnjSzFpQ1MW4vyX/Q9bTHkE2c='
const DOC_SIGNING_TIME = '2024-07-23T15:14:54Z'

describe('Step 1 — transformDocument', () => {
  it('strips UBLExtensions and Signature and minifies (no whitespace)', () => {
    const withSig = JSON.stringify({
      _D: 'urn:x',
      Invoice: [{ ID: [{ _: 'INV1' }], UBLExtensions: [{ x: 1 }], Signature: [{ y: 2 }] }],
    })
    const out = transformDocument(withSig)
    assert.equal(out, '{"_D":"urn:x","Invoice":[{"ID":[{"_":"INV1"}]}]}')
    assert.equal(out.includes('UBLExtensions'), false, 'UBLExtensions must be stripped')
    assert.equal(out.includes('Signature'), false, 'Signature must be stripped')
    assert.equal(out.includes('\n'), false, 'must be minified (no newlines)')
  })

  it('is idempotent on an already-clean document', () => {
    const clean = '{"_D":"urn:x","Invoice":[{"ID":[{"_":"INV1"}]}]}'
    assert.equal(transformDocument(clean), clean)
  })
})

describe('Step 2 — documentDigest', () => {
  it('computes base64(SHA256(UTF8(transformed doc))) — matches a known SHA256', () => {
    const doc = '{"_D":"urn:x","Invoice":[{"ID":[{"_":"INV1"}]}]}'
    const expected = createHash('sha256').update(Buffer.from(doc, 'utf8')).digest('base64')
    assert.equal(documentDigest(doc), expected)
  })
})

describe('Step 4 — certDigest (BYTE-EXACT VERIFIED)', () => {
  it("reproduces the official trial cert's digest exactly", () => {
    assert.equal(certDigest(TRIAL_CERT), EXPECTED_CERT_DIGEST)
  })

  it('is base64 of a 32-byte SHA256', () => {
    const d = certDigest(TRIAL_CERT)
    assert.equal(Buffer.from(d, 'base64').length, 32)
  })
})

describe('Step 5+6 — SignedProperties (BYTE-EXACT VERIFIED)', () => {
  it("reproduces the official sample's signed-properties digest exactly", () => {
    const { signedPropertiesForDigest } = buildSignedProperties(TRIAL_CERT, DOC_SIGNING_TIME)
    assert.equal(signedPropertiesDigest(signedPropertiesForDigest), EXPECTED_SIGNEDPROPS_DIGEST)
  })

  it('constructs the Step-6 digest input as {"Target":"signature","SignedProperties":[...]}', () => {
    const { signedPropertiesForDigest } = buildSignedProperties(TRIAL_CERT, DOC_SIGNING_TIME)
    const parsed = JSON.parse(signedPropertiesForDigest)
    assert.deepEqual(Object.keys(parsed), ['Target', 'SignedProperties'])
    assert.equal(parsed.Target, 'signature')
    assert.ok(Array.isArray(parsed.SignedProperties))
    assert.equal(parsed.SignedProperties[0].Id, 'id-xades-signed-props')
  })

  it('embeds the cert digest + issuer/serial into SigningCertificate', () => {
    const { signedProperties } = buildSignedProperties(TRIAL_CERT, DOC_SIGNING_TIME)
    const cert = signedProperties.SignedSignatureProperties[0].SigningCertificate[0].Cert[0]
    assert.equal(cert.CertDigest[0].DigestValue[0]._, EXPECTED_CERT_DIGEST)
    assert.equal(
      cert.CertDigest[0].DigestMethod[0].Algorithm,
      'http://www.w3.org/2001/04/xmlenc#sha256',
    )
    assert.ok(cert.IssuerSerial[0].X509IssuerName[0]._)
    assert.ok(/^\d+$/.test(cert.IssuerSerial[0].X509SerialNumber[0]._))
  })
})

describe('Step 3 — SignatureValue (UNVERIFIED candidate, self-consistent only)', () => {
  it('docdigest: sign→verify round-trips with the throwaway test key (NOT a LHDN acceptance test)', () => {
    const doc = transformDocument(buildUblJson(sampleInvoiceInput()))
    const sig = signSignatureValue(
      { certPem: TEST_CERT, keyPem: TEST_KEY },
      doc,
      '',
      'docdigest',
    )
    // Verify: SignatureValue == RSA-PKCS1v1.5-Sign(SHA256(doc)); Node's
    // crypto.verify('sha256') hashes the document once internally — pass the
    // doc bytes, not a pre-computed digest, or it double-hashes.
    assert.equal(verifyDocumentSignature(TEST_CERT, doc, sig), true)
  })

  it('docdigest: a tampered document fails verification (signature no longer matches)', () => {
    const doc = transformDocument(buildUblJson(sampleInvoiceInput()))
    const sig = signSignatureValue(
      { certPem: TEST_CERT, keyPem: TEST_KEY },
      doc,
      '',
      'docdigest',
    )
    assert.equal(verifyDocumentSignature(TEST_CERT, doc + 'X', sig), false)
  })

  it('signedinfo target throws PendingImplementationError (not implemented)', () => {
    assert.throws(
      () =>
        signSignatureValue(
          { certPem: TEST_CERT, keyPem: TEST_KEY },
          'doc',
          '{"a":1}',
          'signedinfo',
        ),
      PendingImplementationError,
    )
  })

  it('an unrecognized/empty target throws SigningTargetUnverifiedError (defensive)', () => {
    assert.throws(
      () =>
        signSignatureValue(
          { certPem: TEST_CERT, keyPem: TEST_KEY },
          'doc',
          '',
          '' as 'docdigest',
        ),
      SigningTargetUnverifiedError,
    )
  })
})

describe('buildUblJson — JSON UBL builder', () => {
  it('produces a valid JSON UBL envelope with the v1.1 InvoiceTypeCode', () => {
    const out = JSON.parse(buildUblJson(sampleInvoiceInput()))
    assert.deepEqual(Object.keys(out), ['_D', '_A', '_B', 'Invoice'])
    const inv = out.Invoice[0]
    assert.equal(inv.InvoiceTypeCode[0]._, '01')
    assert.equal(inv.InvoiceTypeCode[0].listVersionID, '1.1')
    assert.ok(Array.isArray(inv.InvoiceLine))
    assert.equal(inv.AccountingSupplierParty[0].Party[0].PartyIdentification[0].ID[0]._, 'IG25292137020')
  })

  it('round-trips through transformDocument (strippable, idempotent on the unsigned doc)', () => {
    const json = buildUblJson(sampleInvoiceInput())
    const t = transformDocument(json)
    assert.equal(t.includes('UBLExtensions'), false)
    assert.equal(t.includes('Signature'), false)
    // Transforming again is a no-op (no sig blocks to strip).
    assert.equal(transformDocument(t), t)
  })
})

function sampleInvoiceInput() {
  return {
    invoiceNumber: 'JSON-INV-TEST-001',
    issueDate: '2026-06-30',
    dueDate: '2026-07-30',
    currency: 'MYR',
    supplier: { tin: 'IG25292137020', name: 'Test Supplier', email: 's@x.test' },
    customer: { tin: 'C24050894070', name: 'Test Buyer', email: 'b@x.test', address: 'KL' },
    items: [
      { description: 'Widget', quantity: 2, unitPrice: 50, taxRate: 6 },
      { description: 'Gadget', quantity: 1, unitPrice: 30, taxRate: 0 },
    ],
    subtotal: 130,
    taxTotal: 6,
    total: 136,
  }
}