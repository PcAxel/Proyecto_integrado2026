import { db } from '@/mocks/db'
import { simularRentabilidad, puedeAprobarPresupuesto, promedioTarifasPorCargo } from '@/domain/rentabilidad'
import { respond, requirePermiso, actor, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'

const conSimulacion = (p) => ({
  ...p,
  simulacion: simularRentabilidad(p),
  obra_id: db.all('obras').find((o) => o.presupuesto_id === p.id)?.id ?? null,
})
const EDITABLES = ['BORRADOR', 'ENVIADO']

function cambiarEstado(id, estado, accion, extra = {}) {
  const p = db.find('presupuestos', id)
  if (!p) throw new ApiError(404, 'Presupuesto no encontrado.')
  const anterior = p.estado
  db.patch('presupuestos', id, { estado, ...extra })
  registrarAuditoria({ entidad: 'Presupuesto', entidad_id: id, accion, anterior: { estado: anterior }, nuevo: { estado, ...extra } })
  return conSimulacion(p)
}

/** Un presupuesto APROBADO es inmutable y no se elimina (P2). */
export const presupuestosService = {
  /** Artículos con último costo, solo para armar presupuestos (el editor no tiene acceso a Bodega). */
  catalogoMateriales() {
    return respond(() => {
      requirePermiso('presupuestos.crear')
      return db.all('articulos').filter((a) => a.activo)
        .map(({ id, sku, nombre, unidad, costo_unitario }) => ({ id, sku, nombre, unidad, costo_unitario }))
    })
  },
  /** Tarifas hora-hombre promedio por cargo (no expone fichas individuales). */
  tarifas() {
    return respond(() => {
      requirePermiso('presupuestos.crear')
      return promedioTarifasPorCargo(db.all('personal'))
    })
  },
  list({ estado, cliente_id } = {}) {
    return respond(() => {
      requirePermiso('presupuestos.ver')
      return db.all('presupuestos')
        .filter((p) => (!estado || p.estado === estado) && (!cliente_id || p.cliente_id === cliente_id))
        .map(conSimulacion).reverse()
    })
  },
  retrieve(id) {
    return respond(() => {
      requirePermiso('presupuestos.ver')
      const p = db.find('presupuestos', id)
      if (!p) throw new ApiError(404, 'Presupuesto no encontrado.')
      return conSimulacion(p)
    })
  },
  create(data) {
    return respond(() => {
      requirePermiso('presupuestos.crear')
      if (!db.find('clientes', data.cliente_id)) throw new ApiError(422, 'Cliente inexistente.')
      const p = db.insert('presupuestos', {
        materiales: [], mano_obra: [], adicionales: [], precio_venta_neto: 0, ...data,
        id: db.nextId('presupuestos'), estado: 'BORRADOR', fecha: ahora().slice(0, 10), aprobado_por: null,
      })
      registrarAuditoria({ entidad: 'Presupuesto', entidad_id: p.id, accion: 'CREAR', nuevo: { titulo: p.titulo } })
      return conSimulacion(p)
    })
  },
  update(id, cambios) {
    return respond(() => {
      requirePermiso('presupuestos.crear')
      const p = db.find('presupuestos', id)
      if (!p) throw new ApiError(404, 'Presupuesto no encontrado.')
      if (!EDITABLES.includes(p.estado)) throw new ApiError(409, `Un presupuesto ${p.estado} no puede modificarse.`)
      const { id: _i, estado: _e, aprobado_por: _a, ...permitidos } = cambios
      const anterior = { precio_venta_neto: p.precio_venta_neto, titulo: p.titulo }
      db.patch('presupuestos', id, permitidos)
      registrarAuditoria({ entidad: 'Presupuesto', entidad_id: id, accion: 'ACTUALIZAR', anterior, nuevo: { precio_venta_neto: p.precio_venta_neto, titulo: p.titulo } })
      return conSimulacion(p)
    })
  },
  enviar(id) {
    return respond(() => {
      requirePermiso('presupuestos.crear')
      const p = db.find('presupuestos', id)
      if (p?.estado !== 'BORRADOR') throw new ApiError(409, 'Solo un borrador puede enviarse.')
      return cambiarEstado(id, 'ENVIADO', 'ENVIAR')
    })
  },
  aprobar(id) {
    return respond(() => {
      const u = actor()
      const p = db.find('presupuestos', id)
      if (!p) throw new ApiError(404, 'Presupuesto no encontrado.')
      if (p.estado !== 'ENVIADO') throw new ApiError(409, 'Solo un presupuesto ENVIADO puede aprobarse.')
      const chequeo = puedeAprobarPresupuesto(u.rol, simularRentabilidad(p))
      if (!chequeo.ok) throw new ApiError(403, chequeo.motivo)
      return cambiarEstado(id, 'APROBADO', 'APROBAR', { aprobado_por: u.id })
    })
  },
  rechazar(id, motivo) {
    return respond(() => {
      requirePermiso('presupuestos.aprobar')
      const p = db.find('presupuestos', id)
      if (p?.estado !== 'ENVIADO') throw new ApiError(409, 'Solo un presupuesto ENVIADO puede rechazarse.')
      if (!motivo?.trim()) throw new ApiError(422, 'Debe indicar el motivo.')
      return cambiarEstado(id, 'RECHAZADO', 'RECHAZAR', { motivo_rechazo: motivo.trim() })
    })
  },
}
