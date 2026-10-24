import { db } from '@/mocks/db'
import { alertasVencimiento } from '@/domain/alertas'
import { fechaLocal } from '@/domain/format'
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
      requirePermiso('personal.gestionar')
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
      requirePermiso('personal.gestionar')
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
  /** Vencimientos de licencias, revisión técnica y seguros (ventana de 60 días). */
  alertas() {
    return respond(() => {
      requirePermiso('personal.ver')
      return alertasVencimiento({ personal: db.all('personal'), flota: db.all('flota'), hoy: fechaLocal() })
    })
  },
}
