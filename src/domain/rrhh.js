/** Textos y reglas de presentación de contratos y finiquitos. Los montos NO se calculan aquí: los calcula el servidor. */

import { validarRut, normalizarRut } from './rut'

export const TIPOS_CONTRATO = [{ value: 'INDEFINIDO', label: 'Indefinido' }, { value: 'PLAZO_FIJO', label: 'Plazo fijo' }, { value: 'OBRA_FAENA', label: 'Obra o faena' }]

export const TIPOS_DOCUMENTO = [
  { value: 'AMONESTACION', label: 'Amonestación' }, { value: 'ANEXO', label: 'Anexo de contrato' },
  { value: 'CARTA_DESPIDO', label: 'Carta de despido' }, { value: 'OTRO', label: 'Otro' },
]

export const CAUSALES = [
  { value: 'MUTUO_ACUERDO', label: 'Art. 159 N°1 · Mutuo acuerdo' },
  { value: 'RENUNCIA', label: 'Art. 159 N°2 · Renuncia del trabajador' },
  { value: 'VENCIMIENTO_PLAZO', label: 'Art. 159 N°4 · Vencimiento del plazo' },
  { value: 'CONCLUSION_TRABAJO', label: 'Art. 159 N°5 · Conclusión del trabajo o servicio' },
  { value: 'CONDUCTA_INDEBIDA', label: 'Art. 160 · Conducta indebida o incumplimiento grave' },
  { value: 'NECESIDADES_EMPRESA', label: 'Art. 161 · Necesidades de la empresa' },
]

/** Solo esta causal paga indemnización por años de servicio y exige avisar con 30 días. */
export const causalIndemniza = (causal) => causal === 'NECESIDADES_EMPRESA'

export const ESTADO_CONTRATO = { ACTIVO: { tone: 'ok', label: 'Activo' }, FINIQUITADO: { tone: 'neutral', label: 'Finiquitado' } }
export const ESTADO_PAGO = { PENDIENTE: { tone: 'warn', label: 'Pendiente de pago' }, PAGADO: { tone: 'ok', label: 'Pagado' } }

export const pesos = (n) => `$${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

/** Estado contractual que ve RR. HH. en la tabla de personal. */
export function estadoContractual(contrato) {
  if (!contrato) return { tone: 'neutral', label: 'Sin contrato' }
  if (contrato.estado === 'FINIQUITADO') return ESTADO_CONTRATO.FINIQUITADO
  if (contrato.finiquito_id) return { tone: 'warn', label: 'Finiquito en curso' }
  return ESTADO_CONTRATO.ACTIVO
}

export const COMPROBANTES_ACEPTADOS = '.pdf,.png,.jpg,.jpeg'
export const MAX_MB = 10

/** Validación previa en el navegador (el servidor valida de nuevo el contenido real del archivo). */
export function validarArchivo(archivo, extensiones) {
  if (!archivo) return 'Selecciona un archivo.'
  const ext = archivo.name.split('.').pop().toLowerCase()
  if (!extensiones.includes(ext)) return `Formato no permitido. Usa: ${extensiones.join(', ').toUpperCase()}.`
  if (archivo.size > MAX_MB * 1024 * 1024) return `El archivo supera ${MAX_MB} MB.`
  return null
}


/**
 * Validación de la ficha del trabajador antes de enviarla (el servidor vuelve a validar todo: esto solo ahorra una ida y vuelta).
 * @param {{rut?:string, afp?:string, sistema_salud?:string, isapre?:string, tipo_contrato?:string, fecha_ingreso?:string}} f
 * @returns {Record<string,string>} errores por campo; vacío si todo está bien
 */
export function validarFicha(f) {
  const e = {}
  const rut = normalizarRut(f.rut ?? '')
  if (!f.rut?.trim()) e.rut = 'Ingresa el RUT.'
  else if (!validarRut(rut)) e.rut = 'El RUT no es válido: revisa el dígito verificador.'
  if (!f.afp) e.afp = 'Elige la AFP.'
  if (!f.sistema_salud) e.sistema_salud = 'Elige el sistema de salud.'
  if (f.sistema_salud === 'ISAPRE' && !f.isapre) e.isapre = 'Elige la isapre.'
  if (!f.tipo_contrato) e.tipo_contrato = 'Elige el tipo de contrato.'
  if (!f.fecha_ingreso) e.fecha_ingreso = 'Ingresa la fecha de ingreso.'
  return e
}

/** Cuerpo que se envía al servidor: el RUT va normalizado y la isapre solo existe si el sistema de salud es Isapre. */
export const cuerpoFicha = (f) => ({
  rut: normalizarRut(f.rut), afp: f.afp, sistema_salud: f.sistema_salud, isapre: f.sistema_salud === 'ISAPRE' ? f.isapre : '',
  tipo_contrato: f.tipo_contrato, fecha_ingreso: f.fecha_ingreso,
})
