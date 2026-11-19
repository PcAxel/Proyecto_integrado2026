import { db } from '@/mocks/db'
import { crearMovimiento, crearReversa, crearReingresoSobrante, estaReversado, cantidadReingresable } from '@/domain/cardex'
import { respond, requirePermiso, ApiError, ahora, sinCostos } from './http'
import { registrarAuditoria } from './auditoria.service'

const vista = (m, rol) => ({
  ...sinCostos(rol, 'costos_compra.ver', m, ['costo_unitario']),
  usuario_nombre: db.find('usuarios', m.usuario_id)?.nombre ?? m.usuario_id,
  lote_codigo: m.lote_id ? db.find('lotes', m.lote_id)?.codigo ?? m.lote_id : null,
  reversado: estaReversado(db.all('cardex'), m.id),
  reingresable: cantidadReingresable(db.all('cardex'), m.id),
})

function persistir(resultado, accion, entidadExtra) {
  if (!resultado.ok) throw new ApiError(422, resultado.error)
  const mov = db.insert('cardex', resultado.movimiento)
  registrarAuditoria({ entidad: 'MovimientoCardex', entidad_id: mov.id, accion, anterior: entidadExtra ?? null, nuevo: mov })
  return mov
}

/** Permiso que exige cada tipo de movimiento (por defecto, el de salidas). Tener uno no habilita los demás. */
const PERMISO_POR_TIPO = { ENTRADA_RECEPCION: 'bodega.recepcionar' }

/**
 * Contrato del Cardex: list, retrieve, create, recepcionar, reversar, reingresarSobrante.
 * NO existe update, patch, remove ni destroy (P1). Un test lo verifica.
 */
export const cardexService = {
  /** @param {{articulo_id?:string, obra_id?:string, tipo?:string}} [f] */
  list(f = {}) {
    return respond(() => {
      const u = requirePermiso('bodega.ver')
      return db.all('cardex')
        .filter((m) => (!f.articulo_id || m.articulo_id === f.articulo_id)
          && (!f.obra_id || m.obra_id === f.obra_id)
          && (!f.tipo || m.tipo === f.tipo))
        .map((m) => vista(m, u.rol))
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
    })
  },
  retrieve(id) {
    return respond(() => {
      const u = requirePermiso('bodega.ver')
      const m = db.find('cardex', id)
      if (!m) throw new ApiError(404, 'Movimiento no encontrado.')
      return vista(m, u.rol)
    })
  },
  /** Entrada manual o salida a obra. Las salidas valoran al costo vigente del artículo. */
  create({ tipo, articulo_id, cantidad, obra_id = null, costo_unitario, referencia = '', lote_id = null }) {
    return respond(() => {
      const u = requirePermiso(PERMISO_POR_TIPO[tipo] ?? 'cardex.crear')
      const articulo = db.find('articulos', articulo_id)
      if (!articulo || !articulo.activo) throw new ApiError(422, 'Artículo inexistente o inactivo.')
      if (obra_id && !db.find('obras', obra_id)) throw new ApiError(422, 'Obra inexistente.')
      const lote = lote_id ? db.find('lotes', lote_id) : null
      if (lote_id && !lote) throw new ApiError(422, 'Lote inexistente.')
      const r = crearMovimiento(db.all('cardex'), {
        tipo, articulo_id, cantidad, obra_id, referencia, lote,
        costo_unitario: costo_unitario ?? articulo.costo_unitario,
        usuario_id: u.id, fecha: ahora(),
      })
      return vista(persistir(r, tipo), u.rol)
    })
  },
  /**
   * Recepción directa de mercadería (guía de despacho): una ENTRADA_RECEPCION por artículo, todo o nada, valorada al costo vigente
   * (el costo real se actualiza cuando llega la factura). @param {{referencia:string, items:Array<{articulo_id:string,cantidad:number}>, orden_compra_id?:string|null}} data (con `orden_compra_id` la recepción queda enlazada a esa orden)
   */
  recepcionar({ referencia, items, orden_compra_id = null }) {
    return respond(() => {
      const u = requirePermiso('bodega.recepcionar')
      if (!items?.length) throw new ApiError(422, 'Agrega al menos un artículo.')
      const simulados = []
      for (const it of items) {
        const a = db.find('articulos', it.articulo_id)
        if (!a?.activo) throw new ApiError(422, 'Hay un artículo inexistente o inactivo.')
        if (simulados.some((m) => m.articulo_id === a.id)) throw new ApiError(422, `Artículo repetido: ${a.sku}.`)
        const r = crearMovimiento([...db.all('cardex'), ...simulados], {
          tipo: 'ENTRADA_RECEPCION', articulo_id: a.id, cantidad: it.cantidad, costo_unitario: a.costo_unitario,
          referencia: referencia ?? '', usuario_id: u.id, fecha: ahora(),
        })
        if (!r.ok) throw new ApiError(422, `${a.sku}: ${r.error}`)
        simulados.push(orden_compra_id ? { ...r.movimiento, orden_compra_id } : r.movimiento)
      }
      return simulados.map((m) => vista(persistir({ ok: true, movimiento: m }, 'ENTRADA_RECEPCION'), u.rol))
    })
  },
  /** Una salida se reversa con una ENTRADA_REVERSA (suma el stock); lleva la nota de justificación y el id del original. */
  reversar(id, motivo) {
    return respond(() => {
      const u = requirePermiso('cardex.reversar')
      const r = crearReversa(db.all('cardex'), id, { usuario_id: u.id, motivo, fecha: ahora() })
      return vista(persistir(r, 'REVERSA', { reversa_de: id }), u.rol)
    })
  },
  reingresarSobrante({ salida_id, cantidad, motivo }) {
    return respond(() => {
      const u = requirePermiso('cardex.reingresar')
      const r = crearReingresoSobrante(db.all('cardex'), { salida_id, cantidad, motivo, usuario_id: u.id, fecha: ahora() })
      return vista(persistir(r, 'REINGRESO_SOBRANTE', { salida_origen_id: salida_id }), u.rol)
    })
  },
}
