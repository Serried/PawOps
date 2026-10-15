import { Link } from 'react-router-dom'
import { Icon } from '../Icon.jsx'
import { formatTime } from '../../lib/format.js'

export function ActiveAlerts({ alerts }) {
  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-[#f2d2a9] bg-[#fffdf9] p-6 shadow-[var(--shadow)]" aria-labelledby="active-alerts-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="active-alerts-title" className="mb-1 text-[19.2px]">Active alerts</h2>
        {alerts.length > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[var(--danger)] px-[7px] text-xs font-extrabold text-white">{alerts.length}</span>}
      </div>
      {alerts.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 font-bold text-[var(--primary-strong)]">
          <Icon name="check" size={18} /> No active alerts
        </div>
      ) : (
        <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-start gap-[11px] border-t border-[#f2d2a9] pt-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--warning-soft)] text-[var(--warning-ink)]"><Icon name="alert" size={20} /></span>
              <div>
                <strong>{alert.title} overdue</strong>
                <p className="my-[3px] mb-[7px] text-sm text-[var(--muted)]">{alert.petName}&apos;s {alert.title.toLowerCase()} was due at {formatTime(alert.scheduledAt)}.</p>
                <Link className="text-sm font-bold" to={`/pets/${alert.petId}`}>View details</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

