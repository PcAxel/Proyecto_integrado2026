/**
 * Asistente de IA: qué tarea corresponde a cada rol y cómo se presentan sus resultados. Puro (P3).
 * Las instrucciones del agente (system prompt) viven en el servidor y dependen del rol del usuario autenticado;
 * aquí solo se decide qué formulario mostrar. El servidor vuelve a validar quién puede usar cada tarea.
 */
import { normalizar } from './busqueda.js'
import { formatCLP } from './money.js'

export const TAREAS_IA = {
  factura: {
    titulo: 'Extraer datos de una factura',
    corto: 'Leer factura',
    ayuda: 'Pega el texto de la factura (por ejemplo, copiado de su PDF o de un OCR). El asistente ordena proveedor, fecha, neto, IVA y total para que no los escribas a mano.',
    etiqueta: 'Texto de la factura',
    placeholder: 'Distribuidora Frigotec Ltda. · RUT 76.554.120-4 · Factura N° 4821 · 05-11-2026 · Neto $100.000 · IVA $19.000 · Total $119.000',
    boton: 'Extraer datos',
    min: 10,
    max: 20_000,
  },
  reporte: {
    titulo: 'Redactar un reporte técnico',
    corto: 'Redactar informe',
    ayuda: 'Escribe tus notas cortas del trabajo. El asistente las convierte en un párrafo técnico y claro, listo para pegar en tu hoja de servicio.',
    etiqueta: 'Tus notas del trabajo',
    placeholder: 'cambié filtro, limpié serpentín, recargué 2 kg R410A',
    boton: 'Redactar informe',
    min: 5,
    max: 2_000,
  },
}

const TAREA_POR_ROL = { FINANZAS: 'factura', ADMIN: 'factura', OPERACIONES: 'reporte', TECNICO: 'reporte' }

/** Tarea ESTRUCTURADA (leer factura / redactar informe) de un rol; null si no tiene. La conversación es aparte y es para todos. */
export const tareaIA = (rolApi) => TAREA_POR_ROL[rolApi] ?? null

/** @returns {{ok:true}|{ok:false, error:string}} */
export function validarEntradaIA(tarea, texto) {
  const t = TAREAS_IA[tarea]
  const largo = String(texto ?? '').trim().length
  if (largo < t.min) return { ok: false, error: `Escribe al menos ${t.min} caracteres.` }
  if (largo > t.max) return { ok: false, error: `El texto supera el máximo de ${t.max.toLocaleString('es-CL')} caracteres.` }
  return { ok: true }
}

/** Mensaje en español para un error del asistente (límite de uso, IA sin configurar, etc.). */
export function mensajeErrorIA(err) {
  if (err?.status === 429) return 'Alcanzaste el límite de consultas al asistente. Espera un momento e inténtalo de nuevo.'
  if (err?.code === 'ai_not_configured') return 'El asistente de IA todavía no está activado en este servidor.'
  return err?.message || 'No se pudo consultar al asistente.'
}

const SOLO_DIGITOS_K = (s) => String(s ?? '').replace(/[^0-9kK]/g, '').toUpperCase()

/** Proveedor registrado que coincide con la factura leída: primero por RUT, luego por nombre. */
export function proveedorCoincidente(factura, proveedores) {
  const rut = SOLO_DIGITOS_K(factura.rut_proveedor)
  if (rut.length >= 8) {
    const porRut = proveedores.find((p) => SOLO_DIGITOS_K(p.rut) === rut)
    if (porRut) return porRut
  }
  const nombre = normalizar(factura.proveedor)
  if (nombre.length < 4) return null
  return proveedores.find((p) => normalizar(p.razon_social) === nombre) ?? null
}

/** Texto plano de los datos extraídos, para copiar. */
export function resumenFactura(f) {
  return [
    `Proveedor: ${f.proveedor ?? '—'}`, f.rut_proveedor && `RUT: ${f.rut_proveedor}`, f.numero_factura && `N° factura: ${f.numero_factura}`,
    `Fecha: ${f.fecha ?? '—'}`, `Neto: ${f.monto_neto === null ? '—' : formatCLP(f.monto_neto)}`,
    `IVA: ${f.iva === null ? '—' : formatCLP(f.iva)}`, `Total: ${f.total === null ? '—' : formatCLP(f.total)}`,
  ].filter(Boolean).join('\n')
}


// ───────────────────────── Conversación ─────────────────────────
export const BIENVENIDA_IA = '¡Hola! Soy tu asistente de FYAG. ¿En qué te puedo ayudar hoy?'
export const PLACEHOLDER_CHAT = '¿Qué hacemos hoy? (Ej: Ayúdame a redactar un reporte, o ¿cómo reparo un compresor?)'
export const CHAT = { maxCharsMensaje: 4_000, maxMensajes: 20 }

const ROLES_CON_CHAT = ['ADMIN', 'FINANZAS', 'OPERACIONES', 'TECNICO', 'RRHH']
/** Todos los roles tienen conversación; el servidor decide el perfil según el rol de la sesión. */
export const tieneAsistente = (rolApi) => ROLES_CON_CHAT.includes(rolApi)

/** Mensaje de bienvenida: se genera aquí, no viene del servidor ni gasta una consulta. */
export const mensajeBienvenida = () => ({ id: 'bienvenida', role: 'assistant', content: BIENVENIDA_IA, local: true })

/** Lo que se envía al servidor: solo turnos reales (sin la bienvenida ni los errores), los últimos N. */
export const historialParaEnviar = (mensajes) =>
  mensajes.filter((m) => !m.local && !m.error).slice(-CHAT.maxMensajes).map(({ role, content }) => ({ role, content }))

/** @returns {{ok:true}|{ok:false, error:string}} */
export function validarMensajeChat(texto) {
  const largo = String(texto ?? '').trim().length
  if (largo === 0) return { ok: false, error: 'Escribe tu mensaje.' }
  if (largo > CHAT.maxCharsMensaje) return { ok: false, error: `El mensaje supera los ${CHAT.maxCharsMensaje.toLocaleString('es-CL')} caracteres. Divídelo en partes.` }
  return { ok: true }
}
