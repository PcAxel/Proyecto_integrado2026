import { initDb, refrescar, confirmar, descartar, hayDatos } from '@/mocks/db'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'
import { isoLocal } from '@/domain/format'
import { ApiError } from './api'

export { ApiError }

/** Latencia y fallos simulados: solo existen en pruebas; contra el servidor real no se usan. */
const config = { minMs: 300, maxMs: 700, failRate: 0 }
export function configureHttp(partial) {
  Object.assign(config, partial)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const clone = (v) => (v === undefined ? v : structuredClone(v))
const EN_PRUEBAS = import.meta.env.MODE === 'test'
/** Los datos locales se consideran vigentes este tiempo; pasado, se vuelven a leer del servidor antes de responder. */
const VIGENCIA_MS = 3000

/**
 * Ejecuta un handler de servicio contra la instantánea del servidor y confirma sus escrituras en un lote atómico.
 * - Antes de leer refresca la instantánea si está vieja (otros usuarios pueden haber escrito).
 * - Si el servidor rechaza el lote, descarta lo local y propaga el mensaje del servidor.
 * - Si otro usuario tomó el mismo id (409 conflicto_id), reintenta con datos frescos hasta 3 veces.
 * @template T
 * @param {() => T | Promise<T>} handler
 * @returns {Promise<Awaited<T>>}
 */
export async function respond(handler) {
  for (let intento = 0; ; intento++) {
    await initDb()
    if (EN_PRUEBAS) {
      if (config.maxMs > 0) await wait(config.minMs + Math.random() * (config.maxMs - config.minMs))
      if (Math.random() < config.failRate) throw new ApiError(503, 'Servicio no disponible. Reintente.')
    } else {
      try {
        await refrescar(VIGENCIA_MS)
      } catch (e) {
        // Sin conexión y con datos ya cargados se sigue trabajando con lo último que se leyó (modo terreno).
        if (!(e?.status === 0 && hayDatos())) throw e
      }
    }
    try {
      const resultado = clone(await handler())
      await confirmar()
      return resultado
    } catch (e) {
      await descartar()
      if (e?.code === 'conflicto_id' && intento < 2) continue
      throw e
    }
  }
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
