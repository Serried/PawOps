import { useEffect, useEffectEvent } from 'react'

export function useAutoRefresh(onRefresh) {
  const refresh = useEffectEvent(onRefresh)

  useEffect(() => {
    const refreshVisiblePage = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(refreshVisiblePage, 30_000)
    window.addEventListener('focus', refreshVisiblePage)
    window.addEventListener('online', refreshVisiblePage)
    document.addEventListener('visibilitychange', refreshVisiblePage)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisiblePage)
      window.removeEventListener('online', refreshVisiblePage)
      document.removeEventListener('visibilitychange', refreshVisiblePage)
    }
  }, [])
}
