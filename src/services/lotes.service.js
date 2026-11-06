import { db } from '@/mocks/db'
import { estaReversado, restanteLote, TIPOS_MOV } from '@/domain/cardex'
import { codigoDeLote, unidadesSinEtiquetar } from '@/domain/etiquetas'
import { respond, requirePermiso, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'

const vista = (l) => {
  const a = db.find('articulos', l.articulo_id)
  return { ...l, articulo_sku: a?.sku ?? '', articulo_nombre: a?.nombre ?? l.articulo_id, unidad: a?.unidad ?? '', restante: restanteLote(l, db.all('cardex')) }
}

/**
 * Lotes y cilindros con número propio: cada uno lleva su QR, así se sabe de qué compra salió y a qué obra fue.
 * Un lote nace siempre de una entrada de compra y no puede etiquetar más unidades de las compradas.
 */
export const lotesService = {
  list({ articulo_id, conSaldo = false } = {}) {
    return respond(() => {
      requirePermiso('bodega.ver')
      return db.all('lotes')
        .filter((l) => (!articulo_id || l.articulo_id === articulo_id))
        .map(vista).filter((l) => !conSaldo || l.restante > 0)
        .sort((a, b) => b.id.localeCompare(a.id))
    })
  },
  /** Entradas de compra con unidades todavía sin etiquetar (para crear sus lotes). */
  entradasPorEtiquetar() {
    return respond(() => {
      requirePermiso('bodega.ver')
      return db.all('cardex')
        .filter((m) => m.tipo === TIPOS_MOV.ENTRADA_COMPRA && !estaReversado(db.all('cardex'), m.id))
        .map((m) => {
          const a = db.find('articulos', m.articulo_id)
          return { movimiento_id: m.id, factura_id: m.referencia, fecha: m.fecha, articulo_id: m.articulo_id, sku: a?.sku, nombre: a?.nombre, unidad: a?.unidad,
            cantidad: m.cantidad, pendientes: unidadesSinEtiquetar(m, db.all('lotes')) }
        })
        .filter((e) => e.pendientes > 0)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
    })
  },
  /**
   * SERIE: crea una unidad por cada una de `cantidad` (un QR por cilindro/equipo). LOTE: crea un solo lote con `cantidad`.
   * @param {{movimiento_id:string, tipo:'LOTE'|'SERIE', cantidad:number, codigo_proveedor?:string, vencimiento?:string}} data
   */
  crear({ movimiento_id, tipo, cantidad, codigo_proveedor = '', vencimiento = null }) {
    return respond(() => {
      const u = requirePermiso('cardex.crear')
      const mov = db.find('cardex', movimiento_id)
      if (!mov || mov.tipo !== TIPOS_MOV.ENTRADA_COMPRA) throw new ApiError(422, 'El lote debe nacer de una entrada de compra.')
      const a = db.find('articulos', mov.articulo_id)
      if (!(cantidad > 0)) throw new ApiError(422, 'La cantidad debe ser mayor que cero.')
      const pendientes = unidadesSinEtiquetar(mov, db.all('lotes'))
      if (cantidad > pendientes) throw new ApiError(422, `Solo quedan ${pendientes} unidad(es) de esa compra sin etiquetar.`)
      const partes = tipo === 'SERIE' ? Array.from({ length: cantidad }, () => 1) : [cantidad]
      const creados = partes.map((c) => {
        const id = db.nextId('lotes')
        return db.insert('lotes', {
          id, articulo_id: mov.articulo_id, movimiento_id, tipo, cantidad: c, codigo: codigoDeLote(a, id), factura_id: mov.referencia,
          fecha_ingreso: ahora().slice(0, 10), creado_por: u.id, vencimiento: vencimiento || null, codigo_proveedor: codigo_proveedor.trim() || null,
        })
      })
      registrarAuditoria({ entidad: 'Lote', entidad_id: creados[0].id, accion: 'CREAR_LOTES', nuevo: { articulo_id: mov.articulo_id, tipo, unidades: cantidad, movimiento_id } })
      return creados.map(vista)
    })
  },
}
