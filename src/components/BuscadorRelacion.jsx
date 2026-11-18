import { useCallback } from 'react'
import { AsyncCombobox } from '@/components/ui'
import { autocompletarService } from '@/services'

/**
 * Campo para elegir un registro de otra tabla (proveedor, artículo, cliente u obra) buscando en el servidor mientras se escribe.
 * `onChange(id, opcion)` recibe el id elegido y su opción (código, nombre y detalle).
 * `filtros` (opcional) acota la búsqueda con los filtros que admite el servidor (p. ej. `{proveedor: 'PRV-001'}` para artículos, `{estado: 'EN_CURSO'}` para obras).
 * @param {{tabla:'proveedores'|'clientes'|'articulos'|'obras'|'facturas', filtros?:Record<string,string>, value:string, onChange:(id:string, opcion:object|null)=>void}
 *   & Omit<import('react').ComponentProps<typeof AsyncCombobox>, 'buscar'|'cargarSeleccion'>} props
 */
export function BuscadorRelacion({ tabla, filtros, ...props }) {
  const clave = JSON.stringify(filtros ?? {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buscar = useCallback((texto) => autocompletarService.buscar(tabla, texto, 15, JSON.parse(clave)), [tabla, clave])
  const cargarSeleccion = useCallback((id) => autocompletarService.porIds(tabla, [id]).then((r) => r[0] ?? null), [tabla])
  return <AsyncCombobox buscar={buscar} cargarSeleccion={cargarSeleccion} {...props} />
}
