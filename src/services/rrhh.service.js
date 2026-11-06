import { api, descargarArchivo, bytesProtegidos } from './api'

/**
 * Contratos y finiquitos (Django `rrhh`). Los montos los calcula el servidor; el cliente solo envía la causal y los datos
 * base. Cada endpoint valida el rol: RR. HH. genera, Finanzas solo registra el pago.
 */
export const rrhhService = {
  personal: () => api.get('/rrhh/personal/'),
  contratos: () => api.get('/rrhh/contratos/'),
  crearContrato: (datos) => api.post('/rrhh/contratos/', datos),
  documentos: (empleado) => api.get(`/rrhh/documentos/${empleado ? `?empleado=${empleado}` : ''}`),
  /** @param {{empleado:number, tipo_documento:string, archivo_pdf:File, fecha_emision?:string}} d */
  subirDocumento(d) {
    const f = new FormData()
    Object.entries(d).forEach(([k, v]) => v != null && v !== '' && f.append(k, v))
    return api.postForm('/rrhh/documentos/', f)
  },
  descargarDocumento: (id, nombre = `documento-${id}.pdf`) => descargarArchivo(`/rrhh/documentos/${id}/archivo/`, nombre),

  finiquitos: (estadoPago) => api.get(`/rrhh/finiquitos/${estadoPago ? `?estado_pago=${estadoPago}` : ''}`),
  /** Vista previa de montos: es la misma función del servidor que usa la creación. */
  calcularFiniquito: (datos) => api.post('/rrhh/finiquitos/calcular/', datos),
  crearFiniquito: (datos) => api.post('/rrhh/finiquitos/', datos),
  /** Finanzas: adjunta el comprobante y marca como pagado. @param {number} id @param {File} comprobante */
  pagarFiniquito(id, comprobante) {
    const f = new FormData()
    f.append('estado_pago', 'PAGADO')
    f.append('comprobante_pago', comprobante)
    return api.patchForm(`/rrhh/finiquitos/${id}/`, f)
  },
  descargarComprobante: (id) => descargarArchivo(`/rrhh/finiquitos/${id}/comprobante/`, `comprobante-finiquito-${id}`),

  // ── Firma electrónica (el trabajador firma sus propios documentos) ──
  misDocumentos: (estado) => api.get(`/rrhh/mis-documentos/${estado ? `?estado=${estado}` : ''}`),
  miDocumento: (id) => api.get(`/rrhh/mis-documentos/${id}/`),
  bytesMiDocumento: (id) => bytesProtegidos(`/rrhh/mis-documentos/${id}/archivo/`),
  descargarMiDocumentoFirmado: (id) => descargarArchivo(`/rrhh/mis-documentos/${id}/firmado/`, `documento-firmado-${id}.pdf`),
  /** La IP y la hora las fija el servidor. `firma` es el PNG del trazo (data URL); `codigo2fa` los 6 dígitos de su app de verificación. */
  firmarDocumento: (id, firma, codigo2fa) => api.post(`/rrhh/firmar-documento/${id}/`, { firma, codigo_2fa: codigo2fa }),
}
