import { useCallback } from 'react'
import { AsyncCombobox } from '@/components/ui'
import { autocompletarService } from '@/services'

/**
 * Campo para elegir un registro de otra tabla (proveedor, artículo, cliente u obra) buscando en el servidor mientras se escribe.
 * `onChange(id, opcion)` recibe el id elegido y su opción (código, nombre y detalle).
 * @param {{tabla:'proveedores'|'clientes'|'articulos'|'obras', value:string, onChange:(id:string, opcion:object|null)=>void}
 *   & Omit<import('react').ComponentProps<typeof AsyncCombobox>, 'buscar'|'cargarSeleccion'>} props
 */
export function BuscadorRelacion({ tabla, ...props }) {
  const buscar = useCallback((texto) => autocompletarService.buscar(tabla, texto), [tabla])
  const cargarSeleccion = useCallback((id) => autocompletarService.porIds(tabla, [id]).then((r) => r[0] ?? null), [tabla])
  return <AsyncCombobox buscar={buscar} cargarSeleccion={cargarSeleccion} {...props} />
}
