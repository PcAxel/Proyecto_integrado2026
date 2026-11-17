import { db, refrescar } from '@/mocks/db'
import { calcularStock } from '@/domain/cardex'
import { can } from '@/domain/rbac'
import { respond, requirePermiso, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'
import { api } from './api'

const nombreUsuario = (id) => db.find('usuarios', id)?.nombre ?? id

/** Una solicitud lista para mostrar: con los datos de cada artículo y, si el rol ve costos de compra, su valor estimado al último costo. */
function vistaSolicitud(s, rol) {
  const costos = can(rol, 'costos_compra.ver')
  const items = s.items.map((it) => {
    const a = db.find('articulos', it.articulo_id)
    const prov = db.find('proveedores', a?.proveedor_id)
    return {
      ...it, sku: a?.sku ?? it.articulo_id, nombre: a?.nombre ?? '—', unidad: a?.unidad ?? '', stock: a ? calcularStock(db.all('cardex'), a.id) : 0,
      proveedor: prov?.razon_social ?? 'Sin proveedor',
      ...(costos ? { costo_unitario: a?.costo_unitario ?? 0, subtotal: Math.round(it.cantidad * (a?.costo_unitario ?? 0)) } : {}),
    }
  })
  return { ...s, solicitante_nombre: nombreUsuario(s.solicitante_id), resuelto_por_nombre: s.resuelto_por ? nombreUsuario(s.resuelto_por) : null, items,
    ...(costos ? { total_estimado: items.reduce((a, i) => a + i.subtotal, 0) } : {}) }
}

/**
 * Solicitudes de compra: las crea el Jefe de Bodega; Finanzas las aprueba (se emiten las órdenes de compra por proveedor) o las rechaza.
 * Aprobar y rechazar las hace el servidor: arma las órdenes con el proveedor y el último costo de cada artículo.
 */
export const solicitudesCompraService = {
  /** @param {{estado?: 'PENDIENTE'|'APROBADA'|'RECHAZADA'}} [f] */
  list({ estado } = {}) {
    return respond(() => {
      const u = requirePermiso('compras.ver')
      return db.all('solicitudes_compra').filter((s) => !estado || s.estado === estado).map((s) => vistaSolicitud(s, u.rol)).sort((a, b) => b.id.localeCompare(a.id))
    })
  },
  /** @param {{items: Array<{articulo_id:string, cantidad:number}>, motivo:string}} data */
  create({ items, motivo }) {
    return respond(() => {
      const u = requirePermiso('solicitudes_compra.crear')
      if (!items?.length) throw new ApiError(422, 'Agrega al menos un artículo.')
      if (!motivo?.trim()) throw new ApiError(422, 'Indica por qué se necesita la compra.')
      const vistos = new Set()
      for (const it of items) {
        const a = db.find('articulos', it.articulo_id)
        if (!a?.activo) throw new ApiError(422, 'Hay un artículo inexistente o inactivo.')
        if (vistos.has(it.articulo_id)) throw new ApiError(422, `Artículo repetido: ${a.sku}.`)
        if (!(it.cantidad > 0)) throw new ApiError(422, `Cantidad inválida para ${a.sku}.`)
        vistos.add(it.articulo_id)
      }
      const fila = db.insert('solicitudes_compra', {
        id: db.nextId('solicitudes_compra'), items: items.map(({ articulo_id, cantidad }) => ({ articulo_id, cantidad })), motivo: motivo.trim(), solicitante_id: u.id,
        fecha: ahora(), estado: 'PENDIENTE', orden_ids: [], resuelto_por: null, resuelto_en: null, motivo_rechazo: null,
      })
      registrarAuditoria({ entidad: 'SolicitudCompra', entidad_id: fila.id, accion: 'CREAR', nuevo: { articulos: items.length } })
      return vistaSolicitud(fila, u.rol)
    })
  },
  /** Finanzas aprueba: el servidor emite una orden de compra por proveedor. @returns {Promise<{solicitud:object, ordenes:string[]}>} */
  async emitirOrdenes(id) {
    const r = await api.post(`/erp/solicitudes-compra/${encodeURIComponent(id)}/emitir/`, {})
    await refrescar(0)
    return r
  },
  async rechazar(id, motivo) {
    const r = await api.post(`/erp/solicitudes-compra/${encodeURIComponent(id)}/rechazar/`, { motivo })
    await refrescar(0)
    return r
  },
}

/** Órdenes de compra emitidas (solo lectura: nacen al aprobar una solicitud). */
export const ordenesCompraService = {
  list() {
    return respond(() => {
      requirePermiso('compras.ver')
      return db.all('ordenes_compra').map((o) => ({ ...o, proveedor_nombre: db.find('proveedores', o.proveedor_id)?.razon_social ?? o.proveedor_id }))
        .sort((a, b) => b.id.localeCompare(a.id))
    })
  },
}

/** Cuentas por cobrar: facturas emitidas con su saldo y los pagos de los clientes. El servidor valida y pasa la factura a PAGADA. */
export const cobranzasService = {
  /** @returns {Promise<{por_cobrar:number, cobrado:number, pendientes:number, facturas:object[]}>} */
  resumen: () => api.get('/facturacion/cobranzas/'),
  /** @param {string} ordenId @param {{fecha:string, monto:number, metodo:string, referencia?:string}} pago */
  registrarPago: (ordenId, pago) => api.post(`/facturacion/${encodeURIComponent(ordenId)}/pagos/`, pago),
}
