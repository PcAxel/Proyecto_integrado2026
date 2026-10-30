/**
 * Reloj control: reglas de asistencia diaria. Puro y sin dependencias (P3).
 * Cada marca es inmutable (P1): una jornada se reconstruye leyendo las marcas del día en orden.
 */

export const TIPOS_MARCA = { ENTRADA: 'ENTRADA', SALIDA: 'SALIDA' }

/** Estados de un técnico en el día. */
export const ESTADOS_ASISTENCIA = {
  EN_JORNADA: 'EN_JORNADA',
  FINALIZADA: 'FINALIZADA',
  PENDIENTE: 'PENDIENTE',
  AUSENTE: 'AUSENTE',
}

export const ESTADO_ASISTENCIA_LABEL = {
  EN_JORNADA: 'En jornada',
  FINALIZADA: 'Jornada finalizada',
  PENDIENTE: 'Pendiente',
  AUSENTE: 'Ausente',
}

/** Hora de inicio de la jornada y minutos de tolerancia antes de contar un atraso. */
export const INICIO_JORNADA = '08:00'
export const TOLERANCIA_MIN = 15
/** Pasada esta hora sin entrada, el técnico se considera ausente (antes, solo pendiente). */
export const HORA_LIMITE_AUSENTE = '10:00'

/** "HH:MM" de una fecha ISO local. @param {string} iso */
export const horaDe = (iso) => iso.slice(11, 16)

const aMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

const porFecha = (a, b) => a.fecha.localeCompare(b.fecha)

/** Marcas de un técnico en un día, en orden cronológico. */
export function marcasDelDia(marcas, tecnicoId, dia) {
  return marcas.filter((m) => m.tecnico_id === tecnicoId && m.fecha.startsWith(dia)).sort(porFecha)
}

/** Qué marca corresponde ahora: la entrada abre la jornada, la salida la cierra, y así alternadamente. */
export function siguienteMarca(marcasDia) {
  const ultima = marcasDia.at(-1)
  return ultima?.tipo === TIPOS_MARCA.ENTRADA ? TIPOS_MARCA.SALIDA : TIPOS_MARCA.ENTRADA
}

/**
 * Valida una marca contra las anteriores del día.
 * @param {'ENTRADA'|'SALIDA'} tipo
 * @param {Array<{tipo:string, fecha:string}>} marcasDia
 * @returns {{ok:true}|{ok:false, error:string}}
 */
export function validarMarca(tipo, marcasDia) {
  if (!Object.values(TIPOS_MARCA).includes(tipo)) return { ok: false, error: 'Tipo de marca inválido.' }
  const ultima = marcasDia.at(-1)
  if (tipo === TIPOS_MARCA.ENTRADA && ultima?.tipo === TIPOS_MARCA.ENTRADA) {
    return { ok: false, error: 'Acción inválida: Ya registraste tu entrada. Debes marcar salida.' }
  }
  if (tipo === TIPOS_MARCA.SALIDA && !ultima) {
    return { ok: false, error: 'Acción inválida: Aún no registras tu entrada. Debes marcar entrada.' }
  }
  if (tipo === TIPOS_MARCA.SALIDA && ultima?.tipo === TIPOS_MARCA.SALIDA) {
    return { ok: false, error: 'Acción inválida: Ya registraste tu salida. Debes marcar entrada.' }
  }
  return { ok: true }
}

/** ¿La primera entrada llegó pasada la tolerancia? @param {string} horaEntrada "HH:MM" */
export const llegoTarde = (horaEntrada) => aMinutos(horaEntrada) > aMinutos(INICIO_JORNADA) + TOLERANCIA_MIN

/**
 * Estado del técnico según sus marcas y la hora actual.
 * @param {Array<{tipo:string, fecha:string}>} marcasDia
 * @param {string} horaActual "HH:MM"
 */
export function estadoDelDia(marcasDia, horaActual) {
  const ultima = marcasDia.at(-1)
  if (ultima) return ultima.tipo === TIPOS_MARCA.ENTRADA ? ESTADOS_ASISTENCIA.EN_JORNADA : ESTADOS_ASISTENCIA.FINALIZADA
  return aMinutos(horaActual) >= aMinutos(HORA_LIMITE_AUSENTE) ? ESTADOS_ASISTENCIA.AUSENTE : ESTADOS_ASISTENCIA.PENDIENTE
}

/** Horas trabajadas en el día: suma de cada par entrada→salida (una jornada abierta cuenta hasta `horaActual`). */
export function horasTrabajadas(marcasDia, horaActual) {
  let min = 0
  let abierta = null
  for (const m of marcasDia) {
    if (m.tipo === TIPOS_MARCA.ENTRADA) abierta = aMinutos(horaDe(m.fecha))
    else if (abierta !== null) { min += aMinutos(horaDe(m.fecha)) - abierta; abierta = null }
  }
  if (abierta !== null) min += Math.max(0, aMinutos(horaActual) - abierta)
  return Math.round((min / 60) * 10) / 10
}

/** Conteo por estado para la franja del ERP. @param {Array<{estado:string}>} filas */
export function resumenAsistencia(filas) {
  const cuenta = (e) => filas.filter((f) => f.estado === e).length
  return {
    total: filas.length,
    enJornada: cuenta(ESTADOS_ASISTENCIA.EN_JORNADA),
    finalizadas: cuenta(ESTADOS_ASISTENCIA.FINALIZADA),
    pendientes: cuenta(ESTADOS_ASISTENCIA.PENDIENTE),
    ausentes: cuenta(ESTADOS_ASISTENCIA.AUSENTE),
    presentes: cuenta(ESTADOS_ASISTENCIA.EN_JORNADA) + cuenta(ESTADOS_ASISTENCIA.FINALIZADA),
    atrasados: filas.filter((f) => f.atrasado).length,
    fueraGeocerca: filas.filter((f) => f.fuera_geocerca).length,
  }
}
