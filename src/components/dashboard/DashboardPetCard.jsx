import { Link } from 'react-router-dom'
import { PetAvatar } from '../PetAvatar.jsx'

function petState(overdueCount, remainingCount) {
  if (overdueCount > 0) return { tone: 'text-[var(--danger)]', label: 'Overdue care' }
  if (remainingCount > 0) return { tone: 'text-[var(--warning-ink)]', label: 'Tasks remaining' }
  return { tone: 'text-[var(--primary-strong)]', label: 'All good' }
}

export function DashboardPetCard({ pet, events }) {
  const remaining = events.filter((event) => event.status !== 'done').length
  const overdue = events.filter((event) => event.status === 'overdue').length
  const state = petState(overdue, remaining)

  return (
    <Link to={`/pets/${pet.id}`} className="grid grid-cols-[auto_1fr] gap-3.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-[18px] text-inherit no-underline shadow-[var(--shadow)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(29_42_34_/_8%)]" aria-label={`View ${pet.name}`}>
      <PetAvatar pet={pet} size="md" showInitial />
      <div className="flex flex-col">
        <strong className="text-[17px]">{pet.name}</strong>
        <span className="text-[var(--muted)]">{pet.species}</span>
      </div>
      <div className="col-span-full flex flex-col gap-[7px] border-t border-[var(--line)] pt-3 text-sm">
        <span>{remaining} {remaining === 1 ? 'task' : 'tasks'} today</span>
        <span className={`inline-flex items-center gap-[7px] font-bold ${state.tone}`}>
          <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" /> {state.label}
        </span>
      </div>
    </Link>
  )
}

