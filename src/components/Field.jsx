import { cloneElement, isValidElement } from 'react'

export function Field({ label, htmlFor, error, children, className = '' }) {
  const errorId = `${htmlFor}-error`
  const control = isValidElement(children)
    ? cloneElement(children, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : children.props['aria-describedby'],
      })
    : children
  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {control}
      {error && (
        <span id={errorId} className="field__error" role="alert">
          {label} {error}
        </span>
      )}
    </div>
  )
}
