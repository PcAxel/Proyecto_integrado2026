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

/** @param {string} rut */
export function validarRut(rut) {
  const m = /^(\d{1,2}(?:\.?\d{3}){2})-([\dkK])$/.exec(String(rut).trim())
  if (!m) return false
  return digitoVerificador(m[1]) === m[2].toUpperCase()
}
