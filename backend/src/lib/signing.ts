/**
 * LHDN MyInvois XAdES enveloped signature for the UBL **JSON** document.
 *
 * Implements the 7-step algorithm from `docs/myinvois/signature-creation-json.md`
 * ("Securing JSON Files with Digital Signatures"). Steps 1, 4, and 6 are
 * crypto-confirmed against the doc's trial-cert wire sample (see
 * `scripts/verify-signing.ts`); the canonical example's `Rzuzz+70…`
 * SignedProperties digest and `KKBSTy…` cert digest both reproduce byte-exact.
 *
 * ⚠️ TWO BLOCKERS remain, co-equal — both must be resolved before a real
 * sandbox/prod submit succeeds (see docs/myinvois/KNOWLEDGE-BASE.md §5 + the
 * TESTING-FLOWS.md runbook):
 *
 *   1. CERT PROCUREMENT — the signing cert must come from POS Digicert under
 *      LHDNM's Sub CA. `signSignatureValue`/`assembleSignedDocument` need a
 *      real cert+key in env (`MYINVOIS_CERT_PEM`/`KEY_PEM`). The submit service
 *      already gates on this via SigningNotConfiguredError.
 *
 *   2. SIGNING TARGET — the doc's prose says sign the bare Step-2 doc digest
 *      (`SignHash(docDigest)`), but the wire sample carries a full `SignedInfo`
 *      (standard XAdES implies `Sign(c14n(SignedInfo))`). LHDN's verifier accepts
 *      exactly one; the public artifact couldn't disambiguate. To avoid burning
 *      days on a guess, `signSignatureValue` is an ENV-SWITCHABLE branch that
 *      THROWS `SigningTargetUnverifiedError` until `MYINVOIS_SIGN_TARGET` is set
 *      AND a real round-trip confirms which the verifier accepts.
 *
 * The byte-exact-verified steps are exercised by `scripts/verify-signing.ts`.
 * Nothing here is wired into the live submit path until §4c of the testing
 * guide passes — submit remains gated by the cert env as before.
 */
import { createHash, createPublicKey, createSign, X509Certificate, verify as cryptoVerify } from 'node:crypto'

export interface SigningConfig {
  certPem: string // MYINVOIS_CERT_PEM (PEM)
  keyPem: string // MYINVOIS_KEY_PEM (PEM)
  /** Which target SignatureValue signs. Resolved by a real round-trip. */
  signTarget?: 'docdigest' | 'signedinfo'
}

// ── Step 1: Transform the document ─────────────────────────────────────────
/**
 * Strip `UBLExtensions` and `Signature` (if present) and minify (no whitespace).
 * Input is the JSON UBL document string; output is the transformed, minified
 * JSON string. Key insertion order is preserved (JSON.stringify is stable on
 * object key order in V8). This is what Step 2 hashes.
 */
export function transformDocument(documentJson: string): string {
  const doc = JSON.parse(documentJson) as Record<string, unknown>
  const invoices = doc.Invoice as Record<string, unknown>[] | undefined
  if (invoices && Array.isArray(invoices) && invoices[0]) {
    delete invoices[0].UBLExtensions
    delete invoices[0].Signature
  }
  return JSON.stringify(doc) // minified (no whitespace) by default
}

// ── Step 2: Document digest → submit body's documentHash ───────────────────
/** documentHash = base64( SHA256( UTF8( minifiedDocumentString ) ) ). Verified
 *  algorithm; the exact byte serialization of "minified" is NOT yet confirmed
 *  to match LHDN's expectation for a given invoice (the doc's v1.1 sample
 *  digest didn't reproduce from a json minify — needs a round-trip; see
 *  TESTING-FLOWS.md §4c). */
export function documentDigest(transformedDocument: string): string {
  return base64Sha256(Buffer.from(transformedDocument, 'utf8'))
}

// ── Step 4: Certificate digest ─────────────────────────────────────────────
/** base64(SHA256(cert DER)). BYTE-EXACT VERIFIED against the doc's trial cert
 *  (reproduces KKBSTyiPKGkGl1AFqcPziKCEIDYGtnYUTQN4ukO7G40=). */
