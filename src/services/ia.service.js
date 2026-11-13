import { api, descargarArchivo } from './api'

/**
 * Asistente de IA. El servidor decide qué prompt usa según el rol del usuario autenticado y limita el uso por usuario;
 * aquí solo se envían los datos (texto de la factura o notas del trabajo).
 */
export const iaService = {
  /**
   * Conversación con el agente de navegación y búsqueda (solo lectura). `mensajes`: [{role:'user'|'assistant', content}] terminando en un mensaje del usuario;
   * `rutas`: pantallas a las que esta persona puede ir (el servidor descarta cualquier otra). La petición lleva el token de sesión (api.js).
   * `calculo` trae el texto que calculó el servidor (proyección de stock, resumen de compra): se muestra tal cual, sin pasar por el modelo.
   * `archivo` llega solo cuando el agente generó un reporte (Excel, Word o PowerPoint): lo entrega el servidor, nunca el modelo.
   * @returns {Promise<{respuesta:string, respuesta_texto:string, accion:'navegar'|'buscar'|'ninguna', ruta:string|null, termino_busqueda:string|null, archivo?:{nombre:string, formato:'xlsx'|'docx'|'pptx', filas:number, url:string}}>}
   */
  conversar: (mensajes, rutas = []) => api.post('/ai/chat/', { mensajes, rutas }),
  /** Baja el reporte generado por el agente (solo su dueño puede) con la sesión. @param {{url:string, nombre:string}} archivo el `archivo` de la respuesta */
  descargarReporte: (archivo) => descargarArchivo(archivo.url, archivo.nombre),
  /** @param {string} texto texto de la factura (OCR) @returns {Promise<{proveedor, rut_proveedor, numero_factura, fecha, monto_neto, iva, total, advertencias:string[], requiere_revision:boolean}>} */
  extraerFactura: (texto) => api.post('/ai/extract-invoice/', { texto }),
  /** @param {string} notas @returns {Promise<{informe:string, requiere_revision:boolean}>} */
  redactarReporte: (notas) => api.post('/ai/draft-report/', { notas }),
}
