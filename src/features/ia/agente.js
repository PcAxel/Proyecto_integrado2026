import { ERP_NAV } from '@/layouts/nav'
import { can } from '@/domain/rbac'

/**
 * Agente de navegación y búsqueda: el modelo solo PROPONE; aquí se decide qué se cumple. Es de solo lectura:
 * lo único que puede ocurrir es cambiar de pantalla (con o sin un texto de búsqueda en la URL). Nunca se llama a un servicio que escriba.
 */

const RUTAS_TECNICO = [
  { ruta: '/app', label: 'Inicio' },
  { ruta: '/app/asistencia', label: 'Marcar entrada o salida' },
  { ruta: '/app/hoja-servicio', label: 'Hoja de servicio' },
  { ruta: '/app/retiro', label: 'Pedir materiales' },
  { ruta: '/app/evidencia', label: 'Enviar evidencia fotográfica' },
  { ruta: '/app/documentos', label: 'Mis documentos para firmar' },
  { ruta: '/app/sync', label: 'Envíos pendientes' },
]

/** Pantallas a las que esta persona puede ir: las mismas que ya ve en su menú. @returns {Array<{ruta:string,label:string,buscable:boolean}>} */
export function catalogoDeRutas(user) {
  if (!user) return []
  if (user.rolApi === 'TECNICO') return RUTAS_TECNICO.map((r) => ({ ...r, buscable: false }))
  return ERP_NAV.filter((n) => can(user.rol, n.accion)).map((n) => ({ ruta: n.to, label: n.label, buscable: Boolean(n.buscable) }))
}

const OBRA_A_FACTURAR = /^\/erp\/obras\/(OB-\d{1,6})$/

/**
 * Atajo para facturar: el servidor ubica la obra y pide llevar a la persona hasta su tarjeta de facturación. La ruta se vuelve a validar aquí
 * (solo `/erp/obras/OB-0000`, solo con el permiso de emitir) y la IA nunca emite: en la obra, la persona revisa y pulsa «Emitir».
 */
function rutaDeFacturacion(respuesta, rol) {
  const m = OBRA_A_FACTURAR.exec(String(respuesta?.ruta ?? ''))
  if (respuesta?.accion !== 'navegar' || respuesta.ancla !== 'facturacion' || !m || !can(rol, 'facturacion.emitir')) return null
  return { url: `${m[0]}?facturar=1`, etiqueta: `la obra ${m[1]}`, busqueda: null, ancla: 'facturacion' }
}

/**
 * Convierte la propuesta del servidor en una URL segura, o null si no hay nada que hacer.
 * Se vuelve a validar aquí aunque el servidor ya lo hizo: la ruta debe estar en el catálogo de esta persona.
 * @param {{accion?:string, ruta?:string|null, termino_busqueda?:string|null}} respuesta
 * @param {ReturnType<typeof catalogoDeRutas>} catalogo @param {string} [rol] rol del frontend (para el atajo de facturación)
 * @returns {{url:string, etiqueta:string, busqueda:string|null, ancla?:string}|null}
 */
export function resolverAccion(respuesta, catalogo, rol) {
  const factura = rutaDeFacturacion(respuesta, rol)
  if (factura) return factura
  const destino = catalogo.find((r) => r.ruta === respuesta?.ruta)
  if (!destino || !['navegar', 'buscar'].includes(respuesta?.accion)) return null
  const termino = String(respuesta.termino_busqueda ?? '').trim().slice(0, 80)
  if (respuesta.accion === 'buscar' && destino.buscable && termino) {
    return { url: `${destino.ruta}?buscar=${encodeURIComponent(termino)}`, etiqueta: destino.label, busqueda: termino }
  }
  return { url: destino.ruta, etiqueta: destino.label, busqueda: null }
}
