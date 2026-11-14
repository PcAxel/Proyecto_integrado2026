/**
 * Traducción al inglés SOLO si el navegador la trae integrada (API `Translator` de Chrome de escritorio reciente): el texto se traduce en el propio
 * dispositivo, sin enviarlo a ningún servidor. En cualquier otro navegador esta función avisa que no está disponible y el resto de la app sigue igual.
 */
const PAR = { sourceLanguage: 'es', targetLanguage: 'en' }

export const traduccionSoportada = () => typeof globalThis !== 'undefined' && typeof globalThis.Translator?.create === 'function'

/** @returns {Promise<'no-soportado'|'unavailable'|'downloadable'|'downloading'|'available'>} */
export async function disponibilidadTraduccion() {
  if (!traduccionSoportada()) return 'no-soportado'
  try { return await globalThis.Translator.availability(PAR) } catch { return 'unavailable' }
}

/** Crea el traductor es→en. Debe llamarse desde un clic: si el modelo de idioma hay que descargarlo, el navegador lo exige. */
export async function crearTraductor(onProgreso) {
  return globalThis.Translator.create({
    ...PAR,
    monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgreso?.(Math.round((e.loaded ?? 0) * 100))),
  })
}
