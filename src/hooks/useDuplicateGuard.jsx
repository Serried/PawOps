import { useCallback, useState } from 'react'
import { apiError } from '../api/client.js'
import { DuplicateWarningDialog } from '../components/DuplicateWarningDialog.jsx'

// Runs a care action; on 409 DUPLICATE_CARE shows the warning, Override retries with override=true
export function useDuplicateGuard() {
  const [warning, setWarning] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async (action, onSaved) => {
    try {
      const result = await action(false)
      onSaved?.(result, { overridden: false })
      return 'saved'
    } catch (error) {
      const normalized = apiError(error)
      if (normalized.code !== 'DUPLICATE_CARE') throw normalized
      setWarning({ ...normalized, action, onSaved })
      return 'warned'
    }
  }, [])

  const cancel = useCallback(() => setWarning(null), [])

  const confirm = async () => {
    setBusy(true)
    try {
      const result = await warning.action(true)
      warning.onSaved?.(result, { overridden: true })
      setWarning(null)
    } catch (error) {
      setWarning((current) => current && { ...current, retryError: apiError(error).message })
    } finally {
      setBusy(false)
    }
  }

  const dialog = warning ? (
    <DuplicateWarningDialog warning={warning} busy={busy} onCancel={cancel} onConfirm={confirm} />
  ) : null

  return { run, dialog }
}
