import { db } from '@/mocks/db'
import { validarRut } from '@/domain/rut'
import { respond, requirePermiso, ApiError } from './http'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'
import { registrarAuditoria } from './auditoria.service'

/** Fábrica de CRUD sin borrado para maestros: se desactivan (P2). */
function crearMaestro(tabla, entidad, permisoVer = 'maestros.ver', permisosGestion = ['maestros.gestionar']) {
  // Basta una de las acciones (igual que en el servidor): Finanzas gestiona ambos maestros; Comercial, solo clientes.
  // Devuelve la acción que este usuario tiene; si no tiene ninguna, la primera, que `requirePermiso` rechaza con 403.
  const gestion = () => permisosGestion.find((a) => can(useAuthStore.getState().user?.rol, a)) ?? permisosGestion[0]
  const buscar = (id) => {
    const r = db.find(tabla, id)
    if (!r) throw new ApiError(404, `${entidad} no encontrado.`)
    return r
  }
  return {
    list({ incluirInactivos = false } = {}) {
      return respond(() => {
        requirePermiso(permisoVer)
        return db.all(tabla).filter((r) => incluirInactivos || r.activo)
      })
    },
    retrieve(id) {
      return respond(() => {
        requirePermiso(permisoVer)
        return buscar(id)
      })
    },
    create(data) {
      return respond(() => {
        requirePermiso(gestion())
        if (!validarRut(data.rut)) throw new ApiError(422, 'RUT inválido.')
        if (db.all(tabla).some((r) => r.rut === data.rut)) throw new ApiError(409, 'Ya existe un registro con ese RUT.')
        const row = db.insert(tabla, { ...data, id: db.nextId(tabla), activo: true })
        registrarAuditoria({ entidad, entidad_id: row.id, accion: 'CREAR', nuevo: { rut: row.rut, razon_social: row.razon_social } })
        return row
      })
    },
    update(id, cambios) {
      return respond(() => {
        requirePermiso(gestion())
        const r = buscar(id)
        const { id: _i, activo: _a, rut: _r, ...permitidos } = cambios
        const anterior = { ...r }
        db.patch(tabla, id, permitidos)
        registrarAuditoria({ entidad, entidad_id: id, accion: 'ACTUALIZAR', anterior, nuevo: { ...r } })
        return r
      })
    },
    setActivo(id, activo) {
      return respond(() => {
        requirePermiso(gestion())
        const r = buscar(id)
        db.patch(tabla, id, { activo })
        registrarAuditoria({ entidad, entidad_id: id, accion: activo ? 'ACTIVAR' : 'DESACTIVAR', anterior: { activo: !activo }, nuevo: { activo } })
        return r
      })
    },
  }
}

export const clientesService = crearMaestro('clientes', 'Cliente', 'clientes.ver', ['maestros.gestionar', 'clientes.gestionar'])
export const proveedoresService = crearMaestro('proveedores', 'Proveedor', 'proveedores.ver')
