import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Brand, Avatar, Feedback } from './ui.jsx'
import HouseholdMembers from './HouseholdMembers.jsx'

export default function Households({ user, onLogout }) {
  const [households, setHouseholds] = useState([])
  const [selected, setSelected] = useState(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const userName = user.display_name || user.email.split('@')[0]
  const household = households.find((item) => item.id === selected)
  useEffect(() => {
    let active = true
    api('households').then((data) => { if (active) setHouseholds(data.households) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function save(event, join = false) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const data = await api(join ? 'invites/join' : 'households', join ? { code } : { name })
      setHouseholds((current) => [...current, data.household])
      setName(''); setCode(''); setSelected(data.household.id)
      setNotice(join ? 'You joined the household.' : 'Household created. You are the owner.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true); setError('')
    try { await onLogout() } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function leave() {
    const warning = household.role === 'owner' ? 'If you are the last owner, this household and its pets will be deleted for everyone. Leave household?' : 'Leave this household?'
    if (!window.confirm(warning)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const data = await api(`households/${household.id}/leave`, {})
      setHouseholds((current) => current.filter((item) => item.id !== household.id)); setSelected(null)
      setNotice(data.householdDeleted ? 'Household deleted because no owners remain.' : 'You left the household.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  if (household) return <div className="workspace">
    <aside className="sidebar">
      <Brand />
      <label className="household-switch">Household<select value={selected} onChange={(e) => { setSelected(e.target.value); setError(''); setNotice('') }}>{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <nav aria-label="Main navigation"><button className="nav-link" onClick={() => { setSelected(null); setNotice('') }}>⌂ Households</button><button className="nav-link active" aria-current="page">♧ Members</button></nav>
      <div className="sidebar-bottom"><div className="user-identity"><Avatar name={userName} /><div><strong>{userName}</strong><small>{household.role === 'owner' ? 'Owner' : 'Member'}</small></div></div><button className="text-button" disabled={busy} onClick={logout}>Log out</button></div>
    </aside>
    <main className="workspace-main">
      <header className="page-header"><div><h1>Household Members</h1><p className="muted">Who takes care of your pets · {household.name}</p></div><button className="outline danger" disabled={busy} onClick={leave}>Leave household</button></header>
      <Feedback error={error} notice={notice} />
      <HouseholdMembers key={household.id} household={household} />
    </main>
  </div>
  return <div className="onboarding">
    <header className="topbar"><Brand /><div className="topbar-user"><Avatar name={userName} /><span>{userName}</span><button className="outline" onClick={logout} disabled={busy}>Log out</button></div></header>
    <main className="onboarding-main">
      <div className="steps"><span>1. Account created</span><span className="badge">2. Household</span></div>
      <h1>Welcome to PawOps, {userName}</h1>
      <p className="intro muted">A household is the shared space for your pets and everyone who cares for them.<br />Create one or join an existing one to get started.</p>
      <Feedback error={error} notice={notice} />
      {loading ? <p role="status">Loading households…</p> : <>
        {households.length > 0 && <section className="household-choices" aria-label="Your households">{households.map((item) => <button className="household-choice" key={item.id} onClick={() => { setSelected(item.id); setNotice('') }}><Avatar name={item.name} /><span><strong>{item.name}</strong><small>{item.role === 'owner' ? 'Owner' : 'Member'}</small></span><span className="choice-arrow">→</span></button>)}</section>}
        <div className="setup-grid">
          <section className="panel"><span className="badge">Recommended for new households</span><h2>Create a household</h2><p className="muted">Start fresh, then add pets, routines and invite caretakers.</p><form onSubmit={save}><label>Household name<input required maxLength={100} placeholder="e.g. Tanakrit’s Home" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} /></label><button className="primary" disabled={busy || !name.trim()}>{busy ? 'Please wait…' : 'Create household'}</button></form></section>
          <section className="panel"><span className="badge neutral">Joining someone?</span><h2>Join a household</h2><p className="muted">Ask an owner for the code you were given.</p><form onSubmit={(event) => save(event, true)}><label>Enter an invite code<input required maxLength={20} placeholder="PAW-XXXXXXXXXXXXXXXX" autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} disabled={busy} /></label><button className="outline" disabled={busy || !code.trim()}>{busy ? 'Please wait…' : 'Join household'}</button></form></section>
        </div>
      </>}
    </main>
  </div>
}
