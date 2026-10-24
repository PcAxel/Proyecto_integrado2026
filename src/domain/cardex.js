/**
 * Reglas del Cardex (P1, P2): el libro es inmutable. Aquí solo existen funciones
 * que CONSTRUYEN movimientos nuevos; ninguna edita ni elimina uno existente.
 *
 * @typedef {'ENTRADA_COMPRA'|'SALIDA_OBRA'|'REVERSA'|'REINGRESO_SOBRANTE'} TipoMov
 * @typedef {{
 *   id: string, tipo: TipoMov, fecha: string, articulo_id: string, cantidad: number,
 *   costo_unitario: number, signo: 1|-1, obra_id: string|null, usuario_id: string,
 *   referencia: string, reversa_de: string|null, salida_origen_id: string|null
 * }} MovimientoCardex
 * @typedef {{ok: true, movimiento: MovimientoCardex} | {ok: false, error: string}} Resultado
 */

export const TIPOS_MOV = {
  ENTRADA_COMPRA: 'ENTRADA_COMPRA',
  SALIDA_OBRA: 'SALIDA_OBRA',
  REVERSA: 'REVERSA',
  REINGRESO_SOBRANTE: 'REINGRESO_SOBRANTE',
}

const SIGNO_POR_TIPO = { ENTRADA_COMPRA: 1, SALIDA_OBRA: -1, REINGRESO_SOBRANTE: 1 }

/** @param {MovimientoCardex[]} movs */
function siguienteId(movs) {
  return `MOV-${String(movs.length + 1).padStart(6, '0')}`
}

/**
 * Stock derivado: suma de signo × cantidad. Nunca se almacena.
 * @param {MovimientoCardex[]} movs
 * @param {string} articuloId
 */
export function calcularStock(movs, articuloId) {
  return movs.reduce((acc, m) => (m.articulo_id === articuloId ? acc + m.signo * m.cantidad : acc), 0)
}

/** @param {MovimientoCardex[]} movs @param {string} movId */
export function estaReversado(movs, movId) {
  return movs.some((m) => m.tipo === TIPOS_MOV.REVERSA && m.reversa_de === movId)
}

/**
 * Crea una ENTRADA_COMPRA o SALIDA_OBRA. REVERSA y REINGRESO tienen sus propios constructores.
 * Rechaza stock negativo.
 * @param {MovimientoCardex[]} movs
 * @param {{tipo: TipoMov, articulo_id: string, cantidad: number, costo_unitario: number,
 *   obra_id?: string|null, usuario_id: string, fecha: string, referencia?: string}} input
 * @returns {Resultado}
 */
export function crearMovimiento(movs, input) {
  const { tipo, articulo_id, cantidad, costo_unitario, usuario_id, fecha } = input
  if (tipo !== TIPOS_MOV.ENTRADA_COMPRA && tipo !== TIPOS_MOV.SALIDA_OBRA) {
    return { ok: false, error: 'Tipo de movimiento no permitido en esta operación.' }
  }
  if (!(cantidad > 0)) return { ok: false, error: 'La cantidad debe ser mayor que cero.' }
  if (!(costo_unitario > 0)) return { ok: false, error: 'El costo unitario debe ser mayor que cero.' }
  if (tipo === TIPOS_MOV.SALIDA_OBRA) {
    if (!input.obra_id) return { ok: false, error: 'Una salida debe imputarse a una obra.' }
    const stock = calcularStock(movs, articulo_id)
    if (cantidad > stock) return { ok: false, error: `Stock insuficiente: disponible ${stock}, solicitado ${cantidad}.` }
  }
  return {
    ok: true,
    movimiento: {
      id: siguienteId(movs),
      tipo,
      fecha,
      articulo_id,
      cantidad,
      costo_unitario,
      signo: SIGNO_POR_TIPO[tipo],
      obra_id: tipo === TIPOS_MOV.SALIDA_OBRA ? input.obra_id : null,
      usuario_id,
      referencia: input.referencia ?? '',
      reversa_de: null,
      salida_origen_id: null,
    },
  }
}

/**
 * Cantidad de una salida que aún puede devolverse como sobrante.
 * @param {MovimientoCardex[]} movs
 * @param {string} salidaId
 */
export function cantidadReingresable(movs, salidaId) {
  const salida = movs.find((m) => m.id === salidaId)
  if (!salida || salida.tipo !== TIPOS_MOV.SALIDA_OBRA || estaReversado(movs, salidaId)) return 0
  const yaDevuelto = movs
    .filter((m) => m.tipo === TIPOS_MOV.REINGRESO_SOBRANTE && m.salida_origen_id === salidaId && !estaReversado(movs, m.id))
    .reduce((acc, m) => acc + m.cantidad, 0)
  return salida.cantidad - yaDevuelto
}

