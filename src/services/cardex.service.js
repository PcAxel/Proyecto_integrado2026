import { db } from '@/mocks/db'
import { crearMovimiento, crearReversa, crearReingresoSobrante, estaReversado, cantidadReingresable } from '@/domain/cardex'
import { respond, requirePermiso, ApiError, ahora, sinCostos } from './http'
import { registrarAuditoria } from './auditoria.service'

const vista = (m, rol) => ({
  ...sinCostos(rol, 'costos_compra.ver', m, ['costo_unitario']),
  reversado: estaReversado(db.all('cardex'), m.id),
  reingresable: cantidadReingresable(db.all('cardex'), m.id),
})

function persistir(resultado, accion, entidadExtra) {
  if (!resultado.ok) throw new ApiError(422, resultado.error)
  const mov = db.insert('cardex', resultado.movimiento)
  registrarAuditoria({ entidad: 'MovimientoCardex', entidad_id: mov.id, accion, anterior: entidadExtra ?? null, nuevo: mov })
  return mov
}

/**
 * Contrato del Cardex: list, retrieve, create, reversar, reingresarSobrante.
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
  create({ tipo, articulo_id, cantidad, obra_id = null, costo_unitario, referencia = '' }) {
    return respond(() => {
      const u = requirePermiso('cardex.crear')
      const articulo = db.find('articulos', articulo_id)
      if (!articulo || !articulo.activo) throw new ApiError(422, 'Artículo inexistente o inactivo.')
      if (obra_id && !db.find('obras', obra_id)) throw new ApiError(422, 'Obra inexistente.')
      const r = crearMovimiento(db.all('cardex'), {
        tipo, articulo_id, cantidad, obra_id, referencia,
        costo_unitario: costo_unitario ?? articulo.costo_unitario,
        usuario_id: u.id, fecha: ahora(),
      })
      return vista(persistir(r, tipo), u.rol)
    })
  },
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
