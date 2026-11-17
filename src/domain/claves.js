/**
 * Contraseñas temporales que entrega TI. El servidor valida las reglas de siempre (mínimo 10 caracteres, no común, no solo números, no parecida al correo);
 * aquí solo se genera una buena y se avisa lo evidente antes de enviar.
 */
const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin letras que se confunden (l, I, O, 0, 1)

/** Una contraseña aleatoria legible de 4 bloques (p. ej. «xk4Tm-9wPqe-Hn7Rz-bCd3F»), con el generador criptográfico del navegador. */
export function generarClave(random = globalThis.crypto) {
  const bytes = random.getRandomValues(new Uint8Array(20))
  const letras = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length])
  return [0, 5, 10, 15].map((i) => letras.slice(i, i + 5).join('')).join('-')
}

/** Aviso inmediato (el servidor decide): null si parece aceptable. @param {string} clave */
export function problemaDeClave(clave) {
  if (!clave) return null
  if (clave.length < 10) return 'Debe tener al menos 10 caracteres.'
  if (/^\d+$/.test(clave)) return 'No puede ser solo números.'
  return null
}
