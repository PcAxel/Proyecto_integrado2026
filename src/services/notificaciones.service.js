import { api } from './api'

/**
 * Campanita de avisos. Cada persona solo recibe y marca los suyos (el servidor lo impone con el JWT).
 * @typedef {{id:number, mensaje:string, tipo:string, leida:boolean, fecha_creacion:string}} Aviso
 */
export const notificacionesService = {
  /** Últimos avisos (no leídos primero) y cuántos no se han leído. @returns {Promise<{no_leidas:number, resultados:Aviso[]}>} */
  listar: () => api.get('/notificaciones/'),
  /** Marca como leídos los `ids` indicados o, sin ids, todos los propios. @returns {Promise<{marcadas:number, no_leidas:number}>} */
  marcarLeidas: (ids) => api.post('/notificaciones/marcar-leidas/', ids ? { ids } : {}),
}
