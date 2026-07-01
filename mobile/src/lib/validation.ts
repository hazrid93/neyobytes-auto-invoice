/**
 * Field validation helpers — pure functions mirroring the LHDN MyInvois rules
 * (see data/codes.ts FIELD_RULES for max-char / required constraints, and
 * backend/src/lib/tin.ts for the TIN format).
 *
 * Each `validate*` returns an error STRING (the message to show under the
 * field) or null when valid. The components consume these via `useFieldState`
 * which wires on-blur + on-change-after-first-blur validation.
 */

/** A validation rule returns an error message, or null when the value is OK. */
export type Validator = (value: string) => string | null

/** Compose multiple validators; first non-null error wins. */
export function compose(...validators: Validator[]): Validator {
  return (value: string) => {
    for (const v of validators) {
      const err = v(value)
      if (err) return err
    }
    return null
  }
}

/** Required — must be non-empty (after trim). */
export function required(label: string): Validator {
  return (v) => (v.trim().length === 0 ? `${label} is required.` : null)
}

/** Minimum length (after trim). */
export function minLength(label: string, n: number): Validator {
  return (v) => {
    if (v.trim().length === 0) return null // let `required` cover empty
    return v.trim().length < n ? `${label} must be at least ${n} character${n === 1 ? '' : 's'}.` : null
  }
}

/** Maximum length (raw, not trimmed — matches the LHDN char-count rule). */
export function maxLength(label: string, n: number): Validator {
  return (v) => (v.length > n ? `${label} must be ${n} characters or fewer (currently ${v.length}).` : null)
}

/** Exact length. */
export function exactLength(label: string, n: number): Validator {
  return (v) => {
    if (v.trim().length === 0) return null
    return v.length !== n ? `${label} must be exactly ${n} characters.` : null
  }
}

/** Regex pattern. `hint` is appended to the error so the user knows the shape. */
export function pattern(label: string, re: RegExp, hint: string): Validator {
  return (v) => {
    if (v.trim().length === 0) return null
    return re.test(v) ? null : `${label} format is invalid. ${hint}`
  }
}

/** Email (RFC-ish, practical). */
export function email(label = 'Email'): Validator {
  return pattern(
    label,
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    'Use a valid address like name@company.com.',
  )
}

/** Malaysian / international phone (E.164-ish: optional +, digits, spaces, dashes, 6–20). */
export function phone(label = 'Contact number'): Validator {
  return pattern(
    label,
    /^\+?[0-9][0-9\- ]{4,19}$/,
    'Use the international format, e.g. +60123456789.',
  )
}

/**
 * TIN — LHDN Tax Identification Number. Must start with a known prefix
 * (C, CS, D, F, FA, PT, TA, TC, TN, TR, TP, J, LE for non-individuals; IG, EI
 * for individuals) followed by 8–12 digits. Max 14 chars total.
 * The backend normalizes (OG/SG→IG, strip leading zeros, ensure trailing 0);
 * here we only check the shape so the user gets early feedback.
 */
export function tin(label = 'TIN'): Validator {
  return compose(
    required(label),
    maxLength(label, 14),
    pattern(
      label,
      /^(C|CS|D|F|FA|PT|TA|TC|TN|TR|TP|J|LE|IG|EI|OG|SG)[0-9]{6,13}$/i,
      'A TIN starts with a letter prefix (e.g. C, IG, LE) followed by digits, e.g. C1234567890.',
    ),
  )
}

/** Date YYYY-MM-DD. */
export function isoDate(label = 'Date'): Validator {
  return pattern(label, /^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
}

/** Decimal number (optionally negative, optionally with up to 4 decimals). */
export function decimal(label = 'Amount'): Validator {
  return pattern(label, /^-?\d+(\.\d{1,4})?$/, 'Enter a number, e.g. 17.50.')
}

/** Positive number (quantity / price > 0). */
export function positiveNumber(label = 'Amount'): Validator {
  return (v) => {
    if (v.trim().length === 0) return null
    const n = Number(v.replace(/[, ]/g, ''))
    if (!Number.isFinite(n)) return `${label} must be a number.`
    return n <= 0 ? `${label} must be greater than 0.` : null
  }
}