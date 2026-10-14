import { createContext, useContext } from 'react'

// { user, household, members, loading, error, onLogout, onSwitchHousehold }
export const SessionContext = createContext(null)

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside <SessionProvider>')
  return session
}
