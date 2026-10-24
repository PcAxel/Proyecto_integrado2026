import { db } from '@/mocks/db'
import { calcularStock, estadoStock } from '@/domain/cardex'
import { can } from '@/domain/rbac'
import { respond, requirePermiso, actor, ApiError, sinCostos } from './http'
import { registrarAuditoria } from './auditoria.service'

/** Añade stock derivado (nunca almacenado) y oculta costo según rol. */
function vista(a, rol) {
  const stock = calcularStock(db.all('cardex'), a.id)
  return { ...sinCostos(rol, 'costos_compra.ver', a, ['costo_unitario']), stock, estado_stock: estadoStock(stock, a.stock_minimo) }
}

export const articulosService = {
  /** @param {{q?:string, categoria?:string, incluirInactivos?:boolean}} [f] */
  list(f = {}) {
    return respond(() => {
      const u = requirePermiso('bodega.ver')
      const q = f.q?.trim().toLowerCase()
      return db.all('articulos')
        .filter((a) => (f.incluirInactivos || a.activo)
          && (!f.categoria || a.categoria === f.categoria)
          && (!q || a.nombre.toLowerCase().includes(q) || a.sku.toLowerCase().includes(q)))
        .map((a) => vista(a, u.rol))
    })
  },
  /** Catálogo liviano para el escáner de la PWA: sin costos ni stock exacto. */
  catalogo() {
    return respond(() => {
      const u = actor()
      if (!can(u.rol, 'bodega.ver') && !can(u.rol, 'pwa.usar')) throw new ApiError(403, 'No tiene permiso para ver el catálogo.')
      return db.all('articulos').filter((a) => a.activo)
        .map(({ id, sku, nombre, categoria, unidad }) => ({ id, sku, nombre, categoria, unidad }))
    })
  },
  retrieve(id) {
    return respond(() => {
      const u = requirePermiso('bodega.ver')
      const a = db.find('articulos', id)
      if (!a) throw new ApiError(404, 'Artículo no encontrado.')
      return vista(a, u.rol)
    })
  },
  create(data) {
    return respond(() => {
      requirePermiso('articulos.gestionar')
      if (db.all('articulos').some((a) => a.sku === data.sku)) throw new ApiError(409, 'Ya existe un artículo con ese SKU.')
      const row = db.insert('articulos', { activo: true, costo_unitario: 0, stock_minimo: 0, ...data, id: db.nextId('articulos') })
      registrarAuditoria({ entidad: 'Articulo', entidad_id: row.id, accion: 'CREAR', nuevo: row })
      return vista(row, actor().rol)
    })
  },
  /** Edita datos maestros. El stock no es editable: solo cambia con movimientos de Cardex. */
  update(id, cambios) {
    return respond(() => {
      requirePermiso('articulos.gestionar')
      const a = db.find('articulos', id)
      if (!a) throw new ApiError(404, 'Artículo no encontrado.')
      const { id: _i, activo: _a, stock: _s, ...permitidos } = cambios
      const anterior = { ...a }
      db.patch('articulos', id, permitidos)
      registrarAuditoria({ entidad: 'Articulo', entidad_id: id, accion: 'ACTUALIZAR', anterior, nuevo: { ...a } })
      return vista(a, actor().rol)
    })
  },
  /** Reemplaza al borrado: un artículo con historial se desactiva. */
  setActivo(id, activo) {
    return respond(() => {
      requirePermiso('articulos.gestionar')
      const a = db.find('articulos', id)
      if (!a) throw new ApiError(404, 'Artículo no encontrado.')
      const anterior = a.activo
      db.patch('articulos', id, { activo })
      registrarAuditoria({ entidad: 'Articulo', entidad_id: id, accion: activo ? 'ACTIVAR' : 'DESACTIVAR', anterior: { activo: anterior }, nuevo: { activo } })
      return vista(a, actor().rol)
    })
  },
}
