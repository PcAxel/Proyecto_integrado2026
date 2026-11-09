import { useSearchParams } from 'react-router-dom'
import { normalizar } from '@/domain/busqueda'

/**
 * Texto de búsqueda que llega por la URL (`?buscar=`), p. ej. desde el asistente de IA o la búsqueda global.
 * `quitar` borra solo ese parámetro y conserva el resto (como la pestaña activa).
 */
export function useBusquedaUrl() {
  const [params, setParams] = useSearchParams()
  const buscar = (params.get('buscar') ?? '').slice(0, 80)
  const quitar = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('buscar'); return n })
  return { buscar, quitar }
}

/** ¿Alguno de los campos contiene el texto? Sin distinguir mayúsculas ni tildes. Sin texto, todo coincide. */
export const coincide = (buscar, ...campos) => !buscar || normalizar(campos.filter((c) => c != null).join(' ')).includes(normalizar(buscar))
