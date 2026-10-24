import { useCallback, useEffect, useState } from 'react'

/**
 * Carga datos de un servicio mock con estados loading/error y recarga manual.
 * Conserva el dato anterior mientras recarga para evitar parpadeos.
 * @template T
 * @param {() => Promise<T>} fetcher
 * @param {any[]} deps
 */
export function useResource(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher()
      .then((data) => vivo && setState({ data, loading: false, error: null }))
      .catch((error) => vivo && setState((s) => ({ ...s, loading: false, error })))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}
