/**
 * Etiquetas QR de bodega. Puro (P3): sin DOM ni librerías de dibujo.
 *
 * El QR contiene SOLO el SKU del artículo, nunca precio ni stock: el stock sale siempre de la base de datos, así que la
 * etiqueta no se puede falsificar ni queda desactualizada. Al ser el SKU en texto plano, un lector USB tipo teclado también
 * lo entiende (escribe el SKU + Enter).
 */

/** Texto que se codifica en el QR: el SKU del artículo o el código del lote/cilindro. @param {{sku?:string, codigo?:string}} x */
export const contenidoQr = (x) => (x.codigo ?? x.sku).trim()

/** Código legible y único de un lote o cilindro: el SKU más el correlativo del lote (LOT-0007 → REF-404A-L0007). */
export const codigoDeLote = (articulo, loteId) => `${articulo.sku}-L${loteId.slice(4)}`

/** Unidades de una entrada de compra que todavía no tienen lote/serie asignado. */
export const unidadesSinEtiquetar = (entrada, lotes) => entrada.cantidad - lotes.filter((l) => l.movimiento_id === entrada.id).reduce((a, l) => a + l.cantidad, 0)

/** Datos de una etiqueta de producto. */
export const datosEtiquetaArticulo = (a) => ({ codigo: a.sku, nombre: a.nombre, detalle: a.unidad ? `Unidad: ${a.unidad}` : '' })

/** Datos de una etiqueta de lote o cilindro. */
export function datosEtiquetaLote(l, a) {
  const que = l.tipo === 'SERIE' ? 'Serie · 1 unidad' : `Lote · ${l.cantidad} ${a?.unidad ?? ''}`.trim()
  return { codigo: l.codigo, nombre: a?.nombre ?? l.articulo_id, detalle: `${que}${l.vencimiento ? ` · vence ${l.vencimiento}` : ''}` }
}

/**
 * Busca qué se escaneó: un lote/cilindro (código `SKU-L0007`) o un artículo (su SKU). Acepta el prefijo `FYAG:` y no
 * distingue mayúsculas. Solo artículos activos: uno desactivado no puede moverse.
 * @param {string} texto @param {Array<{id:string, sku:string, activo?:boolean}>} articulos @param {Array<{id:string, codigo:string, articulo_id:string}>} [lotes]
 * @returns {{ok:true, articulo:object, lote?:object} | {ok:false, error:string}}
 */
export function resolverCodigo(texto, articulos, lotes = []) {
  const codigo = String(texto ?? '').trim().replace(/^fyag:/i, '').trim().toLowerCase()
  if (!codigo) return { ok: false, error: 'El código está vacío.' }
  const lote = lotes.find((l) => l.codigo.toLowerCase() === codigo)
  const a = lote ? articulos.find((x) => x.id === lote.articulo_id) : articulos.find((x) => x.sku.toLowerCase() === codigo)
  if (!a) return { ok: false, error: `El código «${String(texto).trim().slice(0, 40)}» no corresponde a ningún artículo ni lote.` }
  if (a.activo === false) return { ok: false, error: `${a.sku} está desactivado y no admite movimientos.` }
  return lote ? { ok: true, articulo: a, lote } : { ok: true, articulo: a }
}

/**
 * Formatos de impresión. Medidas en mm.
 * - HOJA: hoja A4 con etiquetas en grilla (se corta o ya viene troquelada).
 * - ROLLO: una etiqueta por página, para impresoras térmicas de etiquetas.
 * @type {Record<string, {id:string, nombre:string, tipo:'HOJA'|'ROLLO', pagina:[number,number], etiqueta:[number,number], columnas:number, filas:number, margen:[number,number], qr:number}>}
 */
