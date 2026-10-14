import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiError } from '../api/client.js'
import { CARE_TYPES, listCareEvents } from '../api/careEvents.js'
import { listPets } from '../api/pets.js'
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  setRoutineActive,
  updateRoutine,
} from '../api/routines.js'
import { Icon } from '../components/Icon.jsx'
import { PetAvatar } from '../components/PetAvatar.jsx'
import { useSession } from '../context/session.js'
import { useApi } from '../hooks/useApi.js'
import { isToday, todayISODate } from '../lib/format.js'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const TYPE_LABELS = {
  feeding: 'Feed',
  water: 'Water',
  walk: 'Walk',
  medication: 'Medication',
  vet_visit: 'Vet visit',
  grooming: 'Grooming',
}
const TYPE_COLORS = {
  feeding: 'mint',
  water: 'blue',
  walk: 'rose',
  medication: 'sand',
  vet_visit: 'blue',
  grooming: 'rose',
}
// Only these care types raise the duplicate warning (server BR-03)
const DUPLICATE_CHECKED = ['feeding', 'medication']

function emptyForm(petId = '') {
  return {
    petId,
    type: 'feeding',
    title: '',
    time: '08:00',
    daysOfWeek: ALL_DAYS,
    assignedToId: '',
    startDate: todayISODate(),
  }
}

function repeatLabel(daysOfWeek) {
  return daysOfWeek.length === 7 ? 'Every day' : daysOfWeek.map((day) => DAYS[day]).join(', ')
}

// What the badge on a routine row says, from today's task for that routine
function routineBadge(routine, todayStatus) {
  if (!routine.active) return { label: 'Paused', className: 'status-badge--muted' }
  if (todayStatus === 'overdue') return { label: 'Overdue', className: 'status-badge--overdue' }
  if (todayStatus === 'done') return { label: 'Done', className: '' }
  return { label: 'Upcoming', className: '' }
}

