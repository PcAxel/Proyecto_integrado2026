import { toast } from 'sonner'

/**
 * Ejecuta una mutación de servicio mostrando toast de éxito o error.
 * @template T
 * @param {Promise<T>} promesa
 * @param {string} mensajeOk
 * @returns {Promise<T|null>} null si falló
 */
export async function runAction(promesa, mensajeOk) {
  try {
    const r = await promesa
    toast.success(mensajeOk)
    return r
  } catch (e) {
    toast.error(e.message || 'No se pudo completar la acción.')
    return null
  }
}
