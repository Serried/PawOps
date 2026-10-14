// Built from Member 1's login and the chosen household
import { displayName, listMembers } from '../api/households.js'
import { useApi } from '../hooks/useApi.js'
import { SessionContext } from './session.js'

export function SessionProvider({ user, household, onLogout, onSwitchHousehold, children }) {
  const members = useApi(() => listMembers(household.id), `members:${household.id}`)

  const value = {
    user: { id: Number(user.id), name: displayName(user), email: user.email },
    household: { id: Number(household.id), name: household.name, role: household.role },
    members: members.data ?? [],
    loading: members.loading,
    error: members.error,
    onLogout,
    onSwitchHousehold,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
