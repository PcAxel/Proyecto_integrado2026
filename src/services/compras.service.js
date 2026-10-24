import { db } from '@/mocks/db'
import { calcularNeto, calcularFactura } from '@/domain/money'
import { crearMovimiento } from '@/domain/cardex'
import { respond, requirePermiso, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'

/** Facturas y notas de crédito: solo se crean. No existe anulación física (P2). */
export const comprasService = {
  listFacturas({ proveedor_id } = {}) {
    return respond(() => {
      requirePermiso('compras.ver')
      return db.all('facturas').filter((f) => !proveedor_id || f.proveedor_id === proveedor_id).slice().reverse()
    })
  },
  retrieveFactura(id) {
    return respond(() => {
      requirePermiso('compras.ver')
      const f = db.find('facturas', id)
      if (!f) throw new ApiError(404, 'Factura no encontrada.')
      return { ...f, notas_credito: db.all('notas_credito').filter((n) => n.factura_id === id) }
    })
  },
  /**
   * Registra la factura y genera una ENTRADA_COMPRA por ítem, valorada al costo
   * tras hasta 3 descuentos en cascada.
   * @param {{proveedor_id:string, numero:string, fecha:string, descuentos?:number[], items:Array<{articulo_id:string,cantidad:number,precio_lista:number}>}} data
   */
  createFactura(data) {
    return respond(() => {
      const u = requirePermiso('compras.registrar')
      const { proveedor_id, numero, fecha, items } = data
      const descuentos = (data.descuentos ?? []).filter((d) => d > 0)
      if (!db.find('proveedores', proveedor_id)) throw new ApiError(422, 'Proveedor inexistente.')
      if (descuentos.length > 3) throw new ApiError(422, 'Se admiten hasta 3 descuentos en cascada.')
      if (!items?.length) throw new ApiError(422, 'La factura debe tener al menos un ítem.')
      if (db.all('facturas').some((f) => f.proveedor_id === proveedor_id && f.numero === numero)) {
        throw new ApiError(409, 'Ya existe una factura con ese número para el proveedor.')
      }
      const id = db.nextId('facturas')
      // Se valida todo antes de escribir para no dejar la factura a medias.
      const simulados = []
      for (const it of items) {
        const r = crearMovimiento([...db.all('cardex'), ...simulados], {
          tipo: 'ENTRADA_COMPRA', articulo_id: it.articulo_id, cantidad: it.cantidad,
          costo_unitario: calcularNeto(it.precio_lista, descuentos), usuario_id: u.id, fecha: ahora(), referencia: id,
        })
        if (!r.ok) throw new ApiError(422, r.error)
        simulados.push(r.movimiento)
      }
      const { bruto, neto, iva, total } = calcularFactura(items, descuentos)
      const factura = db.insert('facturas', {
        id, numero, proveedor_id, fecha, items, descuentos, neto_bruto: bruto, neto, iva, total, estado: 'REGISTRADA',
      })
      simulados.forEach((m) => db.insert('cardex', m))
      registrarAuditoria({ entidad: 'FacturaCompra', entidad_id: id, accion: 'CREAR', nuevo: { total: factura.total, items: items.length } })
      return factura
    })
  },
  listNotasCredito() {
    return respond(() => {
      requirePermiso('compras.ver')
      return db.all('notas_credito').slice().reverse()
    })
  },
  createNotaCredito({ factura_id, numero, neto, motivo }) {
    return respond(() => {
      requirePermiso('compras.registrar')
      const f = db.find('facturas', factura_id)
      if (!f) throw new ApiError(422, 'Factura inexistente.')
      const previas = db.all('notas_credito').filter((n) => n.factura_id === factura_id).reduce((s, n) => s + n.neto, 0)
      if (!(neto > 0) || neto + previas > f.neto) throw new ApiError(422, 'El monto excede el neto disponible de la factura.')
      if (!motivo?.trim()) throw new ApiError(422, 'Debe indicar el motivo.')
      const nc = db.insert('notas_credito', { id: db.nextId('notas_credito'), factura_id, numero, fecha: ahora().slice(0, 10), motivo: motivo.trim(), ...desglosarTotal(neto) })
      registrarAuditoria({ entidad: 'NotaCredito', entidad_id: nc.id, accion: 'CREAR', nuevo: { factura_id, total: nc.total } })
      return nc
    })
  },
}
