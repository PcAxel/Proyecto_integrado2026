/**
 * Cliente HTTP central hacia Django. Toda la app habla con el servidor por aquí:
 * - inyecta `Authorization: Bearer <access>` en cada petición autenticada;
 * - 401 → renueva el token una vez; si no se puede, cierra la sesión;
 * - 403 → bloquea la vista (o redirige a los términos si falta aceptarlos);
 * - fallo de red → marca el servidor como caído y bloquea la app.
 */
import { useServerStore, MENSAJE_SIN_CONEXION } from '@/stores/serverStore'

export const API_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '')

/** Error de la API con la forma { status, code, message, data }. */
export class ApiError extends Error {
  constructor(status, message, { code = null, data = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.data = data
  }
}

/** Extrae un mensaje legible de un error DRF (detail, errores por campo o lista). */
export function mensajeDeError(data, status) {
  if (data?.detail) return String(data.detail)
  if (data && typeof data === 'object') {
    const primero = Object.entries(data).filter(([k]) => k !== 'code').map(([, v]) => v).flat()[0]
    if (primero) return String(primero)
  }
  if (status === 429) return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.'
  return 'No se pudo completar la operación.'
}

// El store de autenticación se registra aquí al cargarse (evita una importación circular).
let sesion = { access: () => null, guardarSesion: () => {}, expirar: () => {}, terminosPendientes: () => {} }
export const configurarSesion = (hooks) => { sesion = { ...sesion, ...hooks } }

async function llamar(path, { method = 'GET', body, form, token }) {
  const headers = { Accept: 'application/json', 'X-FYAG-Client': 'web' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    // credentials: la cookie HttpOnly de renovación es lo único que persiste de la sesión; el access token vive solo en memoria.
    res = await fetch(`${API_URL}${path}`, { method, headers, credentials: 'include', body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) })
  } catch {
    useServerStore.getState().marcarCaido()
    throw new ApiError(0, MENSAJE_SIN_CONEXION)
  }
  useServerStore.getState().marcarOk()
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  return { res, data }
}

let renovando = null
/** Renueva el access token con la cookie HttpOnly; las peticiones simultáneas comparten una sola renovación. */
function renovar() {
  renovando ??= (async () => {
    const { res, data } = await llamar('/auth/refresh/', { method: 'POST' })
    if (!res.ok) return false
    sesion.guardarSesion(data)
    return true
  })().finally(() => { renovando = null })
  return renovando
}

/**
 * @param {string} path
 * @param {{method?: string, body?: any, form?: FormData, auth?: boolean}} [opts]
 */
export async function request(path, { method = 'GET', body, form, auth = true } = {}) {
  let { res, data } = await llamar(path, { method, body, form, token: auth ? sesion.access() : null })

  if (auth && res.status === 401) {
    if (await renovar()) ({ res, data } = await llamar(path, { method, body, form, token: sesion.access() }))
    if (res.status === 401) {
      sesion.expirar('Tu sesión expiró. Inicia sesión nuevamente.')
      throw new ApiError(401, 'Sesión expirada.', { code: 'not_authenticated' })
    }
  }
  if (!res.ok) {
    const code = data?.code ?? null
    const message = mensajeDeError(data, res.status)
    if (auth && res.status === 403) {
      if (code === 'terms_not_accepted') sesion.terminosPendientes()
      else useServerStore.getState().denegar(message)
    }
    throw new ApiError(res.status, message, { code, data })
  }
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  postForm: (path, form) => request(path, { method: 'POST', form }),
  patchForm: (path, form) => request(path, { method: 'PATCH', form }),
}

/** Latido del servidor: true si Django y su base de datos responden. */
export async function servidorDisponible() {
  try {
    const { res } = await llamar('/health/', { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/** Descarga un recurso protegido (p. ej. una foto) como URL local para <img>. */
export async function blobUrl(path) {
  const pedir = (token) => fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  let res
  try { res = await pedir(sesion.access()) } catch { useServerStore.getState().marcarCaido(); throw new ApiError(0, MENSAJE_SIN_CONEXION) }
  if (res.status === 401 && await renovar()) res = await pedir(sesion.access())
  if (!res.ok) throw new ApiError(res.status, 'No se pudo cargar la imagen.')
  return URL.createObjectURL(await res.blob())
}

/** Baja un archivo protegido (contrato, comprobante) con la sesión y lo entrega al navegador como descarga. */
export async function descargarArchivo(path, nombre) {
  const pedir = (token) => fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}`, 'X-FYAG-Client': 'web' } })
  let res
  try { res = await pedir(sesion.access()) } catch { useServerStore.getState().marcarCaido(); throw new ApiError(0, MENSAJE_SIN_CONEXION) }
  if (res.status === 401 && await renovar()) res = await pedir(sesion.access())
  if (!res.ok) throw new ApiError(res.status, 'No se pudo descargar el archivo.')
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Bytes de un archivo protegido (para visores como el de PDF; evita blob: URLs, que la CSP no permite en connect-src). */
export async function bytesProtegidos(path) {
  const pedir = (token) => fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}`, 'X-FYAG-Client': 'web' } })
  let res
  try { res = await pedir(sesion.access()) } catch { useServerStore.getState().marcarCaido(); throw new ApiError(0, MENSAJE_SIN_CONEXION) }
  if (res.status === 401 && await renovar()) res = await pedir(sesion.access())
  if (!res.ok) throw new ApiError(res.status, 'No se pudo cargar el documento.')
  return new Uint8Array(await res.arrayBuffer())
}
