/**
 * Symmetric secret encryption (AES-256-GCM).
 *
 * Used to encrypt long-lived, user-owned secrets we store in our own DB —
 * specifically each taxpayer's LHDN MyInvois `client_secret` (issued by the
 * MyInvois portal when they "Generate ERP", valid 1–3 years). We never store
 * these in plaintext at rest; the env-level `PROFILE_SECRET_KEY` derives the
 * 256-bit key.
 *
 * Format (versioned so the algorithm can change later):
 *   v1:<base64 iv>:<base64 ciphertext>:<base64 authTag>
 *
 * Failures (missing key, wrong key, tampered ciphertext) throw — callers
 * (profileRepo) classify them. The key MUST be stable across restarts, or
 * previously-stored secrets become undecryptable.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../env'

/** 256-bit key derived deterministically from the configured passphrase. */
function key(): Buffer {
  // SHA-256 derive so any passphrase length maps to exactly 32 bytes. The env
  // validator enforces a min length so a trivially short key can't be set.
  return createHash('sha256').update(env.PROFILE_SECRET_KEY ?? '').digest()
}

const VERSION = 'v1'

/** Encrypt a UTF-8 plaintext into the versioned transport format. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12) // 96-bit nonce — standard for GCM
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join(':')
}

/** Decrypt a value produced by {@link encrypt}. Throws on tamper/wrong key. */
export function decrypt(encoded: string): string {
  const parts = encoded.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(`Unsupported ciphertext version or shape (expected ${VERSION})`)
  }
  const iv = Buffer.from(parts[1], 'base64')
  const ct = Buffer.from(parts[2], 'base64')
  const tag = Buffer.from(parts[3], 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

/** True when the encryption key is configured (env present). Lets callers
 * short-circuit with a clear config error instead of a cryptic decrypt throw. */
export function isEncryptionConfigured(): boolean {
  return Boolean(env.PROFILE_SECRET_KEY && env.PROFILE_SECRET_KEY.length >= 32)
}