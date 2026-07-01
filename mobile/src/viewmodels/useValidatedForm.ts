/**
 * useValidatedForm — validates a set of `ValidatedField` refs on submit and
 * blocks the submit handler while any field is invalid.
 *
 * Usage:
 *   const fullNameRef = useRef<ValidatedFieldHandle>(null)
 *   const { formError, runValidation } = useValidatedForm([fullNameRef, tinRef])
 *   const submit = () => {
 *     if (!runValidation()) return      // errors are shown under each field
 *     // …do the submit…
 *   }
 */
import { useCallback, useState } from 'react'
import type { RefObject } from 'react'
import type { ValidatedFieldHandle } from '../components/ValidatedField'

export function useValidatedForm(refs: Array<RefObject<ValidatedFieldHandle | null>>) {
  const [formError, setFormError] = useState<string | null>(null)

  const runValidation = useCallback(() => {
    let ok = true
    for (const r of refs) {
      if (r.current && !r.current.validate()) ok = false
    }
    setFormError(ok ? null : 'Please fix the highlighted fields before continuing.')
    return ok
  }, [refs])

  const clearFormError = useCallback(() => setFormError(null), [])
  return { formError, runValidation, clearFormError }
}