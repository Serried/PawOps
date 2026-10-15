import { useEffect, useRef } from 'react'
import { Icon } from './Icon.jsx'

// AC-03: shown on 409 DUPLICATE_CARE
export function DuplicateWarningDialog({ warning, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-title" aria-describedby="duplicate-message">
        <div className="dialog__icon">
          <Icon name="alert" size={24} />
        </div>
        <h2 id="duplicate-title" className="card-title">Possible duplicate care</h2>
        <p id="duplicate-message" className="dialog__message">
          {warning.message}
        </p>
        {warning.retryError && <p className="form-error">{warning.retryError}</p>}
        <div className="dialog__actions">
          <button ref={cancelRef} type="button" className="btn btn--primary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger-outline" onClick={onConfirm} disabled={busy}>
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  )
}
