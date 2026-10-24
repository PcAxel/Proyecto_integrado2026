import { db } from '@/mocks/db'
import { evaluarChecklist } from '@/domain/checklist'
import { dentroDeGeocerca } from '@/domain/geo'
import { can } from '@/domain/rbac'
import { respond, requirePermiso, actor, ApiError, ahora, sinCostos } from './http'
import { registrarAuditoria } from './auditoria.service'

function vista(h, rol) {
  const obra = db.find('obras', h.obra_id)
  const base = sinCostos(rol, 'costos.ver', h, ['costo_hora_hombre'])
  return {
    ...base,
    tecnico_nombre: db.find('personal', h.tecnico_id)?.nombre ?? '—',
    obra_nombre: obra?.nombre ?? '—',
    evaluacion: evaluarChecklist(h.checklist_json),
    geocerca: obra && h.gps ? dentroDeGeocerca(h.gps, obra.ubicacion, obra.ubicacion.radio_m) : null,
    fotos: (h.fotos ?? []).map((f) => ({ ...f, geocerca: obra ? dentroDeGeocerca(f, obra.ubicacion, obra.ubicacion.radio_m) : null })),
    materiales: (h.materiales ?? []).map((m) => {
      const a = db.find('articulos', m.articulo_id)
      return { ...m, nombre: a?.nombre ?? m.articulo_id, unidad: a?.unidad ?? '' }
    }),
  }
}

function auditar(id, estado, observaciones, accion) {
  const h = db.find('hojas', id)
  if (!h) throw new ApiError(404, 'Hoja de servicio no encontrada.')
  if (h.estado !== 'ENVIADA') throw new ApiError(409, 'Solo una hoja ENVIADA puede auditarse.')
  const u = actor()
  db.patch('hojas', id, { estado, auditoria: { usuario_id: u.id, fecha: ahora(), observaciones: observaciones?.trim() ?? '' } })
  registrarAuditoria({ entidad: 'HojaServicio', entidad_id: id, accion, anterior: { estado: 'ENVIADA' }, nuevo: { estado } })
  return vista(h, u.rol)
}

/** La hoja enviada no se edita ni se borra: se aprueba o se devuelve (P2). */
export const hojasService = {
  list({ obra_id, estado, tecnico_id } = {}) {
    return respond(() => {
      const u = actor()
      const esTecnico = u.rol === 'TECNICO'
      if (!esTecnico) requirePermiso('terreno.ver')
      const ficha = db.all('personal').find((p) => p.usuario_id === u.id)
      return db.all('hojas')
        .filter((h) => (!obra_id || h.obra_id === obra_id) && (!estado || h.estado === estado)
          && (!tecnico_id || h.tecnico_id === tecnico_id) && (!esTecnico || h.tecnico_id === ficha?.id))
        .map((h) => vista(h, u.rol)).sort((a, b) => b.fecha.localeCompare(a.fecha))
    })
  },
  retrieve(id) {
    return respond(() => {
      const u = actor()
      const h = db.find('hojas', id)
      if (!h) throw new ApiError(404, 'Hoja de servicio no encontrada.')
      return vista(h, u.rol)
    })
  },
  /**
   * Sincronización desde la PWA. Congela la tarifa hora-hombre vigente (Regla 2)
   * para que un cambio de tarifa posterior no altere el costo ya imputado.
   */
  enviar({ desde_cola = false, ...data }) {
    return respond(() => {
      const u = requirePermiso('pwa.usar')
      const ficha = db.all('personal').find((p) => p.usuario_id === u.id)
      if (!ficha) throw new ApiError(403, 'El usuario no tiene ficha de personal.')
      // Idempotencia: un reintento de la cola no debe duplicar la hoja.
      const previa = data.client_id && db.all('hojas').find((h) => h.client_id === data.client_id)
      if (previa) return vista(previa, u.rol)
      const obra = db.find('obras', data.obra_id)
      if (!obra || obra.estado !== 'EN_CURSO') throw new ApiError(422, 'La obra no existe o no está en curso.')
      if (!obra.tecnicos.includes(ficha.id)) throw new ApiError(403, 'No estás asignado a esta obra.')
      if (!evaluarChecklist(data.checklist_json).completo) throw new ApiError(422, 'El checklist está incompleto.')
      if (!(data.horas_trabajadas > 0)) throw new ApiError(422, 'Debe registrar las horas trabajadas.')
      const h = db.insert('hojas', {
        materiales: [], fotos: [], firma_cliente: false, observaciones: '', ...data,
        id: db.nextId('hojas'), tecnico_id: ficha.id, fecha: ahora(), estado: 'ENVIADA',
        costo_hora_hombre: ficha.costo_hora_hombre, auditoria: null,
      })
      // El dispositivo había reportado este registro como pendiente de sync; al llegar, se descuenta.
      if (desde_cola && obra.pendientes_sync > 0) db.patch('obras', obra.id, { pendientes_sync: obra.pendientes_sync - 1 })
      registrarAuditoria({ entidad: 'HojaServicio', entidad_id: h.id, accion: 'ENVIAR', nuevo: { obra_id: h.obra_id, horas: h.horas_trabajadas, desde_cola } })
      return vista(h, u.rol)
    })
  },
  aprobar(id, observaciones = '') {
    return respond(() => {
      requirePermiso('hojas.auditar')
      return auditar(id, 'APROBADA', observaciones, 'APROBAR')
    })
  },
  devolver(id, observaciones) {
    return respond(() => {
      requirePermiso('hojas.auditar')
      if (!observaciones?.trim()) throw new ApiError(422, 'Debe indicar observaciones al devolver.')
      return auditar(id, 'DEVUELTA', observaciones, 'DEVOLVER')
    })
  },
}

export const puedeVerTarifas = (rol) => can(rol, 'costos.ver')
