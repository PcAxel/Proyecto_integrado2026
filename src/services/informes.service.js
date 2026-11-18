import { descargarArchivo } from './api'

/** Informes que compila el servidor con cifras calculadas en la base de datos. */
export const informesService = {
  /** PowerPoint ejecutivo (portada, resumen, presupuesto vs real y valor de bodega por categoría). */
  descargarEjecutivo: () => descargarArchivo('/erp/informe-ejecutivo/', 'informe-ejecutivo-fyag.pptx'),
}
