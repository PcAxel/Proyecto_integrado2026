/**
 * Hash de contraseñas para el prototipo: SHA-256 con sal aleatoria por usuario (WebCrypto).
 * Evita guardar la clave en texto plano en la base simulada. En producción esto lo hace el backend
 * (Django: PBKDF2 o Argon2) y el frontend nunca recibe ni almacena el hash.
 */
const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export function nuevaSal() {
  return aHex(crypto.getRandomValues(new Uint8Array(16)))
}

/** @param {string} password @param {string} sal */
export async function hashPassword(password, sal) {
  const datos = new TextEncoder().encode(`${sal}:${password}`)
  return aHex(await crypto.subtle.digest('SHA-256', datos))
}
