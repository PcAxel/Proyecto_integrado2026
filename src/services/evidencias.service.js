import { api, request } from './api'

/** Evidencia fotográfica de terreno: la foto y sus metadatos viven en MongoDB; MySQL guarda solo la referencia. */
export const evidenciasService = {
  reportes: () => api.get('/reportes/'),
  /** @param {FormData} form foto + obra + GPS + metadatos del equipo */
  subir: (form) => api.postForm('/evidencias/', form),
  detalle: (id) => request(`/evidencias/${id}/`),
}
