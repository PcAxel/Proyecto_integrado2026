import { formatCLP } from './money'

/** Cómo se muestra la proyección de IVA: rojo si hay que pagar, verde si queda remanente a favor. `saldo` = IVA de ventas − IVA de compras. */
export function presentarIva(saldo) {
  if (saldo > 0) return { tono: 'crit', valor: formatCLP(saldo), estado: 'A pagar', nota: 'IVA de ventas mayor que el de compras: se paga al SII el mes siguiente' }
  if (saldo < 0) return { tono: 'ok', valor: formatCLP(-saldo), estado: 'A favor', nota: 'Remanente de crédito fiscal: se arrastra al mes siguiente' }
  return { tono: 'neutral', valor: formatCLP(0), estado: 'Sin saldo', nota: 'El IVA de ventas y el de compras se compensan' }
}

/** Ganancia neta = ingresos netos − gastos netos; la pérdida se muestra en rojo. */
export function presentarGanancia(ganancia, margenPct) {
  const perdida = ganancia < 0
  return { tono: perdida ? 'crit' : 'ok', estado: perdida ? 'Pérdida del mes' : 'Ganancia del mes', margen: margenPct === null || margenPct === undefined ? 'Sin ventas en el mes' : `Margen ${String(margenPct).replace('.', ',')} % sobre ventas netas` }
}

/** 'YYYY-MM' → 'noviembre de 2026'. */
export function nombreMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
}

/**
 * Resultado del libro de IVA de un mes. `iva` viene del servidor: débito − crédito − remanente anterior; si es positivo se paga,
 * si es negativo queda remanente de crédito fiscal para el mes siguiente.
 */
export function presentarLibroIva(iva) {
  if (iva.a_pagar > 0) return { tono: 'crit', titulo: 'IVA a pagar', valor: iva.a_pagar, nota: 'Se declara y paga en el F29 del mes siguiente' }
  if (iva.remanente_siguiente > 0) return { tono: 'ok', titulo: 'Remanente a favor', valor: iva.remanente_siguiente, nota: 'Se arrastra al mes siguiente y descuenta su IVA a pagar' }
  return { tono: 'neutral', titulo: 'Sin IVA a pagar', valor: 0, nota: 'El débito y el crédito se compensan' }
}

/** Línea con el cálculo, para que se pueda revisar a mano: «380.000 − 95.000 − 190.000 = 95.000». */
export function formulaIva(iva) {
  const n = (v) => formatCLP(v)
  const r = iva.debito - iva.credito - iva.remanente_anterior
  return `${n(iva.debito)} − ${n(iva.credito)} − ${n(iva.remanente_anterior)} = ${n(r)}${r > 0 ? ' → a pagar' : r < 0 ? ' → remanente a favor' : ''}`
}
