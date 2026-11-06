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

/**
 * Horas TRABAJADAS: solo cuentan los tramos cerrados (una entrada seguida de su salida).
 * Una entrada sin salida no suma nada: el reloj necesita la marca de salida para dar por trabajado el tiempo.
 */
export function horasTrabajadas(marcasDia) {
  let min = 0
  let abierta = null
  for (const m of marcasDia) {
    if (m.tipo === TIPOS_MARCA.ENTRADA) abierta = aMinutos(horaDe(m.fecha))
    else if (abierta !== null) { min += aMinutos(horaDe(m.fecha)) - abierta; abierta = null }
  }
  return Math.round((min / 60) * 10) / 10
}

/** Segundos de los tramos cerrados (entrada + salida), con la precisión de las marcas. Para el cronómetro de la jornada. */
export function segundosCerrados(marcasDia) {
  let seg = 0
  let abierta = null
  for (const m of marcasDia) {
    const t = new Date(m.fecha).getTime()
    if (m.tipo === TIPOS_MARCA.ENTRADA) abierta = t
    else if (abierta !== null) { seg += Math.max(0, (t - abierta) / 1000); abierta = null }
  }
  return Math.round(seg)
}

/** Tiempo transcurrido desde una entrada que aún no tiene salida. Es informativo: NO cuenta como trabajado hasta marcar salida. */
export function horasEnCurso(marcasDia, horaActual) {
  const ultima = marcasDia.at(-1)
  if (ultima?.tipo !== TIPOS_MARCA.ENTRADA) return 0
  return Math.round((Math.max(0, aMinutos(horaActual) - aMinutos(horaDe(ultima.fecha))) / 60) * 10) / 10
}

/**
 * Jornada de un día anterior que quedó con entrada y sin salida (la última marca previa a `dia` es una ENTRADA).
 * Esas horas no se cuentan y RRHH debe regularizarlas.
 * @returns {{fecha:string}|null}
 */
export function jornadaSinSalida(marcas, tecnicoId, dia) {
  const previas = marcas.filter((m) => m.tecnico_id === tecnicoId && m.fecha.slice(0, 10) < dia).sort(porFecha)
  const ultima = previas.at(-1)
  return ultima?.tipo === TIPOS_MARCA.ENTRADA ? { fecha: ultima.fecha } : null
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
