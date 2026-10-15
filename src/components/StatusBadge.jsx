import { Icon } from './Icon.jsx'

const BADGES = {
  done: { icon: 'check', label: 'Completed' },
  upcoming: { icon: 'clock', label: 'Upcoming' },
  overdue: { icon: 'alert', label: 'Overdue' },
}

export function StatusBadge({ status }) {
  const badge = BADGES[status] ?? BADGES.upcoming
  return (
    <span className={`badge badge--${status}`}>
      <Icon name={badge.icon} size={14} />
      {badge.label}
    </span>
  )
}