export const FORMATOS_ETIQUETA = {
  A4_24: { id: 'A4_24', nombre: 'Hoja A4 · 24 etiquetas (70 × 37 mm)', tipo: 'HOJA', pagina: [210, 297], etiqueta: [70, 37], columnas: 3, filas: 8, margen: [0, 0.5], qr: 29 },
  A4_12: { id: 'A4_12', nombre: 'Hoja A4 · 12 etiquetas (105 × 48 mm)', tipo: 'HOJA', pagina: [210, 297], etiqueta: [105, 48], columnas: 2, filas: 6, margen: [0, 4.5], qr: 38 },
  A4_8: { id: 'A4_8', nombre: 'Hoja A4 · 8 etiquetas grandes (105 × 70 mm)', tipo: 'HOJA', pagina: [210, 297], etiqueta: [105, 70], columnas: 2, filas: 4, margen: [0, 8.5], qr: 52 },
  ROLLO_50x30: { id: 'ROLLO_50x30', nombre: 'Rollo térmico 50 × 30 mm', tipo: 'ROLLO', pagina: [50, 30], etiqueta: [50, 30], columnas: 1, filas: 1, margen: [0, 0], qr: 24 },
  ROLLO_100x60: { id: 'ROLLO_100x60', nombre: 'Rollo térmico 100 × 60 mm (cajas y estantes)', tipo: 'ROLLO', pagina: [100, 60], etiqueta: [100, 60], columnas: 1, filas: 1, margen: [0, 0], qr: 44 },
}

/**
 * Posición (mm) de cada etiqueta en su página.
 * @param {typeof FORMATOS_ETIQUETA[keyof typeof FORMATOS_ETIQUETA]} f @param {number} cantidad
 * @returns {Array<{pagina:number, x:number, y:number}>}
 */
export function distribuirEtiquetas(f, cantidad) {
  const porPagina = f.columnas * f.filas
  return Array.from({ length: cantidad }, (_, i) => {
    const enPagina = i % porPagina
    return {
      pagina: Math.floor(i / porPagina),
      x: f.margen[0] + (enPagina % f.columnas) * f.etiqueta[0],
      y: f.margen[1] + Math.floor(enPagina / f.columnas) * f.etiqueta[1],
    }
  })
}

/** Cantidad de páginas que ocupa un lote. */
export const paginasNecesarias = (f, cantidad) => Math.max(1, Math.ceil(cantidad / (f.columnas * f.filas)))

/**
 * Dónde se va a usar la etiqueta. No limita nada: orienta al momento de imprimir y ajusta la tolerancia del QR a fallos.
 * (Nivel de corrección de errores: Q recupera hasta ~25 % dañado; H hasta ~30 %.)
 */
export const AMBIENTES_ETIQUETA = {
  SECO: { id: 'SECO', nombre: 'Bodega seca o escritorio', correccion: 'Q' },
  FRIO: { id: 'FRIO', nombre: 'Cámara fría, húmeda o a la intemperie', correccion: 'H' },
}

/** Recomendaciones de impresión según el formato y el ambiente elegidos. @returns {string[]} */
export function guiaImpresion(formato, ambiente) {
  const tips = []
  if (formato.tipo === 'HOJA') {
    tips.push('Impresora común: al imprimir elige tamaño real o 100 % (nunca «ajustar a la página») para que las etiquetas calcen.')
    tips.push('Puedes usar hojas de sticker A4 con etiquetas del mismo tamaño, o papel normal y cortar por las líneas.')
  } else {
    tips.push('Impresora de etiquetas: configura en el controlador el mismo tamaño de papel que el formato elegido.')
  }
  if (ambiente.id === 'FRIO') {
    tips.push('Para frío o humedad conviene papel sintético o poliéster, o laminar la etiqueta. El papel común se despega y se borra.')
    tips.push('Se imprime el QR con máxima tolerancia a daños; no lo reduzcas al pegarlo.')
  } else {
    tips.push('Para bodega seca basta papel sticker común. Evita zonas que se mojen.')
  }
  tips.push('Pega la etiqueta en una zona plana y limpia, sin pliegues sobre el QR.')
  return tips
}

/** Unidades por QR de un lote o cilindro: SERIE es 1 etiqueta por unidad. */
export const etiquetasDeCompra = (tipo, cantidad) => (tipo === 'SERIE' ? cantidad : 1)
