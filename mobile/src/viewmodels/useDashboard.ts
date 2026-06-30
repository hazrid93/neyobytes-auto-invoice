/**
 * Dashboard view model — owns the invoice list + the "capture" action that
 * kicks off extraction. Screens read `invoices`/`loading`/`error` and call
 * `refresh()` / `captureAndExtract(image)`.
 */
import { useCallback, useState } from 'react'
import * as invoiceService from '../services/invoiceService'
import { apiErrorMessage, type ApiError } from '../http/client'
import type { InvoiceSummary, ExtractResult } from '../domain/dtos'

export interface DashboardView {
  invoices: InvoiceSummary[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Run OCR on a captured image; returns the draft + extracted fields, or null on failure. */
  captureAndExtract: (image: string) => Promise<ExtractResult | null>
  extracting: boolean
  extractError: string | null
}

export function useDashboard(): DashboardView {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInvoices(await invoiceService.listInvoices())
    } catch (e) {
      setError(apiErrorMessage(e as ApiError))
    } finally {
      setLoading(false)
    }
  }, [])

  const captureAndExtract = useCallback(async (image: string): Promise<ExtractResult | null> => {
    setExtracting(true)
    setExtractError(null)
    try {
      const result = await invoiceService.extractInvoice(image)
      // The new draft appears at the top of the list; refresh to show it.
      await refresh()
      return result
    } catch (e) {
      setExtractError(apiErrorMessage(e as ApiError))
      return null
    } finally {
      setExtracting(false)
    }
  }, [refresh])

  return { invoices, loading, error, refresh, captureAndExtract, extracting, extractError }
}