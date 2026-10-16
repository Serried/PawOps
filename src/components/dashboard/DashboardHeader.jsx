import { Link } from 'react-router-dom'
import { Icon } from '../Icon.jsx'

function greetingFor(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardHeader({ userName, householdName, petCount, remainingCount }) {
  return (
    <header className="mb-8 flex items-start justify-between gap-5 max-[760px]:flex-col">
      <div>
        <p className="m-0 font-bold text-[var(--primary-strong)]">{greetingFor()}, {userName}</p>
        <h1 className="mt-0.5 text-[32px] leading-[1.2]">{householdName}</h1>
        <p className="mt-1.5 text-[var(--muted)]">
          {petCount} {petCount === 1 ? 'pet' : 'pets'} · {remainingCount}{' '}
          {remainingCount === 1 ? 'task' : 'tasks'} remaining today
        </p>
      </div>
      <Link to="/care/new" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] border border-transparent bg-[var(--primary)] px-5 py-[11px] font-bold text-white no-underline transition-colors hover:bg-[var(--primary-strong)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[rgb(43_174_102_/_35%)]">
        <Icon name="plus" size={16} /> Add care event
      </Link>
    </header>
  )
}

