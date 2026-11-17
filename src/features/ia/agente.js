import { ERP_NAV, itemVisible } from '@/layouts/nav'
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
  return ERP_NAV.filter((n) => itemVisible(n, user.rol)).map((n) => ({ ruta: n.to, label: n.label, buscable: Boolean(n.buscable) }))
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


/** Formularios que el agente puede completar (nunca enviar), con el permiso que exige cada uno. Espejo de `FORMULARIOS` del servidor. */
const FORMULARIOS = {
  'cliente-nuevo': { ruta: '/erp/maestros', permisos: ['clientes.gestionar', 'maestros.gestionar'], campos: ['rut', 'razon_social', 'giro', 'comuna', 'contacto', 'telefono', 'email'] },
}
const ID = /^[a-z0-9-]{1,40}$/
const texto = (v, largo) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, largo)

/**
 * Convierte las `ui_actions` del servidor en un plan ejecutable por el cursor del agente, volviendo a validar cada acción aquí:
 * la pantalla debe estar en el catálogo de esta persona, el objetivo debe ser un identificador simple y el formulario debe ser uno
 * conocido para el que tenga permiso. Lo que no pasa la validación se descarta en silencio (el servidor ya lo había filtrado).
 * @param {Array<object>} acciones `ui_actions` de la respuesta  @param {ReturnType<typeof catalogoDeRutas>} catalogo  @param {string} rol
 * @param {ReturnType<typeof resolverAccion>} [accion] la navegación ya resuelta por `resolverAccion` (trae la URL exacta, p. ej. la de facturación)
 */
export function planDeAcciones(acciones, catalogo, rol, accion = null) {
  const enCatalogo = (ruta) => catalogo.find((r) => r.ruta === ruta)
  const plan = []
  for (const a of Array.isArray(acciones) ? acciones.slice(0, 8) : []) {
    if (a?.tipo === 'NAVIGATE') {
      // La URL de navegación es la que validó `resolverAccion`; sin ella solo se acepta una pantalla del catálogo.
      const destino = enCatalogo(a.ruta)
      if (accion && !accion.busqueda) plan.push({ tipo: 'NAVIGATE', url: accion.url, etiqueta: accion.etiqueta })
      else if (destino) plan.push({ tipo: 'NAVIGATE', url: destino.ruta, etiqueta: destino.label })
    } else if (a?.tipo === 'SEARCH_OR_FILTER') {
      const destino = enCatalogo(a.ruta)
      const t = texto(a.texto, 80)
      if (destino?.buscable && t) plan.push({ tipo: 'SEARCH_OR_FILTER', url: `${destino.ruta}?buscar=${encodeURIComponent(t)}`, texto: t, objetivo: 'search-input', etiqueta: destino.label })
    } else if (a?.tipo === 'GLOBAL_SEARCH') {
      // Buscador general (Ctrl+K): solo para quien tiene el ERP completo (su catálogo trae «Inicio»). Lo que muestra lo filtra el rol, no la IA.
      const t = texto(a.texto, 80)
      if (t && enCatalogo('/erp')) plan.push({ tipo: 'GLOBAL_SEARCH', texto: t, objetivo: 'search-input' })
    } else if (a?.tipo === 'HIGHLIGHT_ELEMENT') {
      const destino = enCatalogo(a.ruta)
      if (destino && ID.test(String(a.objetivo ?? ''))) plan.push({ tipo: 'HIGHLIGHT_ELEMENT', url: destino.ruta, objetivo: a.objetivo, descripcion: texto(a.descripcion, 80), etiqueta: destino.label })
    } else if (a?.tipo === 'FILL_FORM') {
      const f = FORMULARIOS[a.formulario]
      const destino = f && enCatalogo(f.ruta)
      if (!destino || !f.permisos.some((p) => can(rol, p)) || !ID.test(String(a.abrir ?? '')) || !ID.test(String(a.confirmar ?? ''))) continue
      const campos = Object.fromEntries(Object.entries(a.campos ?? {}).filter(([k]) => f.campos.includes(k)).map(([k, v]) => [k, texto(v, 120)]).filter(([, v]) => v))
      if (Object.keys(campos).length) plan.push({ tipo: 'FILL_FORM', url: destino.ruta, etiqueta: destino.label, nombre: texto(a.nombre, 40) || 'el formulario', abrir: a.abrir, confirmar: a.confirmar, campos })
    }
  }
  // Una navegación seguida de una búsqueda en la misma pantalla se funde en la búsqueda (que ya lleva a esa pantalla con el filtro).
  return plan.filter((p, i) => !(p.tipo === 'NAVIGATE' && plan[i + 1]?.tipo === 'SEARCH_OR_FILTER' && plan[i + 1].url.split('?')[0] === p.url))
}

/** Frase de lo que hizo el agente, para dejar constancia bajo su mensaje. */
export function resumenDePlan(plan) {
  return plan.map((p) => (p.tipo === 'NAVIGATE' ? `Te llevé a ${p.etiqueta}` : p.tipo === 'SEARCH_OR_FILTER' ? `Busqué «${p.texto}» en ${p.etiqueta}` : p.tipo === 'GLOBAL_SEARCH' ? `Busqué «${p.texto}» en el buscador general`
    : p.tipo === 'HIGHLIGHT_ELEMENT' ? `Te mostré ${p.descripcion || 'dónde está'}` : `Completé «${p.nombre}» (falta que lo confirmes)`)).join(' · ')
}
