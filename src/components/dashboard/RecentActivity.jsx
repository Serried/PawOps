import { Icon } from '../Icon.jsx'
import { formatTimelineTime, timelineSentence } from '../../lib/format.js'

export function RecentActivity({ events }) {
  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]" aria-labelledby="recent-activity-title">
      <h2 id="recent-activity-title" className="mb-1 text-[19.2px]">Recent activity</h2>
      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 pt-[30px] pb-3 text-center">
          <Icon name="clock" size={24} className="text-[var(--primary-strong)]" />
          <strong>No care activity yet</strong>
          <span className="text-[var(--muted)]">Completed care will appear here.</span>
        </div>
      ) : (
        <ul className="m-0 mt-4 list-none p-0">
          {events.map((event) => {
            const sentence = timelineSentence(event.type, event.petName, event.completedBy?.name ?? 'a household member')
            return (
              <li key={event.id} className="grid grid-cols-[62px_auto_1fr] items-center gap-2.5 border-b border-[var(--line)] py-3 last:border-b-0 last:pb-0 max-[760px]:grid-cols-[54px_auto_1fr]">
                <time className="text-[13px] text-[var(--muted)]" dateTime={event.completedAt}>{formatTimelineTime(event.completedAt)}</time>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]"><Icon name={event.type} size={16} /></span>
                <p className="m-0 text-sm"><strong>{sentence.pet}</strong>{sentence.middle}<strong>{sentence.user}</strong></p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

