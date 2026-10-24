const MAX_DIGITOS = 6

/**
 * Aplica una tecla ('0'-'9', '.', '±') a un número en edición (texto).
 * @param {string} valor @param {string} tecla
 * @returns {string}
 */
export function aplicarTecla(valor, tecla) {
  if (tecla === '±') return valor.startsWith('-') ? valor.slice(1) : `-${valor}`
  if (tecla === '.') {
    if (valor.includes('.')) return valor
    return valor === '' || valor === '-' ? `${valor}0.` : `${valor}.`
  }
  if (valor.replace('-', '').length >= MAX_DIGITOS) return valor
  if (valor === '0') return tecla
  if (valor === '-0') return `-${tecla}`
  return valor + tecla
}

/** Texto en edición → número, o null si aún no es un número completo. @param {string} valor */
export function aNumero(valor) {
  if (valor === '' || valor === '-' || valor.endsWith('.')) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}
