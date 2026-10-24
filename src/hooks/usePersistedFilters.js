import { useCallback } from 'react'
import { useUiStore } from '@/stores/uiStore'

/** Filtros de una vista persistidos en uiStore (sobreviven a la navegación). */
export function usePersistedFilters(clave, inicial) {
  const guardado = useUiStore((s) => s.filtros[clave])
  const setFiltros = useUiStore((s) => s.setFiltros)
  const filtros = { ...inicial, ...guardado }
  const setFiltro = useCallback((campo, valor) => setFiltros(clave, { ...inicial, ...guardado, [campo]: valor }), [clave, guardado, setFiltros]) // eslint-disable-line react-hooks/exhaustive-deps
  return [filtros, setFiltro]
}
