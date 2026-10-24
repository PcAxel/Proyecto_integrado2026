import { initDb } from '@/mocks/db'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'
import { isoLocal } from '@/domain/format'

/** Error con la forma de una respuesta DRF: { status, message, detail }. */
export class ApiError extends Error {
  constructor(status, message, detail = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

const config = { minMs: 300, maxMs: 700, failRate: 0 }

/** Ajusta latencia y tasa de fallos simulados (pruebas o demos de error). */
export function configureHttp(partial) {
  Object.assign(config, partial)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const clone = (v) => (v === undefined ? v : structuredClone(v))

/**
 * Ejecuta un handler como si fuera una llamada a la API: espera la DB, simula latencia
 * y fallos de red, y devuelve una copia (los componentes nunca mutan la "base de datos").
 * @template T
 * @param {() => T} handler
 * @returns {Promise<T>}
 */
export async function respond(handler) {
  await initDb()
  if (config.maxMs > 0) await wait(config.minMs + Math.random() * (config.maxMs - config.minMs))
  if (Math.random() < config.failRate) throw new ApiError(503, 'Servicio no disponible. Reintente.')
  return clone(handler())
}

/** Usuario autenticado o 401. */
export function actor() {
  const user = useAuthStore.getState().user
  if (!user) throw new ApiError(401, 'Sesión no iniciada.')
  return user
}

/** Exige permiso RBAC o responde 403. @returns el usuario */
export function requirePermiso(accion) {
  const user = actor()
  if (!can(user.rol, accion)) throw new ApiError(403, 'No tiene permiso para realizar esta acción.', { accion })
  return user
}

/** Marca de tiempo local ISO sin zona, consistente con el seed. */
export const ahora = () => isoLocal()

/** Quita campos de costo si el rol no puede verlos (P5). */
export function sinCostos(rol, accion, row, campos) {
  if (can(rol, accion)) return row
  const copia = { ...row }
  campos.forEach((c) => delete copia[c])
  return copia
}
