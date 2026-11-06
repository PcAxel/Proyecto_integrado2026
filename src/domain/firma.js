/** Presentación de documentos laborales por firmar. El estado y la validez de la firma los decide el servidor. */

export const TIPO_DOCUMENTO_LABORAL = { CONTRATO: 'Contrato', ANEXO: 'Anexo' }

export const tituloDocumento = (d) => `${TIPO_DOCUMENTO_LABORAL[d.tipo_documento] ?? 'Documento'}${d.titulo ? ` · ${d.titulo}` : ''}`

export const hayPendientes = (docs) => (docs ?? []).some((d) => d.estado === 'PENDIENTE')

/** Texto del aviso en el inicio del técnico. */
export const textoAvisoPendientes = () => 'Tienes documentos laborales pendientes por firmar'
