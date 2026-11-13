import { useEffect, useState } from 'react'
import { acknowledgeAlert, getAlertsPage } from '../../api/alerts.js'
import { careTypeLabel, completeCareEvent } from '../../api/careEvents.js'
import { apiError } from '../../api/client.js'
import { Icon } from '../../components/Icon.jsx'
import { useSession } from '../../context/session.js'
import { useApi } from '../../hooks/useApi.js'
import { useDuplicateGuard } from '../../hooks/useDuplicateGuard.jsx'
import { formatDayTime } from '../../lib/format.js'

const MINUTE = 60_000
const REFRESH_MS = 30_000

const FILTERS = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['resolved', 'Resolved'],
]

function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  const hours = Math.floor(minutes / 60)
  if (hours < 1) return `${minutes} min`
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

function alertIconTone(type) {
  if (type === 'medication') return 'rose'
  if (type === 'walk') return 'blue'
  return 'mint'
}

export function AlertsPage() {
  const { household } = useSession()
  const [filter, setFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const alerts = useApi(
    () => getAlertsPage({ householdId: household.id, status: filter === 'unread' ? 'active' : filter, limit: 50, offset }),
    `alerts:${household.id}:${filter}:${offset}`,
  )
  const { run, dialog } = useDuplicateGuard()
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const reload = alerts.reload
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
      reload()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload])

  const visible = alerts.data?.alerts ?? []
  const unreadCount = alerts.data?.unreadCount ?? 0
  const pagination = alerts.data?.pagination

  function refresh() {
    setNow(Date.now())
    reload()
  }

  async function markRead(alert) {
    setBusyId(alert.id)
    setError('')
    try {
      await acknowledgeAlert(alert.id)
      reload()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusyId(null)
    }
  }

  async function markDone(alert) {
    setBusyId(alert.id)
    setError('')
    try {
      await run((override) => completeCareEvent(alert.careEvent.id, { override }), () => reload())
    } catch (err) {
      setError(err.message)
      if (['ALREADY_DONE', 'CARE_EVENT_CHANGED'].includes(err.code)) reload()
    } finally {
      setBusyId(null)
    }
  }

  if (alerts.error) {
    return (
      <div className="notice notice--error" role="alert">
        {alerts.error.message}
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
            disabled={alerts.refreshing}
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
        <div className="alerts-filters" aria-label="Filter alerts">
          {FILTERS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'is-active' : ''}
              aria-pressed={filter === value}
              onClick={() => { setFilter(value); setOffset(0) }}
            >
              {label}
              {value === 'unread' ? ` ${unreadCount}` : ''}
            </button>
          ))}
        </div>
      </div>

      {!alerts.data ? (
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
                {visible.map((alert) => {
                  const { careEvent } = alert
                  const resolved = alert.status === 'resolved'
                  const isRead = alert.status !== 'active'
                  const lateBy = resolved
                    ? careEvent.completedAt &&
                      new Date(careEvent.completedAt) - new Date(careEvent.scheduledAt)
                    : now - new Date(careEvent.scheduledAt)
                  return (
                    <tr key={alert.id} className={isRead ? 'is-read' : ''}>
                      <td>
                        <div className="alert-name">
                          <span className={`alert-pet-icon alert-pet-icon--${alertIconTone(careEvent.type)}`}>
                            <Icon name={careEvent.type} size={16} />
                          </span>
                          <div>
                            <strong>
                              {alert.petName} · {careEvent.title}
                            </strong>
                            <small>{careTypeLabel(careEvent.type)}</small>
                            {resolved && (
                              <small>
                                Completed{careEvent.completedBy ? ` by ${careEvent.completedBy}` : ''}
                                {careEvent.completedAt
                                  ? ` at ${formatDayTime(careEvent.completedAt)}`
                                  : ''}
                              </small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="alert-due">{formatDayTime(careEvent.scheduledAt)}</td>
                      <td className={resolved ? '' : 'alert-late'}>
                        {lateBy ? formatDuration(lateBy) : '—'}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${resolved ? 'status-badge--muted' : 'status-badge--overdue'}`}
                        >
                          {resolved ? 'Resolved' : 'Overdue'}
                        </span>
                      </td>
                      <td className="alert-action">
                        {!resolved && (
                          <button
                            type="button"
                            className="btn btn--primary btn--small"
                            disabled={busyId === alert.id}
                            onClick={() => markDone(alert)}
                          >
                            {busyId === alert.id ? 'Saving…' : 'Mark as done'}
                          </button>
                        )}{' '}
                        <button
                          type="button"
                          className="btn btn--quiet btn--small"
                          disabled={isRead || busyId === alert.id}
                          onClick={() => markRead(alert)}
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
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {pagination && (
        <nav className="alerts-header-actions" aria-label="Alert pages">
          <button type="button" className="btn btn--outline btn--small"
            disabled={offset === 0 || alerts.refreshing} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
          <span>{pagination.total === 0 ? '0 alerts' : `${offset + 1}–${offset + visible.length} of ${pagination.total}`}</span>
          <button type="button" className="btn btn--outline btn--small"
            disabled={!pagination.hasMore || alerts.refreshing} onClick={() => setOffset(offset + 50)}>Next</button>
        </nav>
      )}
      {dialog}
    </section>
  )
}
