import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { apiError } from '../api/client.js'

// Loads data whenever `key` changes; key = null skips loading
export function useApi(loader, key) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState({ key: undefined, version: -1, data: null, error: null })
  const load = useEffectEvent(loader)

  useEffect(() => {
    if (key === null) return undefined
    let active = true
    load().then(
      (data) => {
        if (active) setState({ key, version, data, error: null })
      },
      (error) => {
        if (active) setState({ key, version, data: null, error: apiError(error) })
      },
    )
    return () => {
      active = false
    }
  }, [key, version])

  const reload = useCallback(() => setVersion((value) => value + 1), [])

  return {
    data: state.key === key ? state.data : null,
    error: state.key === key ? state.error : null,
    loading: key !== null && state.key !== key,
    refreshing: state.key === key && state.version !== version,
    reload,
  }
}
