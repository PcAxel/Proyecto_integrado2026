const R_TIERRA_M = 6_371_000
const rad = (g) => (g * Math.PI) / 180

/**
 * Distancia en metros entre dos coordenadas (fórmula de Haversine).
 * @param {{lat:number,lng:number}} a @param {{lat:number,lng:number}} b
 */
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_TIERRA_M * Math.asin(Math.sqrt(h))
}

/**
 * @param {{lat:number,lng:number}} punto
 * @param {{lat:number,lng:number}} centro
 * @param {number} radioM
 * @returns {{dentro:boolean, distanciaM:number}}
 */
export function dentroDeGeocerca(punto, centro, radioM) {
  const distanciaM = Math.round(haversine(punto, centro))
  return { dentro: distanciaM <= radioM, distanciaM }
}

/** Centros aproximados de las comunas de Ñuble para ubicar obras. */
export const COMUNAS_NUBLE = {
  'Chillán': { lat: -36.6066, lng: -72.1034 },
  'Chillán Viejo': { lat: -36.6285, lng: -72.1331 },
  'San Carlos': { lat: -36.4243, lng: -71.9582 },
  'Bulnes': { lat: -36.7425, lng: -72.2994 },
  'Quillón': { lat: -36.7436, lng: -72.465 },
  'Yungay': { lat: -37.1167, lng: -72.0167 },
  'Pinto': { lat: -36.7, lng: -71.9 },
  'Coihueco': { lat: -36.6228, lng: -71.8333 },
  'El Carmen': { lat: -36.8978, lng: -72.0242 },
  'Pemuco': { lat: -37.0,  lng: -72.1 },
}
