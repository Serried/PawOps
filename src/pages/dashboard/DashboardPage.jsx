import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard } from '../../api/dashboard.js'
import { completeCareEvent } from '../../api/careEvents.js'
import { ActiveAlerts } from '../../components/dashboard/ActiveAlerts.jsx'
import { DashboardHeader } from '../../components/dashboard/DashboardHeader.jsx'
import { DashboardPetCard } from '../../components/dashboard/DashboardPetCard.jsx'
import { DashboardSkeleton } from '../../components/dashboard/DashboardSkeleton.jsx'
import { RecentActivity } from '../../components/dashboard/RecentActivity.jsx'
import { TodayCare } from '../../components/dashboard/TodayCare.jsx'
import { Icon } from '../../components/Icon.jsx'
import { RequestError, StatusNotice } from '../../components/AsyncState.jsx'
import { useSession } from '../../context/session.js'
import { useApi } from '../../hooks/useApi.js'
import { useDuplicateGuard } from '../../hooks/useDuplicateGuard.jsx'

export function DashboardView({ data, user, household, busyId = null, onComplete = () => {} }) {
  const remaining = data.today.filter((event) => event.status !== 'done').length

  return (
    <>
      <DashboardHeader
        userName={user.name}
        householdName={household.name}
        petCount={data.pets.length}
        remainingCount={remaining}
      />

      <section className="mb-[30px]" aria-labelledby="dashboard-pets-title">
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 id="dashboard-pets-title" className="text-xl">Your pets</h2>
          {data.pets.length > 0 && <Link className="font-bold" to="/pets">View all</Link>}
        </div>
        {data.pets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-[34px] text-center shadow-[var(--shadow)]">
            <Icon name="paw" size={30} className="text-[var(--primary-strong)]" />
            <strong>No pets yet</strong>
            <span className="text-[var(--muted)]">Add your first pet to start managing its care.</span>
            <Link to="/pets/new" className="mt-2 inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-[11px] font-bold text-white no-underline hover:bg-[var(--primary-strong)]"><Icon name="plus" size={16} /> Add pet</Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[760px]:grid-cols-1">
            {data.pets.map((pet) => (
              <DashboardPetCard
                key={pet.id}
                pet={pet}
                events={data.today.filter((event) => event.petId === pet.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)] items-start gap-[22px] max-[1100px]:grid-cols-1">
        <TodayCare events={data.today} busyId={busyId} onComplete={onComplete} />
        <div className="flex flex-col gap-[22px]">
          <ActiveAlerts alerts={data.activeAlerts} />
          <RecentActivity events={data.recentActivity} />
        </div>
      </div>
    </>
  )
}

export function DashboardErrorState({ error, onRetry = () => {} }) {
  return <RequestError error={error} resourceName="your dashboard" onRetry={onRetry} forbiddenTitle="You don't have permission to access this household." />
}

export function DashboardPage() {
  const { user, household } = useSession()
  const dashboard = useApi(() => getDashboard(household.id), `dashboard:${household.id}`)
  const { run, dialog } = useDuplicateGuard()
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [actionNotice, setActionNotice] = useState(null)

  const markDone = async (event) => {
    setBusyId(event.id)
    setActionError(null)
    setActionNotice(null)
    try {
      await run((override) => completeCareEvent(event.id, { override }), () => {
        dashboard.reload()
        setActionNotice(`${event.title} was marked as completed.`)
      })
    } catch (error) {
      setActionError(error.message)
    } finally {
      setBusyId(null)
    }
  }

  if (dashboard.loading) return <DashboardSkeleton />

  if (dashboard.error) {
    return <DashboardErrorState error={dashboard.error} onRetry={dashboard.reload} />
  }

  return (
    <>
      {dialog}
      {actionNotice && <StatusNotice>{actionNotice}</StatusNotice>}
      {actionError && <StatusNotice type="error">{actionError}</StatusNotice>}
      <DashboardView data={dashboard.data} user={user} household={household} busyId={busyId} onComplete={markDone} />
    </>
  )
}

