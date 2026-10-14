import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Brand, Paw, Feedback } from './ui.jsx'
import Households from './Households.jsx'
import './App.css'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    api('auth/me').then((data) => { if (active) setUser(data.user) })
      .catch((err) => { if (active && err.status !== 401) setError('Unable to connect. Please try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const data = await api(`auth/${mode}`, { email, password, displayName })
      setPassword('')
      if (mode === 'register') { setMode('login'); setNotice('Account created. Sign in to choose or join a household.') }
      else setUser(data.user)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function logout() {
    await api('auth/logout', {})
    setUser(null); setPassword(''); setNotice('You have been signed out.'); setError('')
  }
  if (loading) return <main className="session-loading"><Brand /><p role="status">Checking your session…</p></main>
  if (user) return <Households key={user.id} user={user} onLogout={logout} />
  return <main className="auth-layout">
    <aside className="auth-story">
      <Brand />
      <div className="illustration" aria-label="Shared pet care illustration">
        <div className="paw-orbit"><Paw /></div>
        <div className="care-note note-top"><span className="mini-paw"><Paw /></span><div><b>Mochi • Breakfast</b><small>Fed at 8:00</small></div></div>
        <div className="care-note note-bottom"><span className="mini-paw"><Paw /></span><div><b>Walk at 18:00</b><small>Up next</small></div></div>
        <span className="illustration-caption">A LITTLE TEAMWORK. A LOT OF CARE.</span>
      </div>
      <div className="story-copy"><h1>Welcome to PawOps</h1><p>Care for your pets together. See who fed, walked or medicated them, what is due next, and never double up by accident.</p></div>
    </aside>
    <section className="auth-form-area">
      <div className="auth-card">
        <div className="auth-tabs" aria-label="Account access">
          {['login', 'register'].map((value) => <button type="button" aria-pressed={mode === value} className={mode === value ? 'active' : ''} key={value} disabled={busy} onClick={() => { setMode(value); setPassword(''); setError(''); setNotice('') }}>{value === 'login' ? 'Sign in' : 'Create Account'}</button>)}
        </div>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="muted">{mode === 'login' ? 'Sign in to see what your pets need today.' : 'Start sharing pet care with your household.'}</p>
        <form onSubmit={submit}>
          {mode === 'register' && <label>Full name<input autoComplete="name" required maxLength={100} placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={busy} /></label>}
          <label>Email<input type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></label>
          <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={128} placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
          {mode === 'register' && <small>Use at least 8 characters.</small>}
          <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create Account'}</button>
        </form>
        <Feedback error={error} notice={notice} />
      </div>
    </section>
  </main>
}
