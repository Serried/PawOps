import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PageLoading, RequestError } from './AsyncState.jsx'
import { useSession } from '../context/session.js'
import { Icon } from './Icon.jsx'
import { PersonAvatar } from './PetAvatar.jsx'

const NAV = [
  // Add Care Event is opened from the Dashboard (design)
  { to: '/dashboard', label: 'Dashboard', alsoActive: '/care' },
  { to: '/routines', label: 'Routines' },
  { to: '/alerts', label: 'Alert Center' },
  { to: '/members', label: 'Members' },
  { to: '/pets', label: 'My Pets' },
]

function SessionGate() {
  const { loading, error, retry } = useSession()
  if (error) {
    return (
      <div className="pc-page">
        <RequestError error={error} resourceName="household members" onRetry={retry} backTo="/dashboard" backLabel="Back to dashboard" />
      </div>
    )
  }
  if (loading) return <div className="pc-page"><PageLoading label="Loading household…" rows={2} /></div>
  return <Outlet />
}

export function AppLayout() {
  const { household, user, onLogout, onSwitchHousehold } = useSession()
  const { pathname } = useLocation()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark">
            <Icon name="paw-solid" size={18} />
          </span>
          PawOps
        </div>

        {/* Back to Member 1's household screen */}
        <button type="button" className="household-card" onClick={onSwitchHousehold} title="Switch household">
          <span className="household-card__label">Household</span>
          <span className="household-card__name">{household.name}</span>
        </button>

        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav__link${isActive || (item.alsoActive && pathname.startsWith(item.alsoActive)) ? ' nav__link--active' : ''}`
              }
            >
              <span className="nav__dot" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="current-user">
            <PersonAvatar name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <span>{household.role === 'owner' ? 'Owner' : 'Member'}</span>
            </div>
          </div>
          <button type="button" className="logout-button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="content">
        <SessionGate />
      </main>
    </div>
  )
}
