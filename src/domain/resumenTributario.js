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
