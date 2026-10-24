import { db } from '@/mocks/db'
import { crearMovimiento, calcularStock } from '@/domain/cardex'
import { can } from '@/domain/rbac'
import { respond, requirePermiso, actor, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'

function vista(r, rol) {
  const verStock = can(rol, 'bodega.ver')
  return {
    ...r,
    obra_nombre: db.find('obras', r.obra_id)?.nombre ?? '—',
    tecnico_nombre: db.find('personal', r.tecnico_id)?.nombre ?? '—',
    items: r.items.map((it) => {
      const a = db.find('articulos', it.articulo_id)
      return {
        ...it, sku: a.sku, nombre: a.nombre, unidad: a.unidad,
        ...(verStock ? { stock: calcularStock(db.all('cardex'), a.id) } : {}),
      }
    }),
  }
}

const buscar = (id) => {
  const r = db.find('retiros', id)
  if (!r) throw new ApiError(404, 'Solicitud no encontrada.')
  return r
}

/** Solicitudes de materiales desde terreno. Bodega las convierte en salidas de Cardex. */
export const retirosService = {
  list({ estado } = {}) {
    return respond(() => {
      const u = actor()
      const esTecnico = u.rol === 'TECNICO'
      if (!esTecnico) requirePermiso('bodega.ver')
      const ficha = db.all('personal').find((p) => p.usuario_id === u.id)
      return db.all('retiros')
        .filter((r) => (!estado || r.estado === estado) && (!esTecnico || r.tecnico_id === ficha?.id))
        .map((r) => vista(r, u.rol))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
    })
  },
  /** @param {{obra_id:string, items:Array<{articulo_id:string,cantidad:number}>, observaciones?:string}} data */
  create({ obra_id, items, observaciones = '', client_id = null }) {
    return respond(() => {
      const u = requirePermiso('pwa.usar')
      const previa = client_id && db.all('retiros').find((r) => r.client_id === client_id)
      if (previa) return vista(previa, u.rol)
      const ficha = db.all('personal').find((p) => p.usuario_id === u.id)
      if (!ficha) throw new ApiError(403, 'El usuario no tiene ficha de personal.')
      const obra = db.find('obras', obra_id)
      if (!obra || obra.estado !== 'EN_CURSO') throw new ApiError(422, 'La obra no existe o no está en curso.')
      if (!obra.tecnicos.includes(ficha.id)) throw new ApiError(403, 'No estás asignado a esta obra.')
      if (!items?.length) throw new ApiError(422, 'Agrega al menos un material.')
      const ids = new Set()
      for (const it of items) {
        const a = db.find('articulos', it.articulo_id)
        if (!a?.activo) throw new ApiError(422, 'Hay un artículo inexistente o inactivo.')
        if (ids.has(it.articulo_id)) throw new ApiError(422, `Artículo repetido: ${a.sku}.`)
        if (!(it.cantidad > 0)) throw new ApiError(422, `Cantidad inválida para ${a.sku}.`)
        ids.add(it.articulo_id)
      }
      const r = db.insert('retiros', {
        id: db.nextId('retiros'), client_id, obra_id, tecnico_id: ficha.id, fecha: ahora(), estado: 'PENDIENTE',
        items, observaciones: observaciones.trim(), resuelto_por: null, resuelto_en: null, motivo_rechazo: null, movimientos: [],
      })
      registrarAuditoria({ entidad: 'SolicitudRetiro', entidad_id: r.id, accion: 'CREAR', nuevo: { obra_id, items: items.length } })
      return vista(r, u.rol)
    })
  },
  /** Genera una SALIDA_OBRA por ítem, todo o nada, valorada al costo vigente. */
  entregar(id) {
    return respond(() => {
      const u = requirePermiso('cardex.crear')
      const r = buscar(id)
      if (r.estado !== 'PENDIENTE') throw new ApiError(409, 'La solicitud ya fue resuelta.')
      const simulados = []
      for (const it of r.items) {
        const a = db.find('articulos', it.articulo_id)
        const res = crearMovimiento([...db.all('cardex'), ...simulados], {
          tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: it.cantidad, costo_unitario: a.costo_unitario,
          obra_id: r.obra_id, usuario_id: u.id, fecha: ahora(), referencia: `Retiro ${r.id}`,
        })
        if (!res.ok) throw new ApiError(422, `${a.sku}: ${res.error}`)
        simulados.push(res.movimiento)
      }
      simulados.forEach((m) => db.insert('cardex', m))
      db.patch('retiros', id, { estado: 'ENTREGADA', resuelto_por: u.id, resuelto_en: ahora(), movimientos: simulados.map((m) => m.id) })
      registrarAuditoria({ entidad: 'SolicitudRetiro', entidad_id: id, accion: 'ENTREGAR', anterior: { estado: 'PENDIENTE' }, nuevo: { estado: 'ENTREGADA', movimientos: simulados.map((m) => m.id) } })
      return vista(r, u.rol)
    })
  },
  rechazar(id, motivo) {
    return respond(() => {
      const u = requirePermiso('cardex.crear')
      const r = buscar(id)
      if (r.estado !== 'PENDIENTE') throw new ApiError(409, 'La solicitud ya fue resuelta.')
      if (!motivo?.trim()) throw new ApiError(422, 'Debe indicar el motivo del rechazo.')
      db.patch('retiros', id, { estado: 'RECHAZADA', resuelto_por: u.id, resuelto_en: ahora(), motivo_rechazo: motivo.trim() })
      registrarAuditoria({ entidad: 'SolicitudRetiro', entidad_id: id, accion: 'RECHAZAR', anterior: { estado: 'PENDIENTE' }, nuevo: { estado: 'RECHAZADA', motivo: motivo.trim() } })
      return vista(r, u.rol)
    })
  },
}
