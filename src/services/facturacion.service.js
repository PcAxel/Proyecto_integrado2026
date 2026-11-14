import { api, descargarArchivo } from './api'

/**
 * Facturación electrónica (DTE / SII). Solo Administrador y Finanzas: el servidor lo exige con el JWT (403 para cualquier otro rol).
 * Los montos y el cliente salen del presupuesto aprobado en el servidor; aquí solo se indica QUÉ orden (obra) se factura.
 */
const orden = (id) => encodeURIComponent(id)

export const facturacionService = {
  /** Estado de la factura de una orden y si se puede emitir. @returns {Promise<DTE>} */
  estado: (obraId) => api.get(`/facturacion/${orden(obraId)}/`),
  /** Emite la factura (el simulador tarda ~2 s). 200 = aceptada; 409 = ya emitida o en proceso; 422 = la orden no es facturable; 502 = rechazada. @returns {Promise<DTE>} */
  emitir: (obraId) => api.post(`/facturacion/emitir/${orden(obraId)}/`, {}),
  /** Baja el PDF con la sesión (el archivo es privado). */
  descargarPdf: (obraId, folio) => descargarArchivo(`/facturacion/${orden(obraId)}/pdf/`, `factura-${folio}.pdf`),
}

/**
 * @typedef {{orden_id:string, estado_sii:'NO_EMITIDO'|'PROCESANDO'|'ACEPTADO'|'RECHAZADO', estado_label:string, folio_sii:number|null, pdf_url:string|null,
 *   error:string, emitido_en:string|null, receptor_rut:string, receptor_razon_social:string, glosa:string, neto:number, iva:number, total:number,
 *   emitible:boolean, motivo:string|null}} DTE
 */
