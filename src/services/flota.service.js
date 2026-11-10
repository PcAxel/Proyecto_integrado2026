import { api } from './api'
import { refrescar } from '@/mocks/db'

/**
 * Flota (Django `flota`, tablas relacionales). Fuente de verdad de los vehículos, de sus revisiones y vencimientos y del kilometraje.
 * Leen Finanzas, RR. HH. y Administrador; crean y editan RR. HH. y Administrador. Cada cambio vuelve a leer la instantánea del ERP para que
 * las alertas, el panel y la app de terreno vean lo nuevo. Los vehículos no se eliminan: se mandan a taller o se desactivan.
 */
const conRefresco = async (promesa) => {
  const r = await promesa
  await refrescar(0)
  return r
}

export const flotaService = {
  listar: () => api.get('/vehiculos/'),
  /** @param {{patente:string, marca:string, modelo:string, anio?:number|null, tecnico?:number|null, km_inicial?:number}} datos */
  crear: (datos) => conRefresco(api.post('/vehiculos/', datos)),
  /** @param {number} id @param {{patente?:string, marca?:string, modelo?:string, anio?:number|null, tecnico?:number|null, estado?:string, activo?:boolean}} datos */
  actualizar: (id, datos) => conRefresco(api.patch(`/vehiculos/${id}/`, datos)),
  documentos: (id) => api.get(`/vehiculos/${id}/documentos/`),
  /** Cada renovación es un registro nuevo (el historial no se edita). @param {{tipo:string, fecha_realizacion?:string|null, fecha_vencimiento:string, referencia?:string, observacion?:string}} datos */
  registrarDocumento: (id, datos) => conRefresco(api.post(`/vehiculos/${id}/documentos/`, datos)),
  lecturas: (id) => api.get(`/vehiculos/${id}/lecturas/`),
  /** El odómetro solo avanza. */
  registrarLectura: (id, km) => conRefresco(api.post(`/vehiculos/${id}/lecturas/`, { km })),
}
