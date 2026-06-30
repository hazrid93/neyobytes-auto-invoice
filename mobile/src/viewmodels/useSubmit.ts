/**
 * Submit view model — owns the submit-to-LHDN action for a single invoice
 * and the audit history. Surfaces the active MyInvois mode (mock/sandbox/prod)
 * so the screen can show a banner. Honors the backend's audit-on-failure:
 * the service always writes an audit row before throwing, so even a failed
 * submit shows up in `submissions`.
 */
import { useCallback, useEffect, useState } from 'react'
import * as myinvoisService from '../services/myinvoisService'
import { apiErrorMessage, type ApiError } from '../http/client'
import type { SubmitResult } from '../domain/dtos'

export interface SubmitView {
  mode: myinvoisService.MyInvoisStatus['mode'] | null
  status: myinvoisService.MyInvoisStatus | null
  submitting: boolean
  error: string | null
  lastResult: SubmitResult | null
  submissions: myinvoisService.SubmissionRow[]
  loadingSubmissions: boolean
  loadStatus: () => Promise<void>
  submit: (invoiceId: string) => Promise<SubmitResult | null>
  loadSubmissions: (invoiceId: string) => Promise<void>
}

export function useSubmit(): SubmitView {
  const [mode, setMode] = useState<SubmitView['mode']>(null)
  const [status, setStatus] = useState<myinvoisService.MyInvoisStatus | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null)
  const [submissions, setSubmissions] = useState<myinvoisService.SubmissionRow[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const s = await myinvoisService.getStatus()
      setStatus(s)
      setMode(s.mode)
    } catch {
      // Non-fatal: status banner is informational; default to unknown.
    }
  }, [])

  const loadSubmissions = useCallback(async (invoiceId: string) => {
    setLoadingSubmissions(true)
    try {
      setSubmissions(await myinvoisService.listSubmissions(invoiceId))
    } catch (e) {
      // Submissions are secondary; surface but don't block the submit screen.
      console.warn('[submit] audit load failed:', apiErrorMessage(e as ApiError))
    } finally {
      setLoadingSubmissions(false)
    }
  }, [])

  const submit = useCallback(async (invoiceId: string): Promise<SubmitResult | null> => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await myinvoisService.submitInvoice(invoiceId)
      setLastResult(result)
      // Refresh the audit trail so the new attempt (success or error-row) shows.
      await loadSubmissions(invoiceId)
      return result
    } catch (e) {
      const msg = apiErrorMessage(e as ApiError)
      setError(msg)
      // Even on failure the backend wrote an audit row — refresh to show it.
      await loadSubmissions(invoiceId)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [loadSubmissions])

  // Fetch the active mode once on mount for the banner.
  useEffect(() => {
    ;(async () => loadStatus())()
  }, [loadStatus])

  return {
    mode,
    status,
    submitting,
    error,
    lastResult,
    submissions,
    loadingSubmissions,
    loadStatus,
    submit,
    loadSubmissions,
  }
}