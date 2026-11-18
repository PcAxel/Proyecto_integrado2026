import { useCallback } from 'react'
import { AsyncCombobox } from '@/components/ui'
import { rrhhService } from '@/services'

/** Campo para elegir una persona (cuenta activa) buscando en el servidor por nombre o correo. Solo RR. HH. y Administrador. */
export function BuscadorPersona(props) {
  const buscar = useCallback((texto) => rrhhService.buscarPersonal(texto), [])
  const cargarSeleccion = useCallback((id) => rrhhService.personalPorIds([id]).then((r) => r[0] ?? null), [])
  return <AsyncCombobox buscar={buscar} cargarSeleccion={cargarSeleccion} {...props} />
}
