import { formatPct } from '@/domain/format'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

/** Cuenta las tareas por tipo para describirlas en una frase («2 presupuestos por aprobar y 1 obra lista para cerrar»). */
export function describirTareas(tareas) {
  const n = (prefijo) => tareas.filter((t) => t.id.startsWith(prefijo)).length
  const partes = [
    [n('apr-'), (c) => plural(c, 'presupuesto por aprobar', 'presupuestos por aprobar')],
    [n('cer-'), (c) => plural(c, 'obra lista para cerrar', 'obras listas para cerrar')],
    [n('cu30-'), (c) => plural(c, 'obra por regularizar', 'obras por regularizar')],
    [n('hoja-'), (c) => plural(c, 'hoja por auditar', 'hojas por auditar')],
    [n('ret-'), (c) => plural(c, 'solicitud de retiro', 'solicitudes de retiro')],
    [n('reponer'), () => 'reposición de stock'],
    [n('venc-'), (c) => plural(c, 'documento por renovar', 'documentos por renovar')],
    [n('taller-'), (c) => plural(c, 'vehículo en taller', 'vehículos en taller')],
  ].filter(([c]) => c > 0).map(([c, f]) => f(c))
  if (partes.length === 0) return ''
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`
}

/**
 * Cómo le habla el inicio a cada rol: titular, frase de apoyo y accesos directos (solo los que su rol puede abrir).
 * Cada entrada recibe las tareas del día para ajustar el mensaje.
 */
export const ENFOQUES = {
  ADMIN_GENERAL: {
    titular: (t) => (t.length ? 'Estas decisiones esperan por ti' : 'Sin decisiones pendientes'),
    apoyo: (t) => (t.length ? `Pendientes: ${describirTareas(t)}.` : 'Los presupuestos y las obras están al día. Revisa los indicadores o administra los accesos.'),
    accesos: [['Revisar presupuestos', '/erp/presupuestos', 'presupuestos.ver'], ['Administrar accesos', '/erp/usuarios', 'usuarios.ver']],
  },
  ADMINISTRACION: {
    titular: (t) => (t.length ? 'Tu mesa de trabajo tiene pendientes' : 'Tu mesa de trabajo está al día'),
    apoyo: (t) => (t.length ? `Hoy: ${describirTareas(t)}.` : 'Registra compras, prepara presupuestos y revisa clientes y proveedores.'),
    accesos: [['Registrar factura', '/erp/compras', 'compras.registrar'], ['Nuevo presupuesto', '/erp/presupuestos/nuevo', 'presupuestos.crear']],
  },
  BODEGA: {
    titular: (t) => (t.length ? 'Tu turno en bodega' : 'Bodega al día'),
    apoyo: (t) => (t.length ? `Tienes ${describirTareas(t)}.` : 'No hay solicitudes pendientes ni stock en alerta.'),
    accesos: [['Atender solicitudes', '/erp/bodega?tab=solicitudes', 'cardex.crear'], ['Registrar salida', '/erp/bodega?tab=cardex', 'cardex.crear']],
  },
  SUPERVISOR: {
    titular: (t) => (t.length ? 'Tus obras te esperan' : 'Tus obras están al día'),
    apoyo: (t) => (t.length ? `Tienes ${describirTareas(t)}.` : 'No hay hojas por auditar ni obras por regularizar.'),
    accesos: [['Auditar hojas de terreno', '/erp/terreno', 'hojas.auditar'], ['Nueva obra', '/erp/obras/nueva', 'obras.crear']],
  },
  RRHH: {
    titular: (t) => (t.length ? 'Tu equipo necesita atención' : 'Equipo y flota al día'),
    apoyo: (t) => (t.length ? `Hay ${describirTareas(t)}.` : 'No hay documentos por renovar ni vehículos detenidos.'),
    accesos: [['Ver vencimientos', '/erp/personal?tab=alertas', 'personal.ver'], ['Revisar la flota', '/erp/personal?tab=flota', 'personal.ver']],
  },
  CONSULTA: {
    titular: () => 'Así va la empresa hoy',
    apoyo: () => 'Vista de solo lectura: lo que ves aquí no puede modificarse desde esta cuenta.',
    accesos: [['Ver obras', '/erp/obras', 'obras.ver'], ['Ver auditoría', '/erp/auditoria', 'auditoria.ver']],
  },
}

const BANDAS_MARGEN = [{ hasta: 20, tono: 'crit' }, { hasta: 30, tono: 'warn' }, { hasta: 50, tono: 'ok' }]

/**
 * Elige el instrumento del panel según los datos que el rol puede ver:
 * margen para quien ve presupuestos, inventario para Bodega, documentos al día para RRHH.
 */
export function elegirInstrumento(k) {
  if (k.margenPonderado !== undefined) {
    return {
      valor: k.margenPonderado, max: 50, marcas: 10, bandas: BANDAS_MARGEN, texto: formatPct(k.margenPonderado), etiqueta: 'Margen ponderado',
      pie: k.presupuestosBajoMargen ? `${plural(k.presupuestosBajoMargen, 'presupuesto', 'presupuestos')} bajo el mínimo de 20 %` : 'Todos los presupuestos sobre el mínimo de 20 %',
    }
  }
  if (k.inventarioSanoPct !== undefined) {
    return {
      valor: k.inventarioSanoPct, max: 100, marcas: 20, bandas: [{ hasta: 70, tono: 'crit' }, { hasta: 90, tono: 'warn' }, { hasta: 100, tono: 'ok' }], texto: `${k.inventarioSanoPct} %`, etiqueta: 'Artículos con stock en rango',
      pie: k.articulosSinStock ? `${plural(k.articulosSinStock, 'artículo sin stock', 'artículos sin stock')}` : 'Ningún artículo sin stock',
    }
  }
  if (k.documentosAlDiaPct !== undefined) {
    return {
      valor: k.documentosAlDiaPct, max: 100, marcas: 20, bandas: [{ hasta: 85, tono: 'crit' }, { hasta: 95, tono: 'warn' }, { hasta: 100, tono: 'ok' }], texto: `${k.documentosAlDiaPct} %`, etiqueta: 'Documentos al día',
      pie: 'Licencias, revisiones técnicas y seguros',
    }
  }
  return null
}

/** Qué indicadores se muestran primero para cada rol; el resto queda tras «Más indicadores». */
export const PRIORIDAD_INDICADORES = {
  ADMIN_GENERAL: ['venta', 'costo', 'obras', 'cu30', 'hojas', 'pres'],
  ADMINISTRACION: ['venta', 'pres', 'costo', 'obras', 'cu30', 'inv'],
  BODEGA: ['stock', 'retiros', 'inv', 'obras'],
  SUPERVISOR: ['obras', 'hojas', 'cu30', 'costo', 'pres', 'venta'],
  RRHH: ['tec', 'veh', 'km', 'venc', 'tarifa'],
  CONSULTA: ['venta', 'costo', 'obras', 'cu30', 'hojas', 'inv'],
}

export function saludoDeLaHora(fecha = new Date()) {
  const h = fecha.getHours()
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}
