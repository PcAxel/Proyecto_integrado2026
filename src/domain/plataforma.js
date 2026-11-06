/**
 * Detección de plataforma para decidir cómo se instala la PWA. Pura: recibe los datos del
 * navegador como parámetros para poder probarse sin DOM.
 *
 * @param {{userAgent?: string, platform?: string, maxTouchPoints?: number, standalone?: boolean}} nav
 * @returns {{os: 'ios'|'android'|'otro', safari: boolean, ipad: boolean}}
 */
export function detectarPlataforma({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ua = userAgent.toLowerCase()
  // iPadOS 13+ se presenta como un Mac: se distingue por la pantalla táctil.
  const ipad = /ipad/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)
  const ios = /iphone|ipod/.test(ua) || ipad
  if (ios) {
    // Chrome, Firefox, Edge, Opera y la app de Google en iOS traen su propia marca en el UA.
    const safari = /safari/.test(ua) && !/crios|fxios|edgios|opios|gsa\//.test(ua)
    return { os: 'ios', safari, ipad }
  }
  if (/android/.test(ua)) return { os: 'android', safari: false, ipad: false }
  return { os: 'otro', safari: false, ipad: false }
}

/** ¿La app ya corre instalada (ventana standalone)? */
export function estaInstalada({ displayStandalone = false, navigatorStandalone = false } = {}) {
  return Boolean(displayStandalone || navigatorStandalone)
}

/**
 * Qué experiencia de instalación corresponde.
 * - `instalada`: nada que instalar.
 * - `prompt`: hay prompt nativo (Android/Chrome, escritorio) → un solo toque.
 * - `guia-ios`: Safari en iPhone/iPad → modal paso a paso.
 * - `abrir-en-safari`: otro navegador en iOS → hay que abrir el link en Safari.
 * - `manual`: sin prompt disponible → instrucciones del menú del navegador.
 */
export function modoInstalacion({ plataforma, instalada, promptDisponible }) {
  if (instalada) return 'instalada'
  if (plataforma.os === 'ios') return plataforma.safari ? 'guia-ios' : 'abrir-en-safari'
  return promptDisponible ? 'prompt' : 'manual'
}
