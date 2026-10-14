import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { completeCareEvent, listPetEvents } from '../../api/careEvents.js'
import { getPet } from '../../api/pets.js'
import { Icon } from '../../components/Icon.jsx'
import { PetAvatar } from '../../components/PetAvatar.jsx'
import { StatusBadge } from '../../components/StatusBadge.jsx'
import { useApi } from '../../hooks/useApi.js'
import { useDuplicateGuard } from '../../hooks/useDuplicateGuard.jsx'
import {
  formatAge,
  formatBirthDate,
  formatDayTime,
  formatTime,
  formatTimelineTime,
  groupByDay,
  isToday,
  timelineSentence,
} from '../../lib/format.js'

async function loadEvents(petId) {
  const [open, done] = await Promise.all([
    listPetEvents(petId, { status: 'open' }),
    listPetEvents(petId, { status: 'done', limit: 50 }),
  ])
  // Open tasks + today's done ones (as in the design)
  const routines = [...open, ...done.filter((event) => isToday(event.scheduledAt))].sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt),
  )
  return { routines, done }
}

function scheduledLabel(event) {
  return isToday(event.scheduledAt)
    ? `Scheduled ${formatTime(event.scheduledAt)}`
    : `Scheduled ${formatDayTime(event.scheduledAt)}`
}

export function PetProfilePage() {
  const { petId } = useParams()
  const pet = useApi(() => getPet(petId), `pet:${petId}`)
  const events = useApi(() => loadEvents(petId), `pet-events:${petId}`)
  const { run, dialog } = useDuplicateGuard()
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const markDone = async (event) => {
    setBusyId(event.id)
    setActionError(null)
    try {
      await run((override) => completeCareEvent(event.id, { override }), events.reload)
    } catch (error) {
      setActionError(error.message)
    } finally {
      setBusyId(null)
    }
  }

  if (pet.error) {
    return (
      <section>
        <Link to="/pets" className="back-link">
          <Icon name="back" size={16} /> My Pets
        </Link>
        <div className="notice notice--error" role="alert">
          {pet.error.status === 403 ? "You don't have access to this pet." : pet.error.message}
        </div>
      </section>
    )
  }
  if (!pet.data) return null

  const profile = pet.data
  const age = formatAge(profile.birthDate)
  const born = formatBirthDate(profile.birthDate)
  const timeline = groupByDay(events.data?.done ?? [], (event) => event.completedAt)

  return (
    <section>
      {dialog}
      <Link to="/pets" className="back-link">
        <Icon name="back" size={16} /> My Pets
      </Link>

      <div className="card profile-header">
        <PetAvatar pet={profile} size="xl" />
        <div className="profile-header__text">
          <h1>{profile.name}</h1>
          <p className="profile-header__kind">
            {[profile.species, profile.breed].filter(Boolean).join(' · ')}
          </p>
          <p className="muted">{[age, born && `born ${born}`].filter(Boolean).join(' · ')}</p>
        </div>
        <Link to={`/pets/${profile.id}/edit`} className="btn btn--outline">
          Edit profile
        </Link>
      </div>

      {(events.error || actionError) && (
        <div className="notice notice--error" role="alert">
          {actionError ?? events.error.message}
        </div>
      )}

      <div className="profile-columns">
        <div className="card">
          <div className="card-heading">
            <h2 className="card-title">Routines</h2>
            <Link to="/routines" className="text-link">
              Manage
            </Link>
          </div>
          <ul className="task-list">
            {events.data?.routines.map((event) => (
              <li key={event.id} className={`task-row ${event.status === 'overdue' ? 'task-row--overdue' : ''}`}>
                <span className="care-icon">
                  <Icon name={event.type} />
                </span>
                <div className="task-row__text">
                  <strong>{event.title}</strong>
                  <span className="muted">{scheduledLabel(event)}</span>
                </div>
                {event.status === 'done' ? (
                  <span className="muted task-row__by">
                    by {event.completedBy?.name} · {formatTime(event.completedAt)}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    onClick={() => markDone(event)}
                    disabled={busyId !== null}
                  >
                    {busyId === event.id ? 'Saving…' : 'Mark as Done'}
                  </button>
                )}
                <StatusBadge status={event.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2 className="card-title">Care timeline</h2>
          {timeline.map((group) => (
            <div key={group.label} className="timeline-group">
              <h3 className="timeline-group__label">{group.label}</h3>
              <ul className="timeline">
                {group.events.map((event) => {
                  const sentence = timelineSentence(event.type, profile.name, event.completedBy?.name)
                  return (
                    <li key={event.id} className="timeline-item">
                      <span className="care-icon">
                        <Icon name={event.type} />
                      </span>
                      <div className="timeline-item__text">
                        <p>
                          <strong>{sentence.pet}</strong>
                          {sentence.middle}
                          <strong>{sentence.user}</strong>
                        </p>
                        {event.note && <p className="muted">“{event.note}”</p>}
                      </div>
                      <time className="timeline-item__time" dateTime={event.completedAt}>
                        {formatTimelineTime(event.completedAt)}
                      </time>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
