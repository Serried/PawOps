import { Icon } from '../Icon.jsx'
import { StatusBadge } from '../StatusBadge.jsx'
import { formatTime } from '../../lib/format.js'

function timingText(event) {
  if (event.status === 'done') {
    const by = event.completedBy?.name ? ` by ${event.completedBy.name}` : ''
    return `Completed at ${formatTime(event.completedAt)}${by}`
  }
  if (event.status === 'overdue') {
    const minutes = Math.max(1, Math.floor((Date.now() - new Date(event.scheduledAt)) / 60_000))
    return `Overdue by ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }
  return `Due at ${formatTime(event.scheduledAt)}`
}

export function TodayCare({ events, busyId, onComplete }) {
  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]" aria-labelledby="today-care-title">
      <div className="mb-3.5 flex items-baseline justify-between">
        <div>
          <h2 id="today-care-title" className="mb-1 text-[19.2px]">Today&apos;s care</h2>
          <p className="m-0 text-sm text-[var(--muted)]">Scheduled care for every pet today.</p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 pt-[30px] pb-3 text-center">
          <Icon name="check" size={24} className="text-[var(--primary-strong)]" />
          <strong>No care scheduled today</strong>
          <span className="text-[var(--muted)]">You&apos;re all caught up.</span>
        </div>
      ) : (
        <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
          {events.map((event) => (
            <li key={event.id} className={`flex items-center gap-3 rounded-[13px] border p-[13px] max-[760px]:flex-wrap max-[760px]:items-start ${event.status === 'overdue' ? 'border-[var(--danger-line)] bg-[var(--danger-soft)]' : event.status === 'done' ? 'border-[var(--line)] bg-[#f9fcfa]' : 'border-[var(--line)]'}`}>
              <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]"><Icon name={event.type} /></span>
              <div className="flex min-w-0 flex-1 flex-col max-[760px]:basis-[calc(100%-58px)]">
                <strong>{event.title}</strong>
                <span className="text-sm text-[var(--muted)]">{event.petName} · {timingText(event)}</span>
              </div>
              {event.status !== 'done' && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--input-line)] bg-white px-3.5 py-2 text-sm font-bold transition-colors hover:border-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60 max-[760px]:ml-[54px]"
                  disabled={busyId !== null}
                  onClick={() => onComplete(event)}
                >
                  {busyId === event.id ? 'Saving…' : 'Mark done'}
                </button>
              )}
              <StatusBadge status={event.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

