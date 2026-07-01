/**
 * TIN normalization for LHDN MyInvois — applied before validate/submit.
 *
 * Rules from the LHDN FAQ (docs/myinvois/sdk-ref/faq.txt,
 * "How to retrieve and validate the accuracy of my TIN?"):
 *
 *   Individual TIN (prefix IG — replacing OG/SG):
 *     - the new prefix is 'IG' (so 'SG123456789' → 'IG123456789')
 *     - max 14 chars including the prefix; numeric part unchanged
 *
 *   Non-Individual TIN (prefix in C, CS, D, F, FA, PT, TA, TC, TN, TR, TP, J, LE):
 *     - strip any leading zeros AFTER the prefix ('C01234567890' → 'C1234567890')
 *     - must END with '0' ('C123456789' → 'C1234567890'). Non-Individual TIN
 *       always ends with zero '0'.
 *
 * Anything that doesn't match a known prefix is returned trimmed+uppercased
 * unchanged (we don't guess for unknown shapes — LHDN's validate API will
 * surface a 400 with the precise reason).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const INDIVIDUAL_PREFIXES = ['IG', 'EI']
const NON_INDIVIDUAL_PREFIXES = [
  'C', 'CS', 'D', 'F', 'FA', 'PT', 'TA', 'TC', 'TN', 'TR', 'TP', 'J', 'LE',
]

/** Longest-prefix match against a sorted-by-length-desc list. */
function matchPrefix(tin: string, prefixes: string[]): string | null {
  for (const p of prefixes.sort((a, b) => b.length - a.length)) {
    if (tin.startsWith(p)) return p
  }
  return null
}

/** Normalize a TIN per the LHDN FAQ rules. Returns the trimmed+uppercased TIN
 *  with the prefix/zero/ending-zero rules applied for known prefixes. */
export function normalizeTin(input: string): string {
  const tin = (input ?? '').trim().toUpperCase()
  if (!tin) return tin

  // Individual: map legacy OG/SG prefix → IG.
  if (tin.startsWith('OG') || tin.startsWith('SG')) {
    return 'IG' + tin.slice(2)
  }
  if (matchPrefix(tin, INDIVIDUAL_PREFIXES)) {
    return tin // IG/EI: unchanged
  }

  const prefix = matchPrefix(tin, NON_INDIVIDUAL_PREFIXES)
  if (!prefix) return tin // unknown shape — don't guess

  let rest = tin.slice(prefix.length)
  // strip leading zeros after the prefix
  rest = rest.replace(/^0+/, '')
  // must end with '0'
  if (!rest.endsWith('0')) rest += '0'
  return prefix + rest
}

// ── unit tests (run inline: npx tsx src/lib/tin.ts) ──────────────────────
if (process.env.NODE_ENV === 'test' || import.meta.url?.endsWith('tin.ts')) {
  test('individual TIN: OG/SG → IG', () => {
    assert.equal(normalizeTin('SG123456789'), 'IG123456789')
    assert.equal(normalizeTin('og1234567890'), 'IG1234567890')
    assert.equal(normalizeTin('IG1234567890'), 'IG1234567890')
  })
  test('non-individual TIN: strip leading zeros + end with 0', () => {
    assert.equal(normalizeTin('C01234567890'), 'C1234567890')
    assert.equal(normalizeTin('C123456789'), 'C1234567890')
    assert.equal(normalizeTin('C1234567890'), 'C1234567890')
    assert.equal(normalizeTin('c123456789'), 'C1234567890')
  })
  test('multi-letter non-individual prefixes (CS, FA, LE…)', () => {
    assert.equal(normalizeTin('CS012345678'), 'CS123456780')
    assert.equal(normalizeTin('FA12345'), 'FA123450')
    assert.equal(normalizeTin('LE123456789'), 'LE1234567890')
  })
  test('already-normalized TINs are idempotent', () => {
    assert.equal(normalizeTin('C1234567890'), normalizeTin(normalizeTin('C1234567890')))
    assert.equal(normalizeTin('IG1234567890'), normalizeTin(normalizeTin('IG1234567890')))
  })
  test('unknown prefix returned trimmed+uppercased unchanged', () => {
    assert.equal(normalizeTin('  xx123  '), 'XX123')
    assert.equal(normalizeTin(''), '')
  })
  test('whitespace + case normalization', () => {
    assert.equal(normalizeTin('  c123456789  '), 'C1234567890')
  })
  // run when executed directly
  if (import.meta.url?.endsWith('tin.ts')) {
    import('node:test').then(() => {}) // no-op; node --test picks them up
  }
}