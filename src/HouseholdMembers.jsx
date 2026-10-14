import { useEffect, useState } from 'react'
import { api } from './api.js'
import { Avatar, Feedback } from './ui.jsx'

export default function HouseholdMembers({ household }) {
  const [members, setMembers] = useState([])
  const [email, setEmail] = useState('')
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const owner = household.role === 'owner'
  useEffect(() => {
    let active = true
    Promise.all([api(`households/${household.id}/members`), owner ? api(`invites/${household.id}`) : Promise.resolve({ invite: null })])
      .then(([data, inviteData]) => { if (active) { setMembers(data.members); setInvite(inviteData.invite) } })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [household.id, owner])
  async function add(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const data = await api(`households/${household.id}/members`, { email })
      setMembers((current) => [...current, data.member]); setEmail(''); setNotice('Member added to the household.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function generate() {
    if (invite && !window.confirm('Replace this invite code? The old code will stop working.')) return
    setBusy(true); setError(''); setNotice('')
    try { const data = await api(`invites/${household.id}`, {}); setInvite(data.invite); setNotice('Invite code ready to share.') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(invite.code); setNotice('Invite code copied.'); setError('') }
    catch { setError('Could not copy automatically. Select the code and copy it manually.') }
  }
  return <>
    <Feedback error={error} notice={notice} />
    <div className={`members-grid ${owner ? '' : 'members-only'}`}>
      <section className="panel member-list" aria-label="Household members">
        {loading ? <p role="status">Loading members…</p> : <table><thead><tr><th>Member</th><th>Role</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><div className="user-identity"><Avatar name={member.display_name || member.email} /><div><strong>{member.display_name || member.email.split('@')[0]}</strong><small>{member.email}</small></div></div></td><td><span className={`badge ${member.role === 'owner' ? 'owner-badge' : ''}`}>{member.role === 'owner' ? 'Owner' : 'Member'}</span></td></tr>)}</tbody></table>}
      </section>
      {owner && <aside className="member-tools">
        <section className="panel"><h2>Add a member</h2><p className="muted">Add someone who already has a PawOps account.</p><form onSubmit={add}><label>Email<input type="email" required maxLength={254} placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy || loading} /></label><button className="primary" disabled={busy || loading}>{busy ? 'Please wait…' : 'Add member'}</button></form></section>
        <section className="panel"><h2>Invite code</h2><p className="muted">Share this code. New users can enter it after signing up.</p>{invite ? <><div className="invite-code"><code>{invite.code}</code><button className="text-button" onClick={copy} aria-label="Copy invite code">Copy</button></div><small>Expires {new Date(invite.expires_at).toLocaleDateString()}</small></> : <p className="muted">Generate a code to invite your caretakers.</p>}<button className="outline full-width" disabled={busy || loading} onClick={generate}>{invite ? 'Replace code' : 'Generate invite code'}</button></section>
      </aside>}
    </div>
  </>
}