export function certDigest(certPem: string): string {
  const cert = new X509Certificate(certPem)
  return base64Sha256(Buffer.from(cert.raw)) // cert.raw == DER
}

// ── Step 5: Populate SignedProperties ──────────────────────────────────────
export interface SignedPropertiesResult {
  /** The full SignedProperties object (Step 5 output). */
  signedProperties: Record<string, unknown>
  /** The byte-exact minified JSON of {Target, SignedProperties} — what Step 6
   *  hashes (matches the doc's literal Step-6 input shape). */
  signedPropertiesForDigest: string
}

/** Build the SignedProperties section. signingTime is ISO-8601 UTC (e.g.
 *  2024-07-23T15:14:54Z). The minified digest input is constructed with the
 *  EXACT wrapping {Target, SignedProperties} from the doc (Step 6), so its
 *  digest is byte-stable. */
export function buildSignedProperties(
  certPem: string,
  signingTime: string,
): SignedPropertiesResult {
  const cert = new X509Certificate(certPem)
  const issuer = issuerString(cert)
  // Node exposes cert.serialNumber as a hex string WITHOUT the 0x prefix;
  // the doc's sample carries the serial in decimal. Parse as hex, emit base-10.
  const serialDec = BigInt('0x' + cert.serialNumber).toString(10)

  const signedProperties = {
    Id: 'id-xades-signed-props',
    SignedSignatureProperties: [
      {
        SigningTime: [{ _: signingTime }],
        SigningCertificate: [
          {
            Cert: [
              {
                CertDigest: [
                  {
                    DigestMethod: [
                      { _: '', Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' },
                    ],
                    DigestValue: [{ _: certDigest(certPem) }],
                  },
                ],
                IssuerSerial: [
                  {
                    X509IssuerName: [{ _: issuer }],
                    X509SerialNumber: [{ _: serialDec }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }

  // Step 6 hashes EXACTLY {"Target":"signature","SignedProperties":[...]}.
  // Construct it from the object so key order is stable + matches the doc.
  const signedPropertiesForDigest = JSON.stringify({
    Target: 'signature',
    SignedProperties: [signedProperties],
  })
  return { signedProperties, signedPropertiesForDigest }
}

// ── Step 6: SignedProperties digest ───────────────────────────────────────
/** SHA256 over the minified {"Target":"signature","SignedProperties":[...]}.
 *  BYTE-EXACT VERIFIED — reproduces Rzuzz+70GSnGBF1YxhHnjSzFpQ1MW4vyX/Q9bTHkE2c=
 *  for the doc's trial cert + 2024-07-23T15:14:54Z. */
export function signedPropertiesDigest(signedPropertiesForDigest: string): string {
  return base64Sha256(Buffer.from(signedPropertiesForDigest, 'utf8'))
}

// ── Step 3: SignatureValue ⚠️ UNVERIFIED — parameter-gated, never a silent default ─
/**
 * Sign to produce SignatureValue. ⚠️ THE SIGNING TARGET IS UNVERIFIED — see
 * the file header. The caller (invoiceSubmissionService) resolves the target
 * from `env.MYINVOIS_SIGN_TARGET` and throws `SigningTargetUnverifiedError`
 * when it is unset; this function then receives a concrete `'docdigest'` /
 * `'signedinfo'` and WILL ONLY proceed on an explicit, recognized value — any
 * other runtime value (e.g. an unset/empty string that slipped past the gate)
 * throws `SigningTargetUnverifiedError` rather than silently shipping a guessed
 * signature. It must never be reached from the live submit path until a real
 * round-trip confirms which target LHDN accepts.
 *
 *   docdigest  → RSA-PKCS1v1.5-Sign(SHA256(minified doc), key)  [prose literal]
 *   signedinfo → RSA-PKCS1v1.5-Sign(SHA256(c14n(SignedInfo)), key) [standard XAdES]
 *
 * `docdigest` is implementable now (it's just SignHash over Step 2's digest).
 * `signedinfo` needs the exact c14n serialization of SignedInfo (a JSON/XML
 * hybrid transform) — NOT implemented; throws PendingImplementationError.
 */
export function signSignatureValue(
  cfg: SigningConfig,
  transformedDocument: string,
  signedInfoMinified: string,
  signTarget: 'docdigest' | 'signedinfo',
): string {
  if (signTarget === 'signedinfo') {
    throw new PendingImplementationError(
      'signedinfo signing target: the c14n(SignedInfo) serialization for the JSON/XML hybrid is not implemented. Resolve via a round-trip (see TESTING-FLOWS.md §4c).',
    )
  }
  if (signTarget !== 'docdigest') {
    // Defensive: the service gate should have already thrown for an unset
    // target, but refuse to silently sign if reached with anything else.
    throw new SigningTargetUnverifiedError(
      `signSignatureValue reached with an unrecognized signing target (${JSON.stringify(signTarget)}). Set MYINVOIS_SIGN_TARGET=docdigest|signedinfo and see TESTING-FLOWS.md §4b.`,
    )
  }
  // docdigest candidate: RSA-PKCS1v1.5 + SHA256 over the transformed document.
  // This is EXACTLY .NET SignHash(SHA256(document), SHA256, PKCS1): Node's
  // createSign('RSA-SHA256').update(document) computes SHA256(document) then
  // RSA-PKCS1v1.5-signs that digest — identical to SignHash(SHA256(document)).
  //
  // ⚠️ UNVERIFIED: whether LHDN's verifier accepts this target is unconfirmed
  // (see TESTING-FLOWS.md §4b). The live submit path calls this only when
  // MYINVOIS_SIGN_TARGET=docdigest is explicitly set — i.e. the operator has
  // opted in after (or during) a round-trip. It is never a silent default.
  const signer = createSign('RSA-SHA256')
  signer.update(Buffer.from(transformedDocument, 'utf8'))
  return signer.sign(cfg.keyPem).toString('base64')
}

// ── Step 7: Assemble the signed document ───────────────────────────────────
export interface AssembleInput {
  config: SigningConfig
  /** The bare (unsigned) JSON UBL document string (from buildUblJson). */
  documentJson: string
  signingTime: string
  /** Resolved by a real round-trip (see TESTING-FLOWS.md §4c). */
  signTarget: 'docdigest' | 'signedinfo'
}

/**
 * Assemble the signed UBL JSON document (Step 7): embed UBLExtensions with the
 * signature block into the document. ⚠️ Returns a document whose SignatureValue
 * is computed via the UNVERIFIED signTarget — do NOT submit it until §4c
 * confirms acceptance. For mock/local the submit service never calls this.
 */
export function assembleSignedDocument(input: AssembleInput): string {
  const transformed = transformDocument(input.documentJson)
  const { signedProperties, signedPropertiesForDigest } = buildSignedProperties(
    input.config.certPem,
    input.signingTime,
  )
  const spDigest = signedPropertiesDigest(signedPropertiesForDigest)
  const docDigest = documentDigest(transformed)
  const cert = new X509Certificate(input.config.certPem)
  const certB64 = cert.raw.toString('base64')
  const issuer = issuerString(cert)
  const serialDec = BigInt('0x' + cert.serialNumber).toString(10)
  const subject = subjectString(cert)

  const signatureValue = signSignatureValue(
    input.config,
    transformed,
    '', // signedinfo target not implemented; docdigest ignores this
    input.signTarget,
  )

  const signedInfo = {
    SignatureMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' }],
    Reference: [
      {
        Type: 'http://uri.etsi.org/01903/v1.3.2#SignedProperties',
        URI: '#id-xades-signed-props',
        DigestMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' }],
        DigestValue: [{ _: spDigest }],
      },
      {
        Type: '',
        URI: '',
        DigestMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' }],
        DigestValue: [{ _: docDigest }],
      },
    ],
  }

  const ublExtensions = {
    UBLExtension: [
      {
        ExtensionURI: [{ _: 'urn:oasis:names:specification:ubl:dsig:enveloped:xades' }],
        ExtensionContent: [
          {
            UBLDocumentSignatures: [
              {
                SignatureInformation: [
                  {
                    ID: [{ _: 'urn:oasis:names:specification:ubl:signature:1' }],
                    ReferencedSignatureID: [{ _: 'urn:oasis:names:specification:ubl:signature:Invoice' }],
                    Signature: [
                      {
                        Id: 'signature',
                        Object: [
                          {
                            QualifyingProperties: [
                              { Target: 'signature', SignedProperties: signedProperties },
                            ],
                          },
                        ],
                        KeyInfo: [
                          {
                            X509Data: [
                              {
                                X509Certificate: [{ _: certB64 }],
                                X509SubjectName: [{ _: subject }],
                                X509IssuerSerial: [
                                  {
                                    X509IssuerName: [{ _: issuer }],
                                    X509SerialNumber: [{ _: serialDec }],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                        SignatureValue: [{ _: signatureValue }],
                        SignedInfo: signedInfo,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }

  // Embed UBLExtensions into the (un-transformed) document's Invoice, then
  // re-minify. (Step 7 assembles the signed doc from the original, with the
  // signature block added — the transform in Step 1 only defines what gets
  // hashed, not the final doc structure.)
  const doc = JSON.parse(input.documentJson) as Record<string, unknown>
  const invoices = doc.Invoice as Record<string, unknown>[]
  invoices[0].UBLExtensions = [ublExtensions]
  invoices[0].Signature = [
    {
      ID: [{ _: 'urn:oasis:names:specification:ubl:signature:Invoice' }],
      SignatureMethod: [{ _: 'urn:oasis:names:specification:ubl:dsig:enveloped:xades' }],
    },
  ]
  return JSON.stringify(doc)
}

// ── Errors ──────────────────────────────────────────────────────────────────
export class SigningTargetUnverifiedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SigningTargetUnverifiedError'
  }
}
export class PendingImplementationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PendingImplementationError'
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function base64Sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('base64')
}

/** Node's X509Certificate.issuer/subject exposes RDNs newline-separated in
 *  certificate order (C, O, OU, CN…). LHDN's sample uses the standard
 *  RFC4514-ish comma-joined form, RDNs reversed (CN, …, C). Normalize so the
 *  SignedProperties bytes match the documented shape (→ byte-exact digest). */
function rdnString(value: string): string {
  return value.split('\n').reverse().join(', ')
}
function issuerString(cert: X509Certificate): string {
  return rdnString(cert.issuer)
}
function subjectString(cert: X509Certificate): string {
  return rdnString(cert.subject)
}

/** Sanity: prove a public key verifies a SignatureValue against a document.
 *  Verify is the mirror of the docdigest candidate: SignatureValue was produced
 *  by RSA-PKCS1v1.5-signing SHA256(document), so Node's crypto.verify('sha256')
 *  (which hashes its `data` input once) verifies it — pass the document bytes,
 *  NOT a pre-computed digest, or it'll double-hash. Not used by the submit path.
 *  Accepts either a cert PEM (X509Certificate) or a bare public-key PEM
 *  (SPKI/PKCS1) so the self-consistency test can use an in-memory keypair. */
export function verifyDocumentSignature(
  certOrPubKeyPem: string,
  document: string,
  signatureBase64: string,
): boolean {
  let pub: import('node:crypto').KeyObject
  try {
    const cert = new X509Certificate(certOrPubKeyPem)
    pub = cert.publicKey
  } catch {
    // Not an X509 cert — treat as a bare public-key PEM (SPKI/PKCS1).
    pub = createPublicKey(certOrPubKeyPem)
  }
  return cryptoVerify(
    'sha256',
    Buffer.from(document, 'utf8'),
    pub,
    Buffer.from(signatureBase64, 'base64'),
  )
}