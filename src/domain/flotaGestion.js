import { esPatenteValida } from './flota'

/** Reglas de los formularios de gestión de flota. Las valida de nuevo el servidor: esto solo ahorra una ida y vuelta. */
export const TIPOS_DOCUMENTO_VEHICULO = [
  { value: 'REVISION_TECNICA', label: 'Revisión técnica' },
  { value: 'PERMISO_CIRCULACION', label: 'Permiso de circulación' },
  { value: 'SEGURO', label: 'Seguro obligatorio (SOAP)' },
]

/** @returns {Record<string,string>} errores por campo; vacío si está bien */
export function validarVehiculo(f) {
  const e = {}
  if (!esPatenteValida(f.patente)) e.patente = 'La patente no es válida. Ejemplos: ABCD-12 o AB-1234.'
  if (!String(f.marca ?? '').trim()) e.marca = 'Indica la marca.'
  if (!String(f.modelo ?? '').trim()) e.modelo = 'Indica el modelo.'
  const anio = f.anio === '' || f.anio == null ? null : Number(f.anio)
  if (anio !== null && (!Number.isInteger(anio) || anio < 1980 || anio > new Date().getFullYear() + 1)) e.anio = 'El año no es válido.'
  if (f.km_inicial !== undefined && f.km_inicial !== '' && !(Number(f.km_inicial) >= 0)) e.km_inicial = 'El kilometraje no es válido.'
  return e
}

/** Cuerpo para el servidor: números como números y vacíos como null. En la edición no se envía el kilometraje. */
export function cuerpoVehiculo(f, edicion) {
  const cuerpo = {
    patente: f.patente.trim(), marca: f.marca.trim(), modelo: f.modelo.trim(),
    anio: f.anio === '' || f.anio == null ? null : Number(f.anio), tecnico: f.tecnico === '' || f.tecnico == null ? null : Number(f.tecnico),
  }
  if (edicion) return { ...cuerpo, estado: f.estado, activo: f.activo }
  return f.km_inicial !== '' && f.km_inicial != null && Number(f.km_inicial) > 0 ? { ...cuerpo, km_inicial: Math.round(Number(f.km_inicial)) } : cuerpo
}

/** @param {{tipo:string, fecha_realizacion?:string, fecha_vencimiento?:string}} f @param {string} hoy "YYYY-MM-DD" */
export function validarDocumentoVehiculo(f, hoy) {
  const e = {}
  if (!f.fecha_vencimiento) e.fecha_vencimiento = 'Indica cuándo vence.'
  if (f.fecha_realizacion && f.fecha_realizacion > hoy) e.fecha_realizacion = 'No puede ser una fecha futura.'
  if (f.fecha_realizacion && f.fecha_vencimiento && f.fecha_vencimiento < f.fecha_realizacion) e.fecha_vencimiento = 'No puede vencer antes del día en que se hizo.'
  return e
}
