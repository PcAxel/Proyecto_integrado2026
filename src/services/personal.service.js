import { db } from '@/mocks/db'
import { alertasVencimiento } from '@/domain/alertas'
import { fechaLocal } from '@/domain/format'
import { ESTADOS_VEHICULO } from '@/domain/flota'
import { respond, requirePermiso, ApiError } from './http'
import { registrarAuditoria } from './auditoria.service'

export const personalService = {
  list({ incluirInactivos = false } = {}) {
    return respond(() => {
      requirePermiso('personal.ver')
      return db.all('personal').filter((p) => incluirInactivos || p.activo)
    })
  },
  retrieve(id) {
    return respond(() => {
      requirePermiso('personal.ver')
      const p = db.find('personal', id)
      if (!p) throw new ApiError(404, 'Ficha no encontrada.')
      return p
    })
  },
  /** Cambiar la tarifa solo afecta hojas futuras: las ya sincronizadas conservan la suya. */
  actualizarTarifa(id, costo_hora_hombre) {
    return respond(() => {
      requirePermiso('personal.editar')
      const p = db.find('personal', id)
      if (!p) throw new ApiError(404, 'Ficha no encontrada.')
      if (!(costo_hora_hombre > 0)) throw new ApiError(422, 'La tarifa debe ser mayor que cero.')
      const anterior = p.costo_hora_hombre
      db.patch('personal', id, { costo_hora_hombre })
      registrarAuditoria({ entidad: 'FichaPersonal', entidad_id: id, accion: 'ACTUALIZAR_TARIFA', anterior: { costo_hora_hombre: anterior }, nuevo: { costo_hora_hombre } })
      return p
    })
  },
  setActivo(id, activo) {
    return respond(() => {
      requirePermiso('personal.editar')
      const p = db.find('personal', id)
      if (!p) throw new ApiError(404, 'Ficha no encontrada.')
      db.patch('personal', id, { activo })
      registrarAuditoria({ entidad: 'FichaPersonal', entidad_id: id, accion: activo ? 'ACTIVAR' : 'DESACTIVAR', nuevo: { activo } })
      return p
    })
  },
  listFlota() {
    return respond(() => {
      requirePermiso('personal.ver')
      return db.all('flota').map((v) => ({ ...v, tecnico_nombre: db.find('personal', v.tecnico_id)?.nombre ?? '—' }))
    })
  },
  /** Cambia un vehículo entre Activo y En taller. Un vehículo en taller no aparece en la app de terreno. */
  setEstadoVehiculo(id, estado) {
    return respond(() => {
      requirePermiso('personal.editar')
      if (!Object.values(ESTADOS_VEHICULO).includes(estado)) throw new ApiError(422, 'Estado de vehículo inválido.')
      const v = db.find('flota', id)
      if (!v) throw new ApiError(404, 'Vehículo no encontrado.')
      if (v.estado === estado) return { ...v, tecnico_nombre: db.find('personal', v.tecnico_id)?.nombre ?? '—' }
      const anterior = v.estado
      db.patch('flota', id, { estado })
      registrarAuditoria({ entidad: 'Vehiculo', entidad_id: id, accion: 'ACTUALIZAR_ESTADO', anterior: { estado: anterior }, nuevo: { estado } })
      return { ...v, tecnico_nombre: db.find('personal', v.tecnico_id)?.nombre ?? '—' }
    })
  },
  /** Vehículos que el técnico puede declarar en su hoja: solo los operativos, el suyo primero. Sin vencimientos ni datos de gestión. */
  vehiculosParaTerreno() {
    return respond(() => {
      const u = requirePermiso('pwa.usar')
      const ficha = db.all('personal').find((p) => p.usuario_id === u.id)
      return db.all('flota')
        .filter((v) => v.activo && v.estado === ESTADOS_VEHICULO.ACTIVO)
        .map((v) => ({ id: v.id, patente: v.patente, marca: v.marca, modelo: v.modelo, km_actual: v.km_actual, asignado: v.tecnico_id === ficha?.id }))
        .sort((a, b) => Number(b.asignado) - Number(a.asignado) || a.patente.localeCompare(b.patente))
    })
  },
  /** Vencimientos de licencias, revisión técnica y seguros (ventana de 60 días). */
  alertas() {
    return respond(() => {
      requirePermiso('personal.ver')
      return alertasVencimiento({ personal: db.all('personal'), flota: db.all('flota'), hoy: fechaLocal() })
    })
  },
}
