import { useEffect, useMemo, useState } from 'react'
import { careTypeLabel, completeCareEvent, listCareEvents } from '../api/careEvents.js'
import { Icon } from '../components/Icon.jsx'
import { useSession } from '../context/session.js'
import { useApi } from '../hooks/useApi.js'
import { useDuplicateGuard } from '../hooks/useDuplicateGuard.jsx'
import { formatDayTime } from '../lib/format.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const GRACE_MS = 15 * MINUTE
const RECENT_MS = 7 * DAY
const READ_KEY = 'pawops-alerts-read'

const FILTERS = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['overdue', 'Overdue'],
]

function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  const hours = Math.floor(minutes / 60)
  if (hours < 1) return `${minutes} min`
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

function isCompletedLate(event) {
  return (
    event.status === 'done' &&
    Boolean(event.completedAt) &&
    new Date(event.completedAt) - new Date(event.scheduledAt) > GRACE_MS
  )
}


function loadReadIds() {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveReadIds(value) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(value))
  } catch {
  }
}

function alertIconTone(type) {
  if (type === 'medication') return 'rose'
  if (type === 'walk') return 'blue'
  return 'mint'
}

export function AlertsPage() {
  const { household } = useSession()
  const events = useApi(
    () => listCareEvents({ householdId: household.id, limit: 200 }),
    `alerts:${household.id}`,
  )
  const { run, dialog } = useDuplicateGuard()
  const [filter, setFilter] = useState('all')
  const [readIds, setReadIds] = useState(loadReadIds)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    saveReadIds(readIds)
  }, [readIds])

  const readSet = useMemo(() => new Set(readIds[household.id] ?? []), [readIds, household.id])

  const rows = useMemo(
    () =>
      (events.data ?? [])
        .filter(
          (event) =>
            event.status === 'overdue' ||
            (isCompletedLate(event) && now - new Date(event.completedAt) < RECENT_MS),
        )
        .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)),
    [events.data, now],
  )

  const unreadCount = rows.filter((event) => !readSet.has(event.id)).length
  const visible = rows.filter(
    (event) =>
      filter === 'all' ||
      (filter === 'unread' && !readSet.has(event.id)) ||
      (filter === 'overdue' && event.status === 'overdue'),
  )

  function markRead(id) {
    setReadIds((old) => ({
      ...old,
      [household.id]: [...new Set([...(old[household.id] ?? []), id])],
    }))
  }

  function refresh() {
    setNow(Date.now())
    events.reload()
  }

  async function markDone(event) {
    setBusyId(event.id)
    setError('')
    try {
      await run((override) => completeCareEvent(event.id, { override }), () => events.reload())
    } catch (err) {
      setError(err.message)
      // Somebody else finished it first: show the current state
      if (err.code === 'ALREADY_DONE') events.reload()
    } finally {
      setBusyId(null)
    }
  }

  if (events.error) {
    return (
      <div className="notice notice--error" role="alert">
        {events.error.message}
      </div>
    )
  }

  return (
    <section className="alerts-screen">
      <header className="page-header alerts-page-header">
        <div>
          <h1>Alerts</h1>
          <p className="page-subtitle">Missed and overdue care</p>
        </div>
        <div className="alerts-header-actions">
          <span className="alerts-unread-count">Unread · {unreadCount}</span>
          <button
            type="button"
            className="btn btn--outline btn--small"
            disabled={events.refreshing}
            onClick={refresh}
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}

      <div className="alerts-toolbar">
        <div>
          <span className="alerts-toolbar-label">Alerts</span>
          <p className="muted">
            Care that is overdue now, and tasks finished more than 15 minutes late in the last 7 days.
          </p>
        </div>
        <div className="alerts-filters" aria-label="Filter alerts">
          {FILTERS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'is-active' : ''}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              {value === 'unread' ? ` ${unreadCount}` : ''}
            </button>
          ))}
        </div>
      </div>

      {!events.data ? (
        <div className="card">
          <p className="muted">Loading alerts…</p>
        </div>
      ) : (
        <div className="card alerts-table-card">
          <div className="alerts-table-wrap">
            <table className="alerts-table">
              <thead>
                <tr>
                  <th>Pet · Routine</th>
                  <th>Due</th>
                  <th>Late by</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((event) => {
                  const overdue = event.status === 'overdue'
                  const isRead = readSet.has(event.id)
                  const lateBy = overdue
                    ? now - new Date(event.scheduledAt)
                    : new Date(event.completedAt) - new Date(event.scheduledAt)
                  return (
                    <tr key={event.id} className={isRead ? 'is-read' : ''}>
                      <td>
                        <div className="alert-name">
                          <span className={`alert-pet-icon alert-pet-icon--${alertIconTone(event.type)}`}>
                            <Icon name={event.type} size={16} />
                          </span>
                          <div>
                            <strong>
                              {event.petName} · {event.title}
                            </strong>
                            <small>
                              {careTypeLabel(event.type)}
                              {event.assignedTo?.name ? ` · ${event.assignedTo.name}` : ''}
                            </small>
                            {!overdue && (
                              <small>
                                Completed{event.completedBy?.name ? ` by ${event.completedBy.name}` : ''}{' '}
                                at {formatDayTime(event.completedAt)}
                              </small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="alert-due">{formatDayTime(event.scheduledAt)}</td>
                      <td className={overdue ? 'alert-late' : ''}>{formatDuration(lateBy)}</td>
                      <td>
                        <span className={`status-badge ${overdue ? 'status-badge--overdue' : 'status-badge--muted'}`}>
                          {overdue ? 'Overdue' : 'Completed late'}
                        </span>
                      </td>
                      <td className="alert-action">
                        {overdue && (
                          <button
                            type="button"
                            className="btn btn--primary btn--small"
                            disabled={busyId === event.id}
                            onClick={() => markDone(event)}
                          >
                            {busyId === event.id ? 'Saving…' : 'Mark as done'}
                          </button>
                        )}{' '}
                        <button
                          type="button"
                          className="btn btn--quiet btn--small"
                          disabled={isRead}
                          onClick={() => markRead(event.id)}
                        >
                          {isRead ? 'Read' : 'Mark as read'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan="5" className="alerts-empty">
                      <span className="routine-empty-icon">
                        <Icon name="check" size={22} />
                      </span>
                      <strong>{filter === 'unread' ? 'You’re all caught up' : 'No alerts to show'}</strong>
                      <p className="muted">When care is missed or completed late, it will appear here.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {dialog}
    </section>
  )
}