export function RoutinesPage() {
  const { household, members } = useSession()
  const pets = useApi(() => listPets(household.id), `routine-pets:${household.id}`)
  const routines = useApi(() => listRoutines(household.id), `routines:${household.id}`)
  // Listing care events also creates today's task for every active routine
  const events = useApi(
    () => listCareEvents({ householdId: household.id, limit: 200 }),
    `routine-events:${household.id}`,
  )

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (!modal) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])

  const todayStatus = useMemo(() => {
    const byRoutine = new Map()
    for (const event of events.data ?? []) {
      if (event.routineId && isToday(event.scheduledAt)) byRoutine.set(event.routineId, event.status)
    }
    return byRoutine
  }, [events.data])

  const grouped = (pets.data ?? [])
    .map((pet) => ({ pet, routines: (routines.data ?? []).filter((item) => item.petId === pet.id) }))
    .filter((group) => group.routines.length > 0)

  function refresh() {
    routines.reload()
    events.reload()
  }

  function change(key, value) {
    setForm((old) => ({ ...old, [key]: value }))
  }

  function openCreate() {
    setForm(emptyForm(pets.data?.[0] ? String(pets.data[0].id) : ''))
    setNotice('')
    setError('')
    setEditingId(null)
    setModal(true)
  }

  function openEdit(routine) {
    setForm({
      petId: String(routine.petId),
      type: routine.type,
      title: routine.title,
      time: routine.time,
      daysOfWeek: routine.daysOfWeek,
      assignedToId: routine.assignedTo ? String(routine.assignedTo.id) : '',
      startDate: routine.startDate ?? todayISODate(),
    })
    setEditingId(routine.id)
    setNotice('')
    setError('')
    setModal(true)
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.petId) {
      setError('Add a pet before creating a routine.')
      return
    }
    setSaving(true)
    setError('')
    const values = {
      ...form,
      petId: Number(form.petId),
      assignedToId: form.assignedToId ? Number(form.assignedToId) : null,
      title: form.title.trim() || TYPE_LABELS[form.type],
    }
    try {
      if (editingId) await updateRoutine(editingId, values)
      else await createRoutine(values)
      setModal(false)
      setEditingId(null)
      setNotice(editingId ? 'Routine updated successfully.' : 'Routine created successfully.')
      refresh()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setSaving(false)
    }
  }

  async function removeRoutine(routine) {
    if (!window.confirm(`Delete the ${routine.title} routine?`)) return
    setBusyId(routine.id)
    setError('')
    try {
      await deleteRoutine(routine.id)
      setNotice('Routine deleted.')
      refresh()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusyId(null)
    }
  }

  async function toggle(routine) {
    setBusyId(routine.id)
    setError('')
    setNotice('')
    try {
      await setRoutineActive(routine.id, !routine.active)
      refresh()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusyId(null)
    }
  }

  const loadError = routines.error ?? pets.error
  const loading = !routines.data || !pets.data

  return (
    <section className="routine-screen">
      <header className="page-header routine-page-header">
        <div>
          <h1>Routines</h1>
          <p className="page-subtitle">
            Recurring care on a schedule. Missing one raises an alert 15 minutes after its time.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openCreate}>
          <Icon name="plus" size={16} /> Add routine
        </button>
      </header>

      {((error && !modal) || loadError) && (
        <div className="notice notice--error" role="alert">
          {(!modal && error) || loadError.message}
        </div>
      )}
      {notice && (
        <div className="notice notice--success" role="status">
          {notice}
        </div>
      )}

      {loadError ? null : loading ? (
        <div className="card">
          <p className="muted">Loading routines…</p>
        </div>
      ) : pets.data.length === 0 ? (
        <div className="card routine-empty">
          <div className="routine-empty-icon">
            <Icon name="paw-solid" size={24} />
          </div>
          <h2>No pets yet</h2>
          <p className="muted">Add a pet before setting up a routine.</p>
          <Link className="btn btn--primary" to="/pets/new">
            Add a pet
          </Link>
        </div>
      ) : grouped.length === 0 ? (
        <div className="card routine-empty">
          <div className="routine-empty-icon">
            <Icon name="clock" size={24} />
          </div>
          <h2>No routines yet</h2>
          <p className="muted">Create a routine to keep your pet’s care on schedule.</p>
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            Add routine
          </button>
        </div>
      ) : (
        <div className="routine-groups">
          {grouped.map(({ pet, routines: petRoutines }) => (
            <div className="routine-pet-group" key={pet.id}>
              <div className="routine-pet-heading">
                <PetAvatar pet={pet} size="md" />
                <div>
                  <h2>{pet.name}</h2>
                  <p className="muted">
                    {pet.species}
                    {pet.breed ? ` · ${pet.breed}` : ''}
                  </p>
                </div>
                <Link to={`/pets/${pet.id}`} className="text-link">
                  Open profile →
                </Link>
              </div>
              <div className="routine-list">
                {petRoutines.map((routine) => {
                  const badge = routineBadge(routine, todayStatus.get(routine.id))
                  const startsLater = routine.startDate && routine.startDate > todayISODate()
                  return (
                    <article
                      className={`routine-row ${!routine.active ? 'routine-row--paused' : ''}`}
                      key={routine.id}
                    >
                      <span
                        className={`routine-type-icon routine-type-icon--${TYPE_COLORS[routine.type] || 'mint'}`}
                      >
                        <Icon name={routine.type} size={18} />
                      </span>
                      <div className="routine-row-main">
                        <div className="routine-title-line">
                          <strong>{routine.title}</strong>
                        </div>
                        <p>
                          {TYPE_LABELS[routine.type] || routine.type} · {routine.time} ·{' '}
                          {repeatLabel(routine.daysOfWeek)}
                          {startsLater ? ` · Starts ${routine.startDate}` : ''}
                        </p>
                        <small>
                          {routine.assignedTo?.name
                            ? `Assigned to ${routine.assignedTo.name}`
                            : 'Assigned to anyone'}
                          {DUPLICATE_CHECKED.includes(routine.type) ? ' · Duplicate window 30 min' : ''}
                        </small>
                      </div>
                      <div className="routine-row-actions">
                        <span className={`status-badge ${badge.className}`}>{badge.label}</span>
                        <button
                          className={`routine-switch ${routine.active ? 'is-on' : ''}`}
                          type="button"
                          role="switch"
                          aria-label={`${routine.active ? 'Pause' : 'Resume'} ${routine.title}`}
                          aria-checked={routine.active}
                          disabled={busyId === routine.id}
                          onClick={() => toggle(routine)}
                        >
                          <span />
                        </button>
                        <button
                          className="btn btn--outline btn--small"
                          type="button"
                          onClick={() => openEdit(routine)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn--quiet btn--small danger-text"
                          type="button"
                          disabled={busyId === routine.id}
                          onClick={() => removeRoutine(routine)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div
          className="routine-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(false)
          }}
        >
          <section
            className="routine-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="routine-modal-title"
          >
            <header className="routine-modal-header">
              <div>
                <h2 id="routine-modal-title">{editingId ? 'Edit routine' : 'Add routine'}</h2>
                <p>Repeating care that creates tasks automatically</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                onClick={() => setModal(false)}
              >
                ×
              </button>
            </header>
            <form className="routine-modal-body" onSubmit={submit}>
              {error && (
                <div className="notice notice--error" role="alert">
                  {error}
                </div>
              )}
              <div className="routine-form-preview">
                <span className={`routine-type-icon routine-type-icon--${TYPE_COLORS[form.type] || 'mint'}`}>
                  <Icon name={form.type} size={18} />
                </span>
                <div>
                  <strong>{form.title || TYPE_LABELS[form.type] || 'Routine title'}</strong>
                  <p>
                    {pets.data?.find((pet) => String(pet.id) === String(form.petId))?.name ||
                      'Choose a pet'}{' '}
                    ·{' '}
                    {members.find((member) => String(member.id) === String(form.assignedToId))?.name ||
                      'Anyone'}{' '}
                    · {form.time}
                  </p>
                  <small>Assigned caretaker. Appears on the Dashboard and in Pet Detail.</small>
                </div>
                <span className="status-badge">Upcoming</span>
              </div>
              <div className="field">
                <label htmlFor="routine-pet">Pet</label>
                <select
                  id="routine-pet"
                  required
                  value={form.petId}
                  onChange={(event) => change('petId', event.target.value)}
                >
                  <option value="">Choose a pet</option>
                  {(pets.data ?? []).map((pet) => (
                    <option key={pet.id} value={pet.id}>
                      {pet.name}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="field routine-type-field">
                <legend>Event type</legend>
                <div className="routine-type-options">
                  {CARE_TYPES.map((type) => (
                    <button
                      type="button"
                      key={type.value}
                      className={`routine-type-choice ${form.type === type.value ? 'is-selected' : ''}`}
                      aria-pressed={form.type === type.value}
                      onClick={() => change('type', type.value)}
                    >
                      <Icon name={type.value} size={16} />
                      {type.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="routine-title">Title</label>
                <input
                  id="routine-title"
                  placeholder="e.g. Breakfast"
                  value={form.title}
                  onChange={(event) => change('title', event.target.value)}
                  maxLength={80}
                />
              </div>
              <div className="routine-form-row">
                <div className="field">
                  <label htmlFor="routine-start">Start date</label>
                  <input
                    id="routine-start"
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(event) => change('startDate', event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="routine-time">Time</label>
                  <input
                    id="routine-time"
                    type="time"
                    required
                    value={form.time}
                    onChange={(event) => change('time', event.target.value)}
                  />
                </div>
              </div>
              <div className="routine-form-row">
                <div className="field">
                  <label htmlFor="routine-assignee">Assign to</label>
                  <select
                    id="routine-assignee"
                    value={form.assignedToId}
                    onChange={(event) => change('assignedToId', event.target.value)}
                  >
                    <option value="">Anyone</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <fieldset className="field">
                <legend>Repeat</legend>
                <div className="pill-group">
                  {DAYS.map((day, index) => {
                    const selected = form.daysOfWeek.includes(index)
                    return (
                      <button
                        type="button"
                        key={day}
                        className={`pill ${selected ? 'pill--active' : ''}`}
                        aria-pressed={selected}
                        onClick={() =>
                          change(
                            'daysOfWeek',
                            selected
                              ? form.daysOfWeek.filter((d) => d !== index)
                              : [...form.daysOfWeek, index],
                          )
                        }
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <div className="routine-modal-actions">
                <button type="button" className="btn btn--outline" onClick={() => setModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={saving || form.daysOfWeek.length === 0}
                >
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add routine'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
