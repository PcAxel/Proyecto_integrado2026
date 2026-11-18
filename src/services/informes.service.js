import { descargarArchivo } from './api'

/** Informes que compila el servidor con cifras calculadas en la base de datos. */
export const informesService = {
  /** PowerPoint ejecutivo (portada, resumen, presupuesto vs real y valor de bodega por categoría) del periodo indicado (vacío = todo). */
  descargarEjecutivo: ({ desde = '', hasta = '' } = {}) => descargarArchivo(
    `/erp/informe-ejecutivo/?${new URLSearchParams({ ...(desde && { desde }), ...(hasta && { hasta }) })}`,
    `informe-ejecutivo-fyag${desde || hasta ? `-${desde || 'inicio'}_${hasta || 'hoy'}` : ''}.pptx`),
}
