import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CARE_TYPES, careTypeLabel, createCareEvent } from '../../api/careEvents.js'
import { apiError } from '../../api/client.js'
import { listPets } from '../../api/pets.js'
import { Field } from '../../components/Field.jsx'
import { PetAvatar } from '../../components/PetAvatar.jsx'
import { StatusBadge } from '../../components/StatusBadge.jsx'
import { useSession } from '../../context/session.js'
import { useApi } from '../../hooks/useApi.js'
import { defaultSchedule, formatDayTime, formatTime, toISODateTime } from '../../lib/format.js'

export function AddCareEventPage() {
  const { household } = useSession()
  const pets = useApi(() => listPets(household.id), `pets:${household.id}`)

  if (pets.error) {
    return (
      <div className="notice notice--error" role="alert">
        {pets.error.message}
      </div>
    )
  }
  if (!pets.data) return null
  if (pets.data.length === 0) {
    return (
      <div className="notice notice--error" role="alert">
        Add a pet first.
      </div>
    )
  }
  return <CareEventForm pets={pets.data} />
}

function CareEventForm({ pets }) {
  const navigate = useNavigate()
  const { members, user } = useSession()
  const [searchParams] = useSearchParams()

  const requestedPet = Number(searchParams.get('petId'))
  const [values, setValues] = useState(() => {
    const schedule = defaultSchedule()
    return {
      petId: pets.some((pet) => pet.id === requestedPet) ? requestedPet : pets[0].id,
      type: 'feeding',
      title: '',
      date: schedule.date,
      time: schedule.time,
      assignedToId: String(user?.id ?? members[0]?.id ?? ''),
      note: '',
    }
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  const pet = pets.find((item) => item.id === values.petId)
  const assignee = members.find((member) => member.id === Number(values.assignedToId))
  const scheduledAt = toISODateTime(values.date, values.time)
  const title = values.title.trim() || careTypeLabel(values.type)

  const set = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!scheduledAt) {
      setFieldErrors({ scheduledAt: 'is required' })
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createCareEvent(values.petId, {
        type: values.type,
        title,
        scheduledAt,
        assignedToId: values.assignedToId ? Number(values.assignedToId) : null,
        note: values.note,
      })
      navigate(`/pets/${values.petId}`)
    } catch (error) {
      const failure = apiError(error)
      setFieldErrors(failure.fields)
      setFormError(failure.message)
      setSaving(false)
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h1>Add Care Event</h1>
          <p className="page-subtitle">Schedule a one-off task</p>
        </div>
      </header>

      <div className="two-column">
        <form className="card form" onSubmit={submit} noValidate>
          {formError && (
            <div className="notice notice--error" role="alert">
              {formError}
            </div>
          )}

          <Field label="Pet" htmlFor="care-pet">
            <select id="care-pet" value={values.petId} onChange={(e) => set('petId', Number(e.target.value))}>
              {pets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>

          <fieldset className="field">
            <legend>Event type</legend>
            <div className="pill-group" role="radiogroup">
              {CARE_TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={values.type === option.value}
                  className={`pill ${values.type === option.value ? 'pill--active' : ''}`}
                  onClick={() => set('type', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {fieldErrors.type && <span className="field__error">Event type {fieldErrors.type}</span>}
          </fieldset>

          <Field label="Title" htmlFor="care-title" error={fieldErrors.title}>
            <input
              id="care-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={80}
            />
          </Field>

          <div className="form-grid">
            <Field label="Start Date" htmlFor="care-date" error={fieldErrors.scheduledAt}>
              <input id="care-date" type="date" value={values.date} onChange={(e) => set('date', e.target.value)} required />
            </Field>
            <Field label="Time" htmlFor="care-time">
              <input id="care-time" type="time" value={values.time} onChange={(e) => set('time', e.target.value)} required />
            </Field>
          </div>

          <Field label="Assign to" htmlFor="care-assignee" error={fieldErrors.assignedToId}>
            <select id="care-assignee" value={values.assignedToId} onChange={(e) => set('assignedToId', e.target.value)}>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes" htmlFor="care-note" error={fieldErrors.note}>
            <input
              id="care-note"
              value={values.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Optional"
              maxLength={500}
            />
          </Field>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save event'}
            </button>
            <Link to={`/pets/${values.petId}`} className="btn btn--outline">
              Cancel
            </Link>
          </div>
        </form>

        <div className="side-stack">
          <div className="card">
            <h2 className="card-title card-title--ruled">Preview</h2>
            <div className="preview-row">
              <PetAvatar pet={pet} size="md" showInitial />
              <div className="preview-row__text">
                <strong>{title}</strong>
                <span className="muted">
                  {[pet?.name, assignee?.name, scheduledAt && formatDayTime(scheduledAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <StatusBadge status="upcoming" />
            </div>
            <p className="muted small">
              Assigned to {assignee?.name}. Appears on the Dashboard and in Pet Detail.
            </p>
          </div>

          <div className="card">
            <h2 className="card-title">Reminders</h2>
            <p className="muted small">
              {assignee?.name} is alerted at {scheduledAt ? formatTime(scheduledAt) : '--:--'}. If it is
              missed, it moves to Alert Center as Overdue.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