/**
 * Reversa auditada: contra-asiento único del movimiento original (nunca lo modifica).
 * @param {MovimientoCardex[]} movs
 * @param {string} movId
 * @param {{usuario_id: string, motivo: string, fecha: string}} ctx
 * @returns {Resultado}
 */
export function crearReversa(movs, movId, { usuario_id, motivo, fecha }) {
  const orig = movs.find((m) => m.id === movId)
  if (!orig) return { ok: false, error: 'Movimiento no encontrado.' }
  if (!motivo || motivo.trim().length < 5) return { ok: false, error: 'Debe indicar un motivo (mín. 5 caracteres).' }
  if (orig.tipo === TIPOS_MOV.REVERSA) return { ok: false, error: 'Una reversa no puede reversarse.' }
  if (estaReversado(movs, movId)) return { ok: false, error: 'El movimiento ya fue reversado.' }
  if (orig.tipo === TIPOS_MOV.SALIDA_OBRA && cantidadReingresable(movs, movId) !== orig.cantidad) {
    return { ok: false, error: 'La salida tiene reingresos activos; reverse primero los reingresos.' }
  }
  const stockResultante = calcularStock(movs, orig.articulo_id) - orig.signo * orig.cantidad
  if (stockResultante < 0) {
    return { ok: false, error: 'La reversa dejaría el stock en negativo.' }
  }
  return {
    ok: true,
    movimiento: {
      id: siguienteId(movs),
      tipo: TIPOS_MOV.REVERSA,
      fecha,
      articulo_id: orig.articulo_id,
      cantidad: orig.cantidad,
      costo_unitario: orig.costo_unitario,
      signo: /** @type {1|-1} */ (-orig.signo),
      obra_id: orig.obra_id,
      usuario_id,
      referencia: motivo.trim(),
      reversa_de: orig.id,
      salida_origen_id: null,
    },
  }
}

/**
 * Logística inversa (Regla 3): devuelve sobrante al stock, tasado al costo de la salida original.
 * @param {MovimientoCardex[]} movs
 * @param {{salida_id: string, cantidad: number, usuario_id: string, fecha: string, motivo?: string}} input
 * @returns {Resultado}
 */
export function crearReingresoSobrante(movs, { salida_id, cantidad, usuario_id, fecha, motivo }) {
  const salida = movs.find((m) => m.id === salida_id)
  if (!salida || salida.tipo !== TIPOS_MOV.SALIDA_OBRA) return { ok: false, error: 'Solo se puede reingresar sobrante de una salida a obra.' }
  if (estaReversado(movs, salida_id)) return { ok: false, error: 'La salida fue reversada.' }
  if (!(cantidad > 0)) return { ok: false, error: 'La cantidad debe ser mayor que cero.' }
  const max = cantidadReingresable(movs, salida_id)
  if (cantidad > max) return { ok: false, error: `Solo es posible reingresar hasta ${max} unidad(es).` }
  return {
    ok: true,
    movimiento: {
      id: siguienteId(movs),
      tipo: TIPOS_MOV.REINGRESO_SOBRANTE,
      fecha,
      articulo_id: salida.articulo_id,
      cantidad,
      costo_unitario: salida.costo_unitario,
      signo: 1,
      obra_id: salida.obra_id,
      usuario_id,
      referencia: motivo?.trim() || `Sobrante de ${salida.id}`,
      reversa_de: null,
      salida_origen_id: salida.id,
    },
  }
}

/**
 * Valor monetario del movimiento (siempre positivo).
 * @param {MovimientoCardex} m
 */
export const valorMovimiento = (m) => m.cantidad * m.costo_unitario

/**
 * Estado de stock frente al mínimo.
 * @param {number} stock @param {number} minimo
 * @returns {'SIN_STOCK'|'BAJO'|'OK'}
 */
export function estadoStock(stock, minimo) {
  if (stock <= 0) return 'SIN_STOCK'
  return stock < minimo ? 'BAJO' : 'OK'
}

/**
 * Valor del inventario al último costo de compra.
 * @param {Array<{stock:number, costo_unitario?:number, activo?:boolean}>} articulos
 * @returns {number|null} null si el rol no ve costos
 */
export function valorInventario(articulos) {
  if (articulos.some((a) => a.costo_unitario === undefined)) return null
  return Math.round(articulos.reduce((s, a) => s + a.stock * a.costo_unitario, 0))
}
