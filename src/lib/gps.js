/**
 * Obtiene la posición del dispositivo. Si no hay GPS (escritorio, permiso denegado, demo),
 * devuelve una posición simulada cerca de la obra o, en modo demo "fuera", ~3 km más allá.
 * @param {{lat:number,lng:number}} obra
 * @param {'REAL'|'DENTRO'|'FUERA'} modo
 * @returns {Promise<{lat:number, lng:number, simulado:boolean}>}
 */
export function obtenerPosicion(obra, modo = 'REAL') {
  const simular = (fuera) => ({
    lat: obra.lat + (fuera ? 0.028 : (Math.random() - 0.5) * 0.0006),
    lng: obra.lng + (fuera ? 0.024 : (Math.random() - 0.5) * 0.0006),
    simulado: true,
  })
  if (modo === 'DENTRO') return Promise.resolve(simular(false))
  if (modo === 'FUERA') return Promise.resolve(simular(true))
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(simular(false))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, simulado: false }),
      () => resolve(simular(false)),
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 30_000 },
    )
  })
}
