/**
 * Permiso de ubicación del técnico. La app lo necesita para marcar asistencia y enviar hojas de servicio.
 * Un navegador solo permite pedirlo como respuesta a un toque del usuario (no al instalar ni al abrir): por eso la app muestra una tarjeta
 * grande con un botón, y si el permiso fue rechazado explica cómo reactivarlo en su teléfono. Funciones puras: se prueban sin navegador.
 */

/** @param {string|undefined|null} estadoPermisos valor de `navigator.permissions.query(...).state` @returns {'concedido'|'denegado'|'pendiente'} */
export const estadoUbicacion = (estadoPermisos) => (estadoPermisos === 'granted' ? 'concedido' : estadoPermisos === 'denied' ? 'denegado' : 'pendiente')

/** Pasos para reactivar la ubicación cuando se rechazó (el navegador no vuelve a preguntar). @param {'ios'|'android'|'otro'} os */
export function pasosParaReactivar(os, instalada = false) {
  if (os === 'ios') {
    return [
      'Abre la app «Ajustes» del iPhone.',
      'Entra a «Privacidad y seguridad» y luego a «Localización».',
      instalada ? 'Busca «FYAG» (o «Safari») y elige «Al usar la app».' : 'Busca «Safari» y elige «Al usar la app».',
      'Vuelve a FYAG y toca «Revisar de nuevo».',
    ]
  }
  if (os === 'android') {
    return [
      'Mantén apretado el ícono de FYAG y entra a «Información de la aplicación» (o a «Configuración del sitio» en Chrome).',
      'Entra a «Permisos» y luego a «Ubicación».',
      'Elige «Permitir solo mientras se usa la app».',
      'Vuelve a FYAG y toca «Revisar de nuevo».',
    ]
  }
  return ['Abre la configuración del sitio en tu navegador.', 'Permite la ubicación para este sitio.', 'Vuelve a FYAG y toca «Revisar de nuevo».']
}
