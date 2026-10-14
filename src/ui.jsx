export function Paw({ className = '' }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><ellipse cx="5" cy="8" rx="2" ry="2.6" transform="rotate(-20 5 8)"/><ellipse cx="10" cy="4.7" rx="1.9" ry="2.5"/><ellipse cx="15.5" cy="5.5" rx="1.9" ry="2.5" transform="rotate(12 15.5 5.5)"/><ellipse cx="20" cy="10" rx="1.8" ry="2.4" transform="rotate(25 20 10)"/><path d="M6.5 16c1-2 2.5-5 5.5-5s4.6 3 5.5 5c1.7 4-1.5 5-3.5 3.6-1.4-.9-2.6-.9-4 0C7.5 21 4.8 20 6.5 16Z"/></svg>
}
export function Brand() { return <div className="brand"><span className="brand-mark"><Paw /></span><span>PawOps</span></div> }
export function Avatar({ name = '?' }) { return <span className="avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span> }
export function Feedback({ error, notice }) { return <>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}</> }
