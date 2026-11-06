/** Precisión (metros) hasta la cual la ubicación se considera confiable. Más allá se registra igual, pero queda marcada como imprecisa. */
export const PRECISION_CONFIABLE_M = 150

const MENSAJES = {
  1: 'Activa el permiso de ubicación (GPS) para continuar.',
  2: 'No se pudo determinar tu ubicación. Revisa que el GPS esté encendido.',
  3: 'El GPS tardó demasiado en responder. Sal a un lugar abierto e inténtalo de nuevo.',
}

/**
 * Posición REAL del dispositivo. No existe ubicación de respaldo ni simulada: sin GPS o sin permiso no se puede registrar
 * la acción. La precisión se guarda junto a la ubicación (una marca imprecisa no se bloquea, pero RRHH la ve señalada).
 * @returns {Promise<{lat:number, lng:number, precision_m:number, simulado:false}>}
 */
export function obtenerPosicion() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Este dispositivo no tiene GPS: no se puede registrar la ubicación.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const precision_m = Math.round(p.coords.accuracy)
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision_m, simulado: false })
      },
      (e) => reject(new Error(MENSAJES[e.code] ?? MENSAJES[2])),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    )
  })
}
