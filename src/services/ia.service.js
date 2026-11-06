import { api } from './api'

/**
 * Asistente de IA. El servidor decide qué prompt usa según el rol del usuario autenticado y limita el uso por usuario;
 * aquí solo se envían los datos (texto de la factura o notas del trabajo).
 */
export const iaService = {
  /** Conversación abierta. `mensajes`: [{role:'user'|'assistant', content}] terminando en un mensaje del usuario. @returns {Promise<{respuesta:string}>} */
  conversar: (mensajes) => api.post('/ai/chat/', { mensajes }),
  /** @param {string} texto texto de la factura (OCR) @returns {Promise<{proveedor, rut_proveedor, numero_factura, fecha, monto_neto, iva, total, advertencias:string[], requiere_revision:boolean}>} */
  extraerFactura: (texto) => api.post('/ai/extract-invoice/', { texto }),
  /** @param {string} notas @returns {Promise<{informe:string, requiere_revision:boolean}>} */
  redactarReporte: (notas) => api.post('/ai/draft-report/', { notas }),
}
