import { api, descargarArchivo, bytesProtegidos } from './api'

/**
 * Contratos y finiquitos (Django `rrhh`). Los montos los calcula el servidor; el cliente solo envía la causal y los datos
 * base. Cada endpoint valida el rol: RR. HH. genera, Finanzas solo registra el pago.
 */
export const rrhhService = {
  personal: () => api.get('/rrhh/personal/'),
  // ── Ficha del trabajador (RUT, AFP, salud, tipo de contrato, ingreso): solo RR. HH. y Administrador ──
  fichas: () => api.get('/rrhh/fichas/'),
  /** Listas cerradas del servidor para los selectores: { afp, sistema_salud, isapre, tipo_contrato } (cada una [{value,label}]). */
  opcionesFicha: () => api.get('/rrhh/fichas/opciones/'),
  crearFicha: (datos) => api.post('/rrhh/fichas/', datos),
  actualizarFicha: (id, datos) => api.patch(`/rrhh/fichas/${id}/`, datos),
  contratos: () => api.get('/rrhh/contratos/'),
  /** Un plazo fijo que deja a la persona en riesgo de contrato indefinido responde 409 (`riesgo_indefinido`) con la evaluación;
   *  para insistir se reenvía con `confirmar_riesgo_legal: true`. */
  crearContrato: (datos) => api.post('/rrhh/contratos/', datos),
  /** Renueva un plazo fijo. La 2ª renovación responde 409 (`segunda_renovacion`) y solo procede con `aceptar_indefinido: true`. */
  renovarContrato: (id, datos) => api.post(`/rrhh/contratos/${id}/renovar/`, datos),

  // ── Cumplimiento laboral (art. 159 N°4) y rotación: lectura para RR. HH., Gerencia General y Auditor Externo ──
  /** KPIs de rotación, semáforo de plazo fijo, alertas y personas. */
  cumplimiento: () => api.get('/rrhh/cumplimiento/'),
  /** Línea de tiempo de una persona: contratos, días trabajados, lagunas y ventana segura de recontratación. */
  historialContrataciones: (id) => api.get(`/rrhh/cumplimiento/historial/${id}/`),
  /** Informe Ejecutivo de Rotación y Riesgo Laboral (Markdown). Con IA si el servidor la tiene; si no, con su motor analítico. */
  reporteRotacion: () => api.get('/rrhh/ia-reporte-rotacion/'),
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
