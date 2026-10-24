import { db } from '@/mocks/db'
import { useAuthStore } from '@/stores/authStore'
import { respond, requirePermiso, ApiError, ahora } from './http'

/**
 * Registra un LogAuditoria (P4). Uso interno de los demás servicios; no es un endpoint.
 * @param {{entidad:string, entidad_id:string, accion:string, anterior?:any, nuevo?:any}} e
 */
export function registrarAuditoria({ entidad, entidad_id, accion, anterior = null, nuevo = null }) {
  const { user, ip } = useAuthStore.getState()
  return db.insert('auditoria', {
    id: db.nextId('auditoria'),
    fecha: ahora(),
    usuario_id: user?.id ?? 'SISTEMA',
    usuario_nombre: user?.nombre ?? 'Sistema',
    rol: user?.rol ?? 'SISTEMA',
    entidad,
    entidad_id,
    accion,
    anterior,
    nuevo,
    ip,
  })
}

/** Solo lectura: el log no admite edición ni borrado. */
export const auditoriaService = {
  /** @param {{entidad?:string, usuario_id?:string, accion?:string, desde?:string, hasta?:string}} [filtros] */
  list(filtros = {}) {
    return respond(() => {
      requirePermiso('auditoria.ver')
      return db.all('auditoria')
        .filter((l) => (!filtros.entidad || l.entidad === filtros.entidad)
          && (!filtros.usuario_id || l.usuario_id === filtros.usuario_id)
          && (!filtros.accion || l.accion === filtros.accion)
          && (!filtros.desde || l.fecha >= filtros.desde)
          && (!filtros.hasta || l.fecha <= `${filtros.hasta}T23:59:59`))
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
    })
  },
  retrieve(id) {
    return respond(() => {
      requirePermiso('auditoria.ver')
      const l = db.find('auditoria', id)
      if (!l) throw new ApiError(404, 'Registro de auditoría no encontrado.')
      return l
    })
  },
}
