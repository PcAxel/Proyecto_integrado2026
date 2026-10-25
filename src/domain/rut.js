/** Dígito verificador de un RUT chileno (módulo 11). @param {number|string} cuerpo */
export function digitoVerificador(cuerpo) {
  let suma = 0
  let mult = 2
  for (const d of String(cuerpo).replace(/\D/g, '').split('').reverse()) {
    suma += Number(d) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const dv = 11 - (suma % 11)
  return dv === 11 ? '0' : dv === 10 ? 'K' : String(dv)
}

/** Formatea con puntos y guion: 12345678 → "12.345.678-5". @param {number|string} cuerpo */
export function formatRut(cuerpo) {
  const limpio = String(cuerpo).replace(/\D/g, '')
  return `${limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${digitoVerificador(limpio)}`
}

/**
 * Normaliza lo que escribe el usuario ("12345678-5", "123456785", "12.345.678-5") al formato oficial.
 * Si no hay al menos 7 dígitos más el verificador, devuelve el texto tal cual para que validarRut lo rechace.
 * @param {string} texto
 */
export function normalizarRut(texto) {
  const limpio = String(texto).replace(/[^0-9kK]/g, '').toUpperCase()
  if (limpio.length < 8) return String(texto).trim()
  const cuerpo = limpio.slice(0, -1)
  if (!/^\d+$/.test(cuerpo)) return String(texto).trim()
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${limpio.slice(-1)}`
}

/** @param {string} rut */
export function validarRut(rut) {
  const m = /^(\d{1,2}(?:\.?\d{3}){2})-([\dkK])$/.exec(String(rut).trim())
  if (!m) return false
  return digitoVerificador(m[1]) === m[2].toUpperCase()
}
