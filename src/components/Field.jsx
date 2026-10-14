export function Field({ label, htmlFor, error, children, className = '' }) {
  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && (
        <span className="field__error" role="alert">
          {label} {error}
        </span>
      )}
    </div>
  )
}
