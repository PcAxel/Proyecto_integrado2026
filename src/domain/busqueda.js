/**
 * Búsqueda global (paleta de comandos). Funciones puras: no conocen React ni la base de datos.
 * @typedef {{id:string, grupo:string, titulo:string, subtitulo?:string, codigo?:string, keywords?:string[], ruta:string, icono?:string}} ItemBusqueda
 */

/** Orden de los grupos cuando no hay una coincidencia que los distinga. */
export const ORDEN_GRUPOS = ['Navegación', 'Acciones', 'Obras', 'Presupuestos', 'Personal', 'Vehículos', 'Artículos', 'Hojas de servicio', 'Clientes', 'Proveedores', 'Usuarios']

/** Sin tildes, en minúsculas y sin espacios sobrantes: "Señor Ñandú" → "senor nandu". @param {unknown} t */
export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const compacto = (t) => t.replace(/[^a-z0-9]/g, '')
const parecesCodigo = (t) => /\d/.test(t) || /[^a-z0-9]/.test(t)

/**
 * Relevancia de un ítem para la consulta (0 = no coincide). Todas las palabras de la consulta deben aparecer.
 * El código exacto pesa más (OB-0005, KLRT-42, un SKU), luego el comienzo del título y por último cualquier parte.
 * Los códigos se comparan sin guiones: «ob0005», «ob 0005» y «OB-0005» encuentran lo mismo.
 * @param {ItemBusqueda} item @param {string} consulta
 */
export function puntuar(item, consulta) {
  const tokens = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (!tokens.length) return 1
  const codigo = normalizar(item.codigo)
  const codigoC = compacto(codigo)
  const titulo = normalizar(item.titulo)
  const todo = `${codigo} ${titulo} ${normalizar([item.subtitulo, ...(item.keywords ?? [])].join(' '))}`
  const todoC = compacto(todo)

  let total = 0
  for (const t of tokens) {
    const tc = compacto(t)
    let s
    if (codigo && (codigo === t || codigoC === tc)) s = 100
    else if (codigoC && tc && codigoC.startsWith(tc)) s = 70
    else if (titulo.startsWith(t)) s = 50
    else if (titulo.split(/[\s·\-–]+/).some((w) => w.startsWith(t))) s = 35
    else if (codigoC && tc && codigoC.includes(tc)) s = 30
    else if (titulo.includes(t)) s = 20
    // Sin guiones ni espacios solo si la consulta parece un código (lleva dígitos o signos): así «ob0005» halla OB-0005
    // pero «obra» no se arma con el final de una palabra y el comienzo de otra («sergi-o bra-vo»).
    else if (todo.includes(t) || (parecesCodigo(t) && tc && todoC.includes(tc))) s = 8
    else return 0
    total += s
  }
  return total
}

/**
 * Filtra y agrupa. Con consulta, los grupos se ordenan por su mejor coincidencia; sin ella, por ORDEN_GRUPOS
 * y se muestran todas las rutas y acciones.
 * @param {ItemBusqueda[]} items @param {string} consulta
 * @param {{limitePorGrupo?: number, orden?: string[]}} [opciones]
 * @returns {Array<{grupo:string, items:ItemBusqueda[]}>}
 */
export function buscar(items, consulta, { limitePorGrupo = 6, orden = ORDEN_GRUPOS } = {}) {
  const sinConsulta = !normalizar(consulta)
  const rank = (g) => (orden.includes(g) ? orden.indexOf(g) : orden.length)
  const grupos = new Map()
  for (const it of items) {
    const s = puntuar(it, consulta)
    if (s > 0) grupos.set(it.grupo, [...(grupos.get(it.grupo) ?? []), { it, s }])
  }
  return [...grupos]
    .map(([grupo, lista]) => {
      const ordenada = lista.sort((a, b) => b.s - a.s || a.it.titulo.localeCompare(b.it.titulo, 'es'))
      const libre = sinConsulta && (grupo === 'Navegación' || grupo === 'Acciones')
      return { grupo, mejor: ordenada[0].s, items: (libre ? ordenada : ordenada.slice(0, limitePorGrupo)).map((x) => x.it) }
    })
    .sort((a, b) => (sinConsulta ? 0 : b.mejor - a.mejor) || rank(a.grupo) - rank(b.grupo))
    .map(({ grupo, items: lista }) => ({ grupo, items: lista }))
}

/** Ítems en el orden en que se recorren con el teclado. */
export const aplanar = (grupos) => grupos.flatMap((g) => g.items)

/** Mueve la selección con las flechas, dando la vuelta en los extremos. */
export const moverSeleccion = (actual, delta, total) => (total === 0 ? 0 : (actual + delta + total) % total)
