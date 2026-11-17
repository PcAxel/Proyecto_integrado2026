/**
 * Búsqueda para el selector con escritura (Combobox): normaliza sin tildes ni mayúsculas y exige que TODAS las palabras escritas aparezcan
 * en el texto de la opción (SKU, nombre o detalle). Pensado para catálogos de miles de artículos: una pasada por la lista, sin dependencias.
 */
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * @template {{value:string, label:string, detail?:string}} O
 * @param {Array<O & {_texto?: string}>} opciones
 * @param {string} consulta
 * @param {number} [max] cuántos resultados se devuelven como máximo
 * @returns {{items: O[], total: number}} `total` = coincidencias reales (puede ser mayor que `items.length`)
 */
export function filtrarOpciones(opciones, consulta, max = 50) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (!palabras.length) return { items: opciones.slice(0, max), total: opciones.length }
  const q = normalizar(consulta)
  const coinciden = []
  for (const o of opciones) {
    const texto = o._texto ?? normalizar(`${o.label} ${o.detail ?? ''}`)
    if (palabras.every((p) => texto.includes(p))) coinciden.push(o)
  }
  // Primero lo que EMPIEZA con lo escrito (un SKU exacto gana a un nombre que lo menciona), conservando el orden original dentro de cada grupo.
  const empieza = (o) => (o._texto ?? normalizar(o.label)).startsWith(q)
  const ordenados = [...coinciden.filter(empieza), ...coinciden.filter((o) => !empieza(o))]
  return { items: ordenados.slice(0, max), total: ordenados.length }
}

/** Precalcula el texto normalizado de cada opción para no repetirlo en cada tecla. */
export const prepararOpciones = (opciones) => opciones.map((o) => ({ ...o, _texto: normalizar(`${o.label} ${o.detail ?? ''}`) }))
