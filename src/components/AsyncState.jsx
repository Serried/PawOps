import { Link } from 'react-router-dom'
import { isRecoverableError } from '../api/client.js'
import { errorPresentation } from '../lib/errors.js'
import { Icon } from './Icon.jsx'

export function PageLoading({ label = 'Loading…', rows = 3 }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-9 w-64 animate-pulse rounded-xl bg-[#f2eae9]" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-2xl border border-[var(--line)] bg-white" />
      ))}
    </div>
  )
}

export function EmptyState({ title, message, actionLabel, actionTo, icon = 'paw' }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-white px-6 py-10 text-center shadow-[var(--shadow)]">
      <Icon name={icon} size={30} className="text-[var(--primary-strong)]" />
      <strong className="text-lg">{title}</strong>
      {message && <p className="m-0 text-[var(--muted)]">{message}</p>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn btn--primary mt-2">{actionLabel}</Link>
      )}
    </div>
  )
}

export function RequestError({ error, resourceName, onRetry, backTo, backLabel = 'Go back', forbiddenTitle }) {
  const basePresentation = errorPresentation(error, resourceName)
  const presentation = error?.status === 403 && forbiddenTitle
    ? { ...basePresentation, title: forbiddenTitle }
    : basePresentation
  const retryable = Boolean(onRetry) && isRecoverableError(error)
  return (
    <div className="flex max-w-2xl flex-col items-start gap-2.5 rounded-[var(--radius)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-6" role="alert">
      <Icon name="alert" size={28} className="text-[var(--danger)]" />
      <h1 className="text-2xl">{presentation.title}</h1>
      <p className="m-0 text-[var(--muted)]">{presentation.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {retryable && <button type="button" className="btn btn--primary" onClick={onRetry}>Try again</button>}
        {backTo && <Link to={backTo} className="btn btn--outline">{backLabel}</Link>}
      </div>
    </div>
  )
}

export function StatusNotice({ type = 'success', children }) {
  const error = type === 'error'
  return (
    <div
      className={`mb-[18px] rounded-[var(--radius-sm)] border px-4 py-3 ${error ? 'border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]' : 'border-[#b9dfc8] bg-[var(--primary-soft)] text-[var(--primary-ink)]'}`}
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  )
}

