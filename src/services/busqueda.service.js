import { db } from '@/mocks/db'
import { can, ROL_LABEL } from '@/domain/rbac'
import { respond, actor } from './http'

const ESTADO_OBRA = { PLANIFICADA: 'Planificada', EN_CURSO: 'En curso', FINALIZADA: 'Finalizada' }
const ESTADO_PRESUPUESTO = { BORRADOR: 'Borrador', ENVIADO: 'Enviado', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado' }
const ESTADO_HOJA = { ENVIADA: 'Por auditar', APROBADA: 'Aprobada', DEVUELTA: 'Devuelta' }

/**
 * Índice para la búsqueda global. Incluye solo lo que el rol puede ver: nunca costos, tarifas ni claves.
 * Cada ítem lleva la ruta a la que se navega al elegirlo.
 */
export const busquedaService = {
  indice() {
    return respond(() => {
      const { rol } = actor()
      const ve = (accion) => can(rol, accion)
      const cliente = (id) => db.find('clientes', id)?.razon_social ?? id
      const items = []

      if (ve('obras.ver')) {
        db.all('obras').forEach((o) => items.push({
          id: `obra-${o.id}`, grupo: 'Obras', icono: 'obra', codigo: o.id, titulo: o.nombre,
          subtitulo: `${cliente(o.cliente_id)} · ${ESTADO_OBRA[o.estado]}`, keywords: [o.tipo, o.ubicacion.comuna, o.presupuesto_id ?? 'cu30 sin presupuesto'], ruta: `/erp/obras/${o.id}`,
        }))
      }
      if (ve('presupuestos.ver')) {
        db.all('presupuestos').forEach((p) => items.push({
          id: `pre-${p.id}`, grupo: 'Presupuestos', icono: 'presupuesto', codigo: p.id, titulo: p.titulo,
          subtitulo: `${cliente(p.cliente_id)} · ${ESTADO_PRESUPUESTO[p.estado]}`, ruta: `/erp/presupuestos/${p.id}`,
        }))
      }
      if (ve('personal.ver')) {
        db.all('personal').forEach((p) => items.push({
          id: `per-${p.id}`, grupo: 'Personal', icono: 'persona', codigo: p.id, titulo: p.nombre,
          subtitulo: `${p.cargo}${p.activo ? '' : ' · Inactivo'}`, keywords: [p.rut], ruta: `/erp/personal?tab=fichas&buscar=${encodeURIComponent(p.nombre)}`,
        }))
        db.all('flota').forEach((v) => items.push({
          id: `veh-${v.id}`, grupo: 'Vehículos', icono: 'vehiculo', codigo: v.patente, titulo: `${v.patente} · ${v.marca} ${v.modelo}`,
          subtitulo: v.estado === 'EN_TALLER' ? 'En taller' : 'Activo', keywords: [db.find('personal', v.tecnico_id)?.nombre ?? ''], ruta: `/erp/personal?tab=flota&buscar=${encodeURIComponent(v.patente)}`,
        }))
      }
      if (ve('bodega.ver')) {
        db.all('articulos').filter((a) => a.activo).forEach((a) => items.push({
          id: `art-${a.id}`, grupo: 'Artículos', icono: 'articulo', codigo: a.sku, titulo: a.nombre,
          subtitulo: a.categoria, ruta: `/erp/bodega?tab=cardex&articulo=${a.id}`,
        }))
      }
      if (ve('terreno.ver')) {
        db.all('hojas').forEach((h) => items.push({
          id: `hoja-${h.id}`, grupo: 'Hojas de servicio', icono: 'hoja', codigo: h.id, titulo: `Hoja ${h.id} · ${db.find('obras', h.obra_id)?.nombre ?? h.obra_id}`,
          subtitulo: `${db.find('personal', h.tecnico_id)?.nombre ?? ''} · ${ESTADO_HOJA[h.estado]}`, keywords: [h.obra_id], ruta: `/erp/terreno?hoja=${h.id}`,
        }))
      }
      if (ve('clientes.ver')) {
        db.all('clientes').forEach((c) => items.push({
          id: `cli-${c.id}`, grupo: 'Clientes', icono: 'empresa', codigo: c.rut, titulo: c.razon_social, subtitulo: `${c.comuna} · ${c.contacto}`, ruta: '/erp/maestros?tab=clientes',
        }))
      }
      if (ve('proveedores.ver') && ve('maestros.ver')) {
        db.all('proveedores').forEach((p) => items.push({
          id: `prv-${p.id}`, grupo: 'Proveedores', icono: 'empresa', codigo: p.rut, titulo: p.razon_social, subtitulo: `${p.comuna} · ${p.contacto}`, ruta: '/erp/maestros?tab=proveedores',
        }))
      }
      if (ve('usuarios.ver')) {
        db.all('usuarios').forEach((u) => items.push({
          id: `usr-${u.id}`, grupo: 'Usuarios', icono: 'usuario', codigo: u.rut, titulo: u.nombre,
          subtitulo: `${u.cargo} · ${ROL_LABEL[u.rol]}${u.activo ? '' : ' · Desactivado'}`, keywords: [u.email], ruta: `/erp/usuarios?buscar=${encodeURIComponent(u.nombre)}`,
        }))
      }
      return items
    })
  },
}
