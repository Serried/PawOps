import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { CARE_TYPES } from '../api/careEvents.js'
import { listPets } from '../api/pets.js'
import { Icon } from '../components/Icon.jsx'
import { PetAvatar } from '../components/PetAvatar.jsx'
import { useSession } from '../context/session.js'
import { useApi } from '../hooks/useApi.js'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TYPE_LABELS = { feeding: 'Feed', water: 'Water', walk: 'Walk', medication: 'Medication', vet_visit: 'Vet visit', grooming: 'Grooming' }
const TYPE_COLORS = { feeding: 'mint', water: 'blue', walk: 'rose', medication: 'sand', vet_visit: 'blue', grooming: 'rose' }

export function RoutinesPage() {
  const { household, members } = useSession()
  const pets = useApi(() => listPets(household.id), `routine-pets:${household.id}`)
  const [routines, setRoutines] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ petId: '', type: 'feeding', title: '', time: '08:00', daysOfWeek: [0,1,2,3,4,5,6], assignedToId: '', startDate: new Date().toISOString().slice(0,10) })

  async function load() {
    try {
      const { data } = await api.get('/routines', { params: { householdId: household.id } })
      setRoutines(data.routines)
      setError('')
    } catch (e) {
      setError(e.response?.data?.error?.message || 'Could not load routines.')
    }
  }
  useEffect(() => { load() }, [household.id])
  function change(key, value) { setForm(old => ({ ...old, [key]: value })) }
  function openModal() {
    setForm({ petId: pets.data?.[0] ? String(pets.data[0].id) : '', type: 'feeding', title: '', time: '08:00', daysOfWeek: [0,1,2,3,4,5,6], assignedToId: '', startDate: new Date().toISOString().slice(0,10) })
    setNotice(''); setError(''); setEditingId(null); setModal(true)
  }
  async function submit(e) {
    e.preventDefault()
    if (!form.petId) { setError('Add a pet before creating a routine.'); return }
    setSaving(true); setError('')
    try {
      const values = { ...form, petId: Number(form.petId), assignedToId: form.assignedToId ? Number(form.assignedToId) : null, title: form.title.trim() || TYPE_LABELS[form.type] }
      if (editingId) await api.patch(`/routines/${editingId}`, values)
      else await api.post('/routines', values)
      setModal(false); setEditingId(null); setNotice(editingId ? 'Routine updated successfully.' : 'Routine created successfully.')
      await load()
    } catch (err) { setError(err.response?.data?.error?.message || 'Could not save routine.') }
    finally { setSaving(false) }
  }
  async function removeRoutine(routine) {
    if (!window.confirm(`Delete the ${routine.title} routine?`)) return
    try { await api.delete(`/routines/${routine.id}`); setNotice('Routine deleted.'); await load() }
    catch (e) { setError(e.response?.data?.error?.message || 'Could not delete routine.') }
  }
  async function toggle(routine) {
    setError('')
    try { await api.patch(`/routines/${routine.id}`, { active: !routine.active }); await load() }
    catch (e) { setError(e.response?.data?.error?.message || 'Could not update routine.') }
  }
  const [previewEvents, setPreviewEvents] = useState([])
  useEffect(() => {
    if (!household?.id) return
    let cancelled = false
    import('../api/careEvents.js').then(({listCareEvents}) => listCareEvents({householdId:household.id,limit:200})).then(data => {
      if (!cancelled) setPreviewEvents(Array.isArray(data) ? data : data?.events || [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [household?.id, routines])
  const grouped = (pets.data || []).map(pet => ({ pet, routines: (routines || []).filter(r => r.petId === pet.id) })).filter(group => group.routines.length)
  return <section className="routine-screen">
    <header className="page-header routine-page-header">
      <div><h1>Routines</h1><p className="page-subtitle">Recurring care that should happen every day. Missing one raises an alert 15 minutes after its time.</p></div>
      <button type="button" className="btn btn--primary" onClick={openModal}><Icon name="plus" size={16}/> Add routine</button>
    </header>
    {error && <div className="notice notice--error" role="alert">{error}</div>}
    {notice && <div className="notice notice--success" role="status">{notice}</div>}
    {!routines || !pets.data ? <div className="card"><p className="muted">Loading routines…</p></div> : pets.data.length === 0 ? <div className="card routine-empty"><div className="routine-empty-icon"><Icon name="paw-solid" size={24}/></div><h2>No pets yet</h2><p className="muted">Add a pet before setting up a routine.</p><Link className="btn btn--primary" to="/pets/new">Add a pet</Link></div> : routines.length === 0 ? <div className="card routine-empty"><div className="routine-empty-icon"><Icon name="calendar" size={24}/></div><h2>No routines yet</h2><p className="muted">Create a routine to keep your pet’s care on schedule.</p><button className="btn btn--primary" onClick={openModal}>Add routine</button></div> : <div className="routine-groups">
      {grouped.map(({ pet, routines: petRoutines }) => <div className="routine-pet-group" key={pet.id}>
        <div className="routine-pet-heading"><PetAvatar pet={pet} size="md"/><div><h2>{pet.name}</h2><p className="muted">{pet.species}{pet.breed ? ` · ${pet.breed}` : ''}</p></div><Link to={`/pets/${pet.id}`} className="text-link">Open profile <Icon name="arrow-up-right" size={14}/></Link></div>
        <div className="routine-list">
          {petRoutines.map(r => <article className={`routine-row ${!r.active ? 'routine-row--paused' : ''}`} key={r.id}>
            <span className={`routine-type-icon routine-type-icon--${TYPE_COLORS[r.type] || 'mint'}`}><Icon name={r.type === 'walk' ? 'footprints' : r.type === 'medication' ? 'pill' : r.type === 'vet_visit' ? 'stethoscope' : r.type === 'grooming' ? 'scissors' : r.type === 'water' ? 'droplets' : 'utensils'} size={18}/></span>
            <div className="routine-row-main"><div className="routine-title-line"><strong>{r.title}</strong></div><p>{TYPE_LABELS[r.type] || r.type} · {r.time} · {r.daysOfWeek.length === 7 ? 'Every day' : r.daysOfWeek.map(d=>DAYS[d]).join(', ')}</p><small>{r.assignedTo?.name ? `Assigned to ${r.assignedTo.name}` : 'Assigned to anyone'} · Duplicate window 30 min</small></div>
            <div className="routine-row-actions"><span className={`status-badge ${!r.active?'status-badge--muted':(previewEvents.find(e=>e.routineId===r.id && new Date(e.scheduledAt).toDateString()===new Date().toDateString())?.status==='overdue'?'status-badge--overdue':'status-badge--done')}`}>{!r.active?'Paused':previewEvents.find(e=>e.routineId===r.id && new Date(e.scheduledAt).toDateString()===new Date().toDateString())?.status || 'Upcoming'}</span><button className={`routine-switch ${r.active?'is-on':''}`} type="button" role="switch" aria-label={`${r.active?'Pause':'Resume'} ${r.title}`} aria-checked={r.active} onClick={()=>toggle(r)}><span/></button><button className="btn btn--outline btn--small" type="button" onClick={()=>{setForm({petId:String(r.petId),type:r.type,title:r.title,time:r.time,daysOfWeek:r.daysOfWeek,assignedToId:r.assignedTo ? String(r.assignedTo.id) : '',startDate:new Date().toISOString().slice(0,10)});setEditingId(r.id);setNotice('');setError('');setModal(true)}}>Edit</button><button className="btn btn--quiet btn--small danger-text" type="button" onClick={()=>removeRoutine(r)}>Delete</button></div>
          </article>)}
        </div>
      </div>)}
      {grouped.length === 0 && <div className="card routine-empty"><p className="muted">No routines for your pets yet.</p><button className="btn btn--primary" onClick={openModal}>Add routine</button></div>}
    </div>}
    {modal && <div className="routine-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><section className="routine-modal" role="dialog" aria-modal="true" aria-labelledby="routine-modal-title">
      <header className="routine-modal-header"><div><h2 id="routine-modal-title">{editingId ? 'Edit routine' : 'Add routine'}</h2><p>Repeating care that creates tasks automatically</p></div><button className="modal-close" type="button" aria-label="Close" onClick={()=>setModal(false)}>×</button></header>
      <form className="routine-modal-body" onSubmit={submit}>
        <div className="routine-form-preview"><span className="routine-type-icon routine-type-icon--mint"><Icon name="utensils" size={18}/></span><div><strong>{form.title || TYPE_LABELS[form.type] || 'Routine title'}</strong><p>{pets.data?.find(p=>String(p.id)===String(form.petId))?.name || 'Choose a pet'} · {members.find(m=>String(m.id)===String(form.assignedToId))?.name || 'Anyone'} · Today, {form.time}</p><small>Assigned caretaker. Appears on the Dashboard and in Pet Detail.</small></div><span className="status-badge status-badge--done">Upcoming</span></div>
        <div className="field"><label htmlFor="routine-pet">Pet</label><select id="routine-pet" required value={form.petId} onChange={e=>change('petId',e.target.value)}><option value="">Choose a pet</option>{(pets.data||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <fieldset className="field routine-type-field"><legend>Event type</legend><div className="routine-type-options">{CARE_TYPES.map(t=><button type="button" key={t.value} className={`routine-type-choice ${form.type===t.value?'is-selected':''}`} onClick={()=>change('type',t.value)}><Icon name={t.value==='walk'?'footprints':t.value==='medication'?'pill':t.value==='vet_visit'?'stethoscope':t.value==='grooming'?'scissors':'utensils'} size={16}/>{t.label}</button>)}</div></fieldset>
        <div className="field"><label htmlFor="routine-title">Title</label><input id="routine-title" placeholder="e.g. Breakfast" value={form.title} onChange={e=>change('title',e.target.value)} maxLength={80}/></div>
        <div className="routine-form-row"><div className="field"><label htmlFor="routine-start">Start date</label><input id="routine-start" type="date" value={form.startDate || new Date().toISOString().slice(0,10)} onChange={e=>change('startDate',e.target.value)}/></div><div className="field"><label htmlFor="routine-time">Time</label><input id="routine-time" type="time" required value={form.time} onChange={e=>change('time',e.target.value)}/></div></div><div className="routine-form-row"><div className="field"><label htmlFor="routine-assignee">Assign to</label><select id="routine-assignee" value={form.assignedToId} onChange={e=>change('assignedToId',e.target.value)}><option value="">Anyone</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div></div>
        <fieldset className="field"><legend>Repeat</legend><div className="pill-group">{DAYS.map((day,i)=><button type="button" key={day} className={`pill ${form.daysOfWeek.includes(i)?'pill--active':''}`} aria-pressed={form.daysOfWeek.includes(i)} onClick={()=>change('daysOfWeek',form.daysOfWeek.includes(i)?form.daysOfWeek.filter(d=>d!==i):[...form.daysOfWeek,i])}>{day}</button>)}</div></fieldset>
        <div className="field"><label htmlFor="routine-notes">Notes</label><input id="routine-notes" placeholder="Optional" disabled /></div>
        <div className="routine-modal-actions"><button type="button" className="btn btn--outline" onClick={()=>setModal(false)}>Cancel</button><button className="btn btn--primary" disabled={saving || !form.daysOfWeek.length}>{saving?'Saving…':editingId?'Save changes':'Add routine'}</button></div>
      </form>
    </section></div>}
  </section>
}
