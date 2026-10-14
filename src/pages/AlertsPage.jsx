import { useMemo, useState } from 'react'
import { listCareEvents, completeCareEvent, careTypeLabel } from '../api/careEvents.js'
import { useSession } from '../context/session.js'
import { useApi } from '../hooks/useApi.js'
import { formatDayTime } from '../lib/format.js'
import { Icon } from '../components/Icon.jsx'

function dueLabel(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.max(1, Math.round(Math.abs(diff) / 60000))
  if (mins < 60) return `${mins} min${mins===1?'':'s'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ${mins % 60} min`
  return `${Math.floor(hours/24)} d ${hours%24} h`
}
export function AlertsPage() {
  const { household } = useSession()
  const [version, setVersion] = useState(0)
  const [filter, setFilter] = useState('all')
  const [readIds, setReadIds] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const events = useApi(() => listCareEvents({ householdId: household.id, limit: 200 }), `alerts:${household.id}:${version}`)
  async function done(event) {
    setBusy(event.id); setError('')
    try { await completeCareEvent(event.id); setVersion(v=>v+1) }
    catch (e) { setError(e.response?.data?.error?.message || 'Could not complete this task.') }
    finally { setBusy(null) }
  }
  const rows = useMemo(() => (events.data || []).filter(e => {
    const completedLate = e.status === 'done' && e.completedAt && new Date(e.completedAt) > new Date(e.scheduledAt)
    return e.status === 'overdue' || completedLate
  }).sort((a,b) => new Date(b.scheduledAt)-new Date(a.scheduledAt)), [events.data])
  const unread = rows.filter(e=>!readIds.includes(e.id))
  const visible = rows.filter(e => filter === 'all' || (filter === 'unread' && !readIds.includes(e.id)) || (filter === 'overdue' && e.status === 'overdue'))
  function markRead(id) { setReadIds(old=>old.includes(id)?old:[...old,id]) }
  if (events.error) return <div className="notice notice--error" role="alert">{events.error.message}</div>
  return <section className="alerts-screen">
    <header className="page-header alerts-page-header"><div><h1>Alerts</h1><p className="page-subtitle">Missed and overdue routines</p></div><div className="alerts-header-actions"><span className="alerts-unread-count">Unread · {unread.length}</span><button type="button" className="btn btn--outline btn--small" onClick={()=>setVersion(v=>v+1)}><Icon name="refresh-cw" size={14}/> Refresh</button></div></header>
    {error && <div className="notice notice--error" role="alert">{error}</div>}
    <div className="alerts-toolbar"><div><span className="alerts-toolbar-label">Alerts</span><p className="muted">Review missed care and recently completed late tasks.</p></div><div className="alerts-filters" aria-label="Filter alerts">{[['all','All'],['unread','Unread'],['overdue','Overdue']].map(([value,label])=><button type="button" key={value} className={filter===value?'is-active':''} onClick={()=>setFilter(value)}>{label}{value==='unread' ? ` ${unread.length}` : ''}</button>)}</div></div>
    {!events.data ? <div className="card"><p className="muted">Loading alerts…</p></div> : <div className="card alerts-table-card">
      <div className="alerts-table-wrap"><table className="alerts-table"><thead><tr><th>Pet · Routine</th><th>Due</th><th>Overdue by</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>
        {visible.map(e => {
          const lateDone = e.status==='done' && e.completedAt && new Date(e.completedAt)>new Date(e.scheduledAt)
          const isRead = readIds.includes(e.id)
          return <tr key={e.id} className={isRead?'is-read':''}>
            <td><div className="alert-name"><span className={`alert-pet-icon ${e.type==='medication'?'alert-pet-icon--rose':e.type==='walk'?'alert-pet-icon--blue':'alert-pet-icon--mint'}`}><Icon name={e.type==='walk'?'footprints':e.type==='medication'?'pill':'utensils'} size={16}/></span><div><strong>{e.petName} · {e.title}</strong><small>{careTypeLabel(e.type)}{e.assignedTo?.name ? ` · ${e.assignedTo.name}` : ''}</small>{lateDone && <small>Completed late{e.completedBy?.name ? ` by ${e.completedBy.name}` : ''} at {formatDayTime(e.completedAt)}</small>}</div></div></td>
            <td className="alert-due">{formatDayTime(e.scheduledAt)}</td>
            <td className={e.status==='overdue'?'alert-late':''}>{e.status==='overdue' ? `${dueLabel(e.scheduledAt)} overdue` : lateDone ? `${dueLabel(e.completedAt)} late` : '—'}</td>
            <td><span className={`status-badge ${e.status==='overdue'?'status-badge--overdue':lateDone?'status-badge--muted':'status-badge--done'}`}>{e.status==='overdue'?'Overdue':lateDone?'Read':'Upcoming'}</span></td>
            <td className="alert-action">{e.status==='overdue' ? <button type="button" className="btn btn--primary btn--small" disabled={busy===e.id} onClick={()=>done(e)}>{busy===e.id?'Saving…':'Mark as done'}</button> : <button type="button" className="btn btn--quiet btn--small" onClick={()=>markRead(e.id)} disabled={isRead}>{isRead?'Read':'Mark as read'}</button>}</td>
          </tr>
        })}
        {visible.length===0 && <tr><td colSpan="5" className="alerts-empty"><span className="routine-empty-icon"><Icon name="check-circle" size={22}/></span><strong>{filter==='unread'?'You’re all caught up':'No alerts to show'}</strong><p className="muted">When a routine is missed or completed late, it will appear here.</p></td></tr>}
      </tbody></table></div>
    </div>}
  </section>
}
