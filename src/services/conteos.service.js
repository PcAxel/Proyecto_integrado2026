import { db } from '@/mocks/db'
import { evaluarConteo, puedeAprobarConteo } from '@/domain/conteo'
import { calcularStock, crearAjusteConteo } from '@/domain/cardex'
import { respond, requirePermiso, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'

const vista = (c) => ({
  ...c,
  articulo_sku: db.find('articulos', c.articulo_id)?.sku ?? c.articulo_id,
  articulo_nombre: db.find('articulos', c.articulo_id)?.nombre ?? c.articulo_id,
  unidad: db.find('articulos', c.articulo_id)?.unidad ?? '',
  creado_por_nombre: db.find('usuarios', c.creado_por)?.nombre ?? c.creado_por,
})

/**
 * Conteo físico de inventario. Es CIEGO: quien cuenta ingresa solo lo que encontró. Si hay diferencia queda por aprobar
 * y solo OTRA persona puede aprobarla; recién entonces se genera el ajuste en el Cardex (libro inmutable).
 */
export const conteosService = {
  list({ estado } = {}) {
    return respond(() => {
      requirePermiso('bodega.ver')
      return db.all('conteos').filter((c) => !estado || c.estado === estado).map(vista).sort((a, b) => b.fecha.localeCompare(a.fecha))
    })
  },
  /** @param {{articulo_id:string, contado:number, motivo?:string}} data */
  registrar({ articulo_id, contado, motivo = '' }) {
    return respond(() => {
      const u = requirePermiso('conteo.registrar')
      const a = db.find('articulos', articulo_id)
      if (!a?.activo) throw new ApiError(422, 'Artículo inexistente o inactivo.')
      if (db.all('conteos').some((c) => c.articulo_id === articulo_id && c.estado === 'PENDIENTE')) {
        throw new ApiError(409, 'Este artículo ya tiene un conteo pendiente de aprobación.')
      }
      const sistema = calcularStock(db.all('cardex'), articulo_id)
      const ev = evaluarConteo({ stockSistema: sistema, contado, costo: a.costo_unitario, motivo })
      if (!ev.ok) throw new ApiError(422, ev.error, { diferencia: ev.diferencia })
      const c = db.insert('conteos', {
        id: db.nextId('conteos'), articulo_id, fecha: ahora(), contado, stock_sistema: sistema, diferencia: ev.diferencia, motivo: motivo.trim(),
        estado: ev.estado, valor_diferencia: ev.valor, creado_por: u.id, resuelto_por: null, resuelto_en: null, motivo_rechazo: null, movimiento_id: null,
      })
      registrarAuditoria({ entidad: 'ConteoFisico', entidad_id: c.id, accion: 'CONTAR', nuevo: { articulo_id, contado, diferencia: ev.diferencia } })
      return vista(c)
    })
  },
  /** Aprueba el ajuste: escribe el contra-asiento en el Cardex y cierra el conteo, todo en un solo lote. */
  aprobar(id) {
    return respond(() => {
      const u = requirePermiso('conteo.aprobar')
      const c = db.find('conteos', id)
      if (!c) throw new ApiError(404, 'Conteo no encontrado.')
      if (c.estado !== 'PENDIENTE') throw new ApiError(409, 'El conteo ya fue resuelto.')
      if (!puedeAprobarConteo(c, u.id)) throw new ApiError(403, 'Otra persona debe aprobar el ajuste (no quien contó).')
      const a = db.find('articulos', c.articulo_id)
      const r = crearAjusteConteo(db.all('cardex'), { conteo: c, costo_unitario: a.costo_unitario, usuario_id: u.id, fecha: ahora() })
      if (!r.ok) throw new ApiError(409, r.error)
      const mov = db.insert('cardex', r.movimiento)
      db.patch('conteos', id, { estado: 'APROBADO', movimiento_id: mov.id, resuelto_por: u.id, resuelto_en: ahora() })
      registrarAuditoria({ entidad: 'ConteoFisico', entidad_id: id, accion: 'APROBAR_AJUSTE', anterior: { stock: c.stock_sistema }, nuevo: { stock: c.contado, movimiento: mov.id } })
      return vista(c)
    })
  },
  rechazar(id, motivo) {
    return respond(() => {
      const u = requirePermiso('conteo.aprobar')
      const c = db.find('conteos', id)
      if (!c) throw new ApiError(404, 'Conteo no encontrado.')
      if (c.estado !== 'PENDIENTE') throw new ApiError(409, 'El conteo ya fue resuelto.')
      if (!puedeAprobarConteo(c, u.id)) throw new ApiError(403, 'Otra persona debe resolver el ajuste (no quien contó).')
      if (!motivo?.trim()) throw new ApiError(422, 'Debe indicar el motivo del rechazo.')
      db.patch('conteos', id, { estado: 'RECHAZADO', resuelto_por: u.id, resuelto_en: ahora(), motivo_rechazo: motivo.trim() })
      registrarAuditoria({ entidad: 'ConteoFisico', entidad_id: id, accion: 'RECHAZAR_AJUSTE', anterior: { estado: 'PENDIENTE' }, nuevo: { motivo: motivo.trim() } })
      return vista(c)
    })
  },
}
