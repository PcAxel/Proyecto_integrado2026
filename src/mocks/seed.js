import { calcularNeto, desglosarTotal } from '@/domain/money'
import { crearMovimiento, crearReversa, crearReingresoSobrante } from '@/domain/cardex'
import { simularRentabilidad, precioParaMargen } from '@/domain/rentabilidad'
import { formatRut } from '@/domain/rut'
import { USUARIOS_DEMO } from '@/mocks/usuarios'

/** Fecha de referencia del dataset (determinista: las capturas del informe son reproducibles). */
const HOY = Date.UTC(2026, 9, 23, 12, 0, 0)
/** @param {number} dias desplazamiento respecto de hoy @param {string} [hora] */
const f = (dias, hora = '09:00') => `${new Date(HOY + dias * 86_400_000).toISOString().slice(0, 10)}T${hora}:00`
const fd = (dias) => f(dias).slice(0, 10)
const pad = (n, w = 3) => String(n).padStart(w, '0')

const CLIENTES = [
  ['76.115.402', 'Packing Cordillera S.A.', 'Embalaje de fruta fresca', 'Chillán Viejo', 'Andrea Poblete', '+56 9 8421 3307'],
  ['77.248.913', 'Frutícola Río Ñuble SpA', 'Producción y exportación de fruta', 'San Carlos', 'Héctor Navarrete', '+56 9 7712 4550'],
  ['76.903.158', 'Agrícola Los Maitenes Ltda.', 'Cultivo de berries', 'Quillón', 'Marcela Rebolledo', '+56 9 9034 1182'],
  ['78.054.267', 'Lácteos Valle del Itata Ltda.', 'Elaboración de productos lácteos', 'Yungay', 'Iván Carrasco', '+56 9 6650 2941'],
  ['76.420.835', 'Carnes Selectas Chillán SpA', 'Faenamiento y distribución de carnes', 'Chillán', 'Paulina Ortiz', '+56 9 8890 7716'],
  ['77.613.092', 'Viñedos San Carlos Ltda.', 'Producción vitivinícola', 'San Carlos', 'Ricardo Alarcón', '+56 9 5521 0834'],
  ['76.298.744', 'Congelados Bulnes SpA', 'Procesamiento de vegetales congelados', 'Bulnes', 'Soledad Henríquez', '+56 9 7340 9925'],
  ['78.337.581', 'Hortalizas Pinto Ltda.', 'Producción hortícola', 'Pinto', 'Claudio Vergara', '+56 9 6218 4473'],
].map(([rut, razon_social, giro, comuna, contacto, telefono], i) => ({
  id: `CLI-${pad(i + 1)}`,
  rut: formatRut(rut.replace(/\./g, '')),
  razon_social,
  giro,
  comuna,
  contacto,
  telefono,
  email: `contacto@${razon_social.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.cl`,
  activo: true,
}))

const PROVEEDORES = [
  ['76.554.120', 'Distribuidora Frigotec Ltda.', 'Concepción', 'Sergio Bravo', '30 días', [10, 5, 0]],
  ['77.019.384', 'Repuestos Refrigeración Biobío SpA', 'Los Ángeles', 'Natalia Pino', '30 días', [8, 0, 0]],
  ['76.730.915', 'Eléctrica Industrial Chillán Ltda.', 'Chillán', 'Mauricio Soto', '45 días', [5, 3, 2]],
  ['78.112.640', 'Cobres y Metales del Sur S.A.', 'Talcahuano', 'Daniela Muñoz', 'Contado', [4, 0, 0]],
  ['76.845.277', 'Aislantes Térmicos Ñuble SpA', 'Chillán', 'Felipe Araya', '30 días', [6, 2, 0]],
].map(([rut, razon_social, comuna, contacto, condicion_pago, descuentos], i) => ({
  id: `PRV-${pad(i + 1)}`,
  rut: formatRut(rut.replace(/\./g, '')),
  razon_social,
  comuna,
  contacto,
  condicion_pago,
  descuentos_habituales: descuentos,
  activo: true,
}))

/** [sku, nombre, categoría, unidad, costo neto, stock mínimo, proveedor] */
const ARTICULOS_BASE = [
  ['REF-404A', 'Refrigerante R404A cilindro 10,9 kg', 'Refrigerantes', 'cil', 128000, 4, 1],
  ['REF-134A', 'Refrigerante R134a cilindro 13,6 kg', 'Refrigerantes', 'cil', 96000, 3, 1],
  ['REF-448A', 'Refrigerante R448A cilindro 11,3 kg', 'Refrigerantes', 'cil', 165000, 2, 1],
  ['REF-507', 'Refrigerante R507 cilindro 11,3 kg', 'Refrigerantes', 'cil', 142000, 2, 1],
  ['LUB-POE', 'Aceite POE 1 L', 'Refrigerantes', 'lt', 14500, 12, 2],
  ['CMP-5HP', 'Compresor semihermético 5 HP', 'Compresores', 'un', 1250000, 1, 2],
  ['CMP-SCR3', 'Compresor scroll 3 HP', 'Compresores', 'un', 780000, 1, 2],
  ['CMP-HER1', 'Compresor hermético 1 HP', 'Compresores', 'un', 230000, 2, 2],
  ['EVA-2500', 'Evaporador de cámara 2.500 W', 'Evaporación y condensación', 'un', 420000, 2, 1],
  ['MOT-VEN', 'Motor ventilador evaporador 1/15 HP', 'Evaporación y condensación', 'un', 48500, 4, 2],
  ['HEL-300', 'Hélice ventilador 300 mm', 'Evaporación y condensación', 'un', 12900, 6, 2],
  ['CND-5HP', 'Condensador enfriado por aire 5 HP', 'Evaporación y condensación', 'un', 540000, 1, 1],
  ['CTL-DIG', 'Controlador digital de temperatura', 'Control', 'un', 78000, 3, 3],
  ['CTL-NTC', 'Sonda NTC 3 m', 'Control', 'un', 9800, 8, 3],
  ['CTL-TDF', 'Termostato diferencial', 'Control', 'un', 27500, 3, 3],
  ['CTL-PRE', 'Presostato dual alta/baja', 'Control', 'un', 36900, 4, 1],
  ['VAL-TXV', 'Válvula de expansión termostática', 'Control', 'un', 89000, 3, 1],
  ['VAL-SOL', 'Válvula solenoide 3/8"', 'Control', 'un', 52000, 3, 1],
  ['FIL-SEC', 'Filtro secador 3/8"', 'Control', 'un', 14800, 8, 1],
  ['VIS-LIQ', 'Visor de líquido 3/8"', 'Control', 'un', 11200, 6, 1],
  ['ELE-CON25', 'Contactor 25 A', 'Eléctrico', 'un', 18900, 6, 3],
  ['ELE-RTM', 'Relé térmico 12–18 A', 'Eléctrico', 'un', 24500, 4, 3],
  ['ELE-CAB', 'Cable 3×2,5 mm²', 'Eléctrico', 'm', 1850, 100, 3],
  ['ELE-CAP40', 'Capacitor de marcha 40 µF', 'Eléctrico', 'un', 7600, 6, 3],
  ['ELE-GRD', 'Guardamotor 20 A', 'Eléctrico', 'un', 20800, 3, 3],
  ['CU-38', 'Cañería de cobre 3/8"', 'Cobre y soldadura', 'm', 5900, 60, 4],
  ['CU-12', 'Cañería de cobre 1/2"', 'Cobre y soldadura', 'm', 7800, 60, 4],
  ['CU-58', 'Cañería de cobre 5/8"', 'Cobre y soldadura', 'm', 10400, 50, 4],
  ['SOL-AG15', 'Varilla de soldadura plata 15 %', 'Cobre y soldadura', 'un', 4200, 20, 4],
  ['AIS-C38', 'Coquilla aislante 3/8"', 'Aislación', 'm', 1450, 80, 5],
  ['AIS-C58', 'Coquilla aislante 5/8"', 'Aislación', 'm', 1980, 80, 5],
  ['AIS-PU100', 'Panel poliuretano 100 mm', 'Aislación', 'm²', 28900, 20, 5],
  ['AIS-CIN', 'Cinta vulcanizante aislante', 'Aislación', 'un', 6700, 10, 5],
  ['AIS-ESP', 'Espuma de poliuretano 750 ml', 'Aislación', 'un', 7900, 12, 5],
  ['INS-DES', 'Desengrasante de serpentines 5 L', 'Insumos', 'un', 16800, 4, 2],
]

const ARTICULOS = ARTICULOS_BASE.map(([sku, nombre, categoria, unidad, costo, minimo, prov], i) => ({
  id: `ART-${pad(i + 1)}`,
  sku,
  nombre,
  categoria,
  unidad,
  costo_unitario: costo,
  stock_minimo: minimo,
  proveedor_id: `PRV-${pad(prov)}`,
  activo: true,
}))
const art = (sku) => ARTICULOS.find((a) => a.sku === sku)

/** [nombre, cargo/especialidad, costo hora-hombre, ingreso, usuario] */
const TECNICOS = [
  ['Jorge Quezada', 'Técnico Frigorista Senior', 11500, '2018-03-12', 'U-005'],
  ['Cristian Medina', 'Técnico Frigorista Senior', 11200, '2017-08-01'],
  ['Luis Parra', 'Técnico Frigorista', 9800, '2019-05-20'],
  ['Marco Riquelme', 'Técnico Frigorista', 9600, '2020-01-13'],
  ['Felipe Cáceres', 'Técnico Frigorista', 9400, '2020-09-07'],
  ['Sebastián Gutiérrez', 'Técnico Electricista', 9900, '2019-11-04'],
  ['Pablo Illanes', 'Técnico Electricista', 9200, '2021-03-15'],
  ['Nicolás Vidal', 'Técnico Frigorista', 8800, '2021-07-26'],
  ['Andrés Torres', 'Soldador Especialista', 10400, '2018-10-09'],
  ['Gonzalo Fierro', 'Soldador', 8900, '2022-02-14'],
  ['Matías Escobar', 'Técnico Frigorista Junior', 7200, '2023-04-03'],
  ['Diego Lagos', 'Técnico Frigorista Junior', 7000, '2023-06-19'],
  ['Cristóbal Sandoval', 'Ayudante Técnico', 6500, '2024-01-22'],
  ['Ignacio Pereira', 'Ayudante Técnico', 6500, '2024-03-11'],
  ['Rodolfo Zúñiga', 'Montajista de Paneles', 8300, '2022-09-05'],
  ['Hugo Salazar', 'Montajista de Paneles', 8100, '2022-11-28'],
].map(([nombre, cargo, tarifa, ingreso, usuario], i) => ({
  id: `T-${pad(i + 1, 2)}`,
  rut: formatRut(15_000_000 + (i + 1) * 387_421),
  nombre,
  cargo,
  costo_hora_hombre: tarifa,
  fecha_ingreso: ingreso,
  usuario_id: usuario ?? null,
  vencimiento_licencia: fd(30 + ((i * 53) % 400)),
  activo: true,
}))

/** [id, patente, marca, modelo, técnico asignado, revisión (días), seguro (días), km actual, estado] */
const FLOTA = [
  ['VH-01', 'KLRT-42', 'Toyota', 'Hilux 2.4 DX', 'T-01', 12, 95, 48250, 'ACTIVO'],
  ['VH-02', 'LPXB-18', 'Toyota', 'Hilux 2.4 DX', 'T-02', 160, 210, 62910, 'ACTIVO'],
  ['VH-03', 'JHYS-77', 'Nissan', 'NP300 Frontier', 'T-03', -4, 150, 91340, 'ACTIVO'],
  ['VH-04', 'MNCD-30', 'Chevrolet', 'N400 Max', 'T-05', 240, 20, 35780, 'ACTIVO'],
  ['VH-05', 'KSZV-65', 'Hyundai', 'H-1 Furgón', 'T-09', 75, 300, 74120, 'ACTIVO'],
  ['VH-06', 'LTGA-09', 'Ford', 'Ranger XL', 'T-06', 190, 120, 27560, 'ACTIVO'],
  ['VH-07', 'RTJK-45', 'Mitsubishi', 'L200 Katana', 'T-04', 120, 200, 118420, 'EN_TALLER'],
].map(([id, patente, marca, modelo, tecnico_id, rev, seguro, km_actual, estado]) => ({
  id, patente, marca, modelo, tecnico_id, km_actual, estado, vencimiento_revision: fd(rev), vencimiento_seguro: fd(seguro), activo: true,
}))

/** Parámetros de obra: [nombre, cliente, tipo, presupuesto, estado, comuna, dirección, lat, lng, supervisor, técnicos, inicio, fin] */
const OBRAS_BASE = [
  ['Cámara de frío N°3 – línea de packing', 1, 'INSTALACION', 'PRE-0001', 'EN_CURSO', 'Chillán Viejo', 'Camino a Las Mariposas km 4', -36.6285, -72.1331, ['T-01', 'T-03', 'T-09', 'T-15'], -34, 14],
  ['Mantención preventiva túnel de congelado', 7, 'MANTENCION', 'PRE-0002', 'EN_CURSO', 'Bulnes', 'Ruta Q-50 km 2', -36.7425, -72.2994, ['T-02', 'T-06'], -12, 6],
  ['Sala de proceso refrigerada – planta láctea', 4, 'INSTALACION', 'PRE-0003', 'FINALIZADA', 'Yungay', 'Av. Ricardo Lagos 410', -37.1167, -72.0167, ['T-04', 'T-07', 'T-16'], -58, -9],
  ['Emergencia: falla de compresor en cámara de fruta', 2, 'EMERGENCIA', null, 'EN_CURSO', 'San Carlos', 'Fundo El Roble s/n', -36.4243, -71.9582, ['T-01', 'T-02', 'T-05'], -3, 2],
  ['Garantía: evaporador con ruido anormal', 5, 'GARANTIA', null, 'EN_CURSO', 'Chillán', 'Av. Collín 1280', -36.5987, -72.0894, ['T-08'], -2, 3],
  ['Cámara de maduración N°1', 3, 'INSTALACION', 'PRE-0004', 'PLANIFICADA', 'Quillón', 'Camino a Ránquil km 6', -36.7436, -72.4650, ['T-03', 'T-10', 'T-15'], 6, 30],
  ['Reparación sistema de condensación bodega de vino', 6, 'REPARACION', 'PRE-0005', 'EN_CURSO', 'San Carlos', 'Ruta N-59 km 12', -36.4372, -71.9421, ['T-04', 'T-09'], -9, 1],
]

/** Materiales de presupuesto: [sku, cantidad] */
const PRESUPUESTOS_BASE = [
  ['Cámara de frío N°3 – Packing Cordillera', 1, 'INSTALACION', 'APROBADO', -45, 32, [['REF-404A', 2], ['CMP-5HP', 1], ['EVA-2500', 2], ['CU-12', 40], ['AIS-C58', 40], ['ELE-CON25', 3], ['CTL-DIG', 1]], [['Instalación y montaje', 120], ['Puesta en marcha', 16]], [['Flete y viáticos', 180000]]],
  ['Mantención túnel de congelado – Congelados Bulnes', 7, 'MANTENCION', 'APROBADO', -20, 28, [['LUB-POE', 4], ['FIL-SEC', 2], ['ELE-CAP40', 3], ['INS-DES', 2]], [['Mantención preventiva', 48]], [['Viáticos', 60000]]],
  ['Sala refrigerada – Lácteos Valle del Itata', 4, 'INSTALACION', 'APROBADO', -70, 35, [['REF-134A', 2], ['CMP-SCR3', 1], ['EVA-2500', 1], ['AIS-PU100', 24], ['CU-38', 30], ['AIS-C38', 30]], [['Montaje de paneles', 90], ['Instalación frigorífica', 70]], [['Flete', 150000]]],
  ['Cámara de maduración – Agrícola Los Maitenes', 3, 'INSTALACION', 'APROBADO', -10, 26, [['REF-448A', 1], ['CMP-SCR3', 1], ['EVA-2500', 1], ['CTL-DIG', 2], ['AIS-PU100', 36]], [['Montaje de paneles', 110], ['Instalación frigorífica', 80]], [['Flete', 120000]]],
  ['Reparación condensación – Viñedos San Carlos', 6, 'REPARACION', 'APROBADO', -25, 30, [['CND-5HP', 1], ['CU-58', 25], ['SOL-AG15', 6]], [['Reparación y soldadura', 40]], [['Viáticos', 40000]]],
  ['Ampliación cámara de hortalizas – Hortalizas Pinto', 8, 'INSTALACION', 'BORRADOR', -3, 14, [['CMP-HER1', 2], ['EVA-2500', 1], ['AIS-PU100', 18], ['VAL-TXV', 2]], [['Montaje', 60]], [['Flete', 90000]]],
  ['Reemplazo de evaporadores – Carnes Selectas', 5, 'INSTALACION', 'ENVIADO', -6, 24, [['EVA-2500', 2], ['MOT-VEN', 4], ['VAL-SOL', 2], ['CU-38', 20]], [['Instalación', 56]], [['Flete', 70000]]],
]

/** Hojas de servicio: [obra idx, técnico, día, horas, estado, checklist, [dLat,dLng], observaciones] */
const OK = { presion_psi: 98, amperaje_a: 18, fugas: 'SIN_FUGAS', temperatura_c: -18, limpieza: 'OK' }
const HOJAS_BASE = [
  [3, 'T-04', -55, 8, 'APROBADA', OK, [0.0002, 0.0001], 'Montaje de paneles sin novedades.'],
  [3, 'T-07', -48, 7.5, 'APROBADA', { ...OK, amperaje_a: 22 }, [0.0001, -0.0002], 'Conexión eléctrica de unidad condensadora.'],
  [3, 'T-16', -30, 6, 'APROBADA', OK, [-0.0001, 0.0001], 'Sellado y pruebas de hermeticidad.'],
  [1, 'T-01', -28, 9, 'APROBADA', OK, [0.0003, 0.0002], 'Montaje de evaporadores.'],
  [1, 'T-09', -24, 8, 'APROBADA', { ...OK, presion_psi: 104 }, [0.0001, 0.0001], 'Soldadura de líneas de succión.'],
  [1, 'T-03', -2, 7, 'ENVIADA', { ...OK, limpieza: 'PARCIAL' }, [0.0002, -0.0001], 'Pendiente limpieza final de sala.'],
  [2, 'T-02', -10, 6, 'ENVIADA', { ...OK, temperatura_c: -22 }, [0.0001, 0.0002], 'Revisión de ciclo de descarche.'],
  [2, 'T-06', -8, 5, 'DEVUELTA', { ...OK, amperaje_a: 52 }, [0.0002, 0.0002], 'Amperaje alto en motor de evaporador.'],
  [4, 'T-01', -2, 10, 'ENVIADA', { presion_psi: 188, amperaje_a: 31, fugas: 'FUGA_MENOR', temperatura_c: 4, limpieza: 'OK' }, [0.0002, 0.0001], 'Compresor bloqueado; se reemplaza. Fuga menor en válvula de servicio.'],
  [4, 'T-05', -1, 9, 'ENVIADA', OK, [0.0310, 0.0270], 'Pruebas de funcionamiento tras reemplazo.'],
  [5, 'T-08', -1, 4, 'ENVIADA', { ...OK, limpieza: 'OK', temperatura_c: -2 }, [0.0001, 0.0001], 'Se detecta rodamiento defectuoso en ventilador.'],
  [7, 'T-04', -7, 12, 'APROBADA', OK, [0.0001, 0.0001], 'Reemplazo de condensador.'],
  [7, 'T-09', -6, 9, 'APROBADA', { ...OK, presion_psi: 112 }, [0.0002, 0.0001], 'Soldadura y prueba de presión.'],
]

export function createSeed() {
  const recomputeId = (n) => `OB-${pad(n, 4)}`
  const OBRAS = OBRAS_BASE.map(([nombre, cli, tipo, presupuesto_id, estado, comuna, direccion, lat, lng, tecnicos, ini, fin], i) => ({
    id: recomputeId(i + 1),
    nombre,
    cliente_id: `CLI-${pad(cli)}`,
    tipo,
    estado,
    presupuesto_id,
    es_emergencia_sin_presupuesto: presupuesto_id === null,
    supervisor_id: 'U-004',
    tecnicos,
    ubicacion: { comuna, direccion, lat, lng, radio_m: 150 },
    fecha_inicio: fd(ini),
    fecha_fin_estimada: fd(fin),
    fecha_cierre: estado === 'FINALIZADA' ? fd(fin) : null,
    sobrantes_conciliados: i === 2 || i === 6,
    pendientes_sync: i === 0 ? 2 : i === 1 ? 1 : 0,
  }))

  const PRESUPUESTOS = PRESUPUESTOS_BASE.map(([titulo, cli, tipo, estado, dia, margenObj, mats, mo, adic], i) => {
    const materiales = mats.map(([sku, cantidad]) => ({ articulo_id: art(sku).id, cantidad, costo_unitario: art(sku).costo_unitario }))
    const tarifa = (n) => TECNICOS[n].costo_hora_hombre
    const mano_obra = mo.map(([descripcion, horas], j) => ({ descripcion, horas, costo_hora_hombre: tarifa(j % 2 === 0 ? 2 : 8) }))
    const adicionales = adic.map(([descripcion, monto]) => ({ descripcion, monto }))
    const costo = simularRentabilidad({ materiales, mano_obra, adicionales, precio_venta_neto: 0 }).costoTotal
    const precio_venta_neto = precioParaMargen(costo, margenObj)
    return {
      id: `PRE-${pad(i + 1, 4)}`,
      titulo,
      cliente_id: `CLI-${pad(cli)}`,
      tipo_obra: tipo,
      estado,
      fecha: fd(dia),
      materiales,
      mano_obra,
      adicionales,
      precio_venta_neto,
      aprobado_por: estado === 'APROBADO' ? 'U-002' : null,
    }
  })

  // ── Compras y Cardex ──────────────────────────────────────────────
  /** @type {import('@/domain/cardex').MovimientoCardex[]} */
  const CARDEX = []
  const mov = (r) => {
    if (!r.ok) throw new Error(`Seed inconsistente: ${r.error}`)
    CARDEX.push(r.movimiento)
    return r.movimiento
  }
  const BODEGA = 'U-003'

  const FACTURAS = []
  const facturar = (provId, dia, extra = []) => {
    const prov = PROVEEDORES.find((p) => p.id === provId)
    const factor = calcularNeto(1, prov.descuentos_habituales) || 1
    const items = ARTICULOS.filter((a) => a.proveedor_id === provId).map((a) => ({
      articulo_id: a.id,
      cantidad: Math.max(a.stock_minimo * 5, 6),
      precio_lista: Math.round(a.costo_unitario / factor),
    }))
    const lista = extra.length ? items.filter((it) => extra.includes(it.articulo_id)) : items
    const id = `FC-${pad(FACTURAS.length + 1, 4)}`
    const bruto = lista.reduce((s, it) => s + it.cantidad * it.precio_lista, 0)
    const neto = calcularNeto(bruto, prov.descuentos_habituales)
    FACTURAS.push({
      id,
      numero: String(48200 + FACTURAS.length * 37),
      proveedor_id: provId,
      fecha: fd(dia),
      items: lista,
      descuentos: prov.descuentos_habituales,
      neto_bruto: bruto,
      ...desglosarTotal(neto),
      estado: 'REGISTRADA',
    })
    lista.forEach((it) =>
      mov(crearMovimiento(CARDEX, {
        tipo: 'ENTRADA_COMPRA', articulo_id: it.articulo_id, cantidad: it.cantidad,
        costo_unitario: calcularNeto(it.precio_lista, prov.descuentos_habituales),
        usuario_id: BODEGA, fecha: f(dia, '10:30'), referencia: id,
      })),
    )
  }
  ;['PRV-001', 'PRV-002', 'PRV-003', 'PRV-004', 'PRV-005'].forEach((p, i) => facturar(p, -75 + i))
  facturar('PRV-001', -22, [art('REF-404A').id, art('REF-134A').id, art('FIL-SEC').id])

  const NOTAS_CREDITO = [
    { id: 'NC-0001', factura_id: 'FC-0002', numero: '3310', fecha: fd(-60), motivo: 'Bonificación por retraso en la entrega', neto: 85000, iva: 16150, total: 101150 },
  ]

  const salida = (sku, cant, obraN, dia, hora = '08:30') =>
    mov(crearMovimiento(CARDEX, {
      tipo: 'SALIDA_OBRA', articulo_id: art(sku).id, cantidad: cant, costo_unitario: lastCost(art(sku).id),
      obra_id: recomputeId(obraN), usuario_id: BODEGA, fecha: f(dia, hora), referencia: `Retiro para ${recomputeId(obraN)}`,
    }))
  const lastCost = (id) => [...CARDEX].reverse().find((m) => m.tipo === 'ENTRADA_COMPRA' && m.articulo_id === id).costo_unitario

  // Obra 3 (finalizada)
  salida('REF-134A', 2, 3, -66); salida('CMP-SCR3', 1, 3, -66); salida('EVA-2500', 1, 3, -64)
  salida('AIS-PU100', 24, 3, -63); salida('CU-38', 30, 3, -62); const coq = salida('AIS-C38', 40, 3, -62)
  mov(crearReingresoSobrante(CARDEX, { salida_id: coq.id, cantidad: 10, usuario_id: BODEGA, fecha: f(-10, '16:00') }))
  // Obra 1
  salida('REF-404A', 2, 1, -30); salida('CMP-5HP', 1, 1, -30); salida('EVA-2500', 2, 1, -29)
  const cu12 = salida('CU-12', 40, 1, -28); salida('AIS-C58', 40, 1, -28); salida('ELE-CON25', 3, 1, -27)
  mov(crearReingresoSobrante(CARDEX, { salida_id: cu12.id, cantidad: 6, usuario_id: BODEGA, fecha: f(-5, '15:20'), motivo: 'Sobrante de cañería devuelto a bodega' }))
  // Obra 2 (incluye reversa por error de despacho)
  const equiv = salida('CTL-DIG', 2, 2, -11)
  mov(crearReversa(CARDEX, equiv.id, { usuario_id: BODEGA, fecha: f(-11, '11:05'), motivo: 'Artículo equivocado: se solicitó sonda NTC' }))
  salida('CTL-NTC', 2, 2, -11, '11:20'); salida('LUB-POE', 4, 2, -10); salida('FIL-SEC', 2, 2, -10); salida('ELE-CAP40', 3, 2, -9)
  // Obra 4 (CU30) y 5 (garantía)
  salida('CMP-SCR3', 1, 4, -3, '07:40'); salida('REF-404A', 1, 4, -3, '07:45'); salida('ELE-CON25', 1, 4, -3, '07:50')
  salida('MOT-VEN', 2, 5, -2); salida('HEL-300', 2, 5, -2)
  // Consumos que dejan alertas de stock visibles en la demo
  salida('ELE-RTM', 17, 1, -20); salida('HEL-300', 25, 5, -15)
  salida('CMP-HER1', 5, 1, -18); salida('CMP-HER1', 5, 5, -12)
  // Obra 7
  salida('CND-5HP', 1, 7, -8); salida('CU-58', 25, 7, -8); salida('SOL-AG15', 6, 7, -8)

  // ── Hojas de servicio ─────────────────────────────────────────────
  const HOJAS = HOJAS_BASE.map(([obraN, tecnico_id, dia, horas, estado, checklist, [dLat, dLng], observaciones], i) => {
    const obra = OBRAS[obraN - 1]
    const tec = TECNICOS.find((t) => t.id === tecnico_id)
    const gps = { lat: obra.ubicacion.lat + dLat, lng: obra.ubicacion.lng + dLng }
    return {
      id: `HS-${pad(i + 1, 4)}`,
      obra_id: obra.id,
      tecnico_id,
      fecha: f(dia, '17:40'),
      estado,
      horas_trabajadas: horas,
      costo_hora_hombre: tec.costo_hora_hombre,
      checklist_json: checklist,
      materiales: [],
      fotos: [
        { id: `FT-${pad(i + 1)}-1`, etiqueta: 'Antes', ...gps, ts: f(dia, '08:15') },
        { id: `FT-${pad(i + 1)}-2`, etiqueta: 'Después', ...gps, ts: f(dia, '17:20') },
      ],
      gps,
      firma_cliente: true,
      observaciones,
      auditoria: estado === 'ENVIADA' ? null : {
        usuario_id: 'U-004',
        fecha: f(dia + 1, '09:10'),
        observaciones: estado === 'DEVUELTA' ? 'Corregir amperaje y adjuntar nueva medición.' : 'Conforme.',
      },
    }
  })

  // Kilometraje de las hojas con el vehículo asignado al técnico. Se reconstruye hacia atrás desde
  // el odómetro actual para que cada hoja continúe donde terminó la anterior.
  const FLOTA_SEED = FLOTA.map((v) => ({ ...v }))
  FLOTA_SEED.forEach((v) => {
    const suyas = HOJAS.filter((h) => h.tecnico_id === v.tecnico_id).sort((a, b) => a.fecha.localeCompare(b.fecha))
    const recorridos = suyas.map((h) => 30 + ((Number(h.id.slice(3)) * 29) % 80))
    let odometro = v.km_actual - recorridos.reduce((s, r) => s + r, 0)
    suyas.forEach((h, i) => {
      h.vehiculo_id = v.id
      h.km_salida = odometro
      odometro += recorridos[i]
      h.km_regreso = odometro
    })
  })

  // ── Solicitudes de retiro desde terreno ───────────────────────────
  const retiro = (n, obraN, tecnico_id, dia, estado, items, observaciones, motivo_rechazo = null) => ({
    id: `SR-${pad(n, 4)}`,
    obra_id: recomputeId(obraN),
    tecnico_id,
    fecha: f(dia, '16:10'),
    estado,
    items: items.map(([sku, cantidad]) => ({ articulo_id: art(sku).id, cantidad })),
    observaciones,
    resuelto_por: estado === 'PENDIENTE' ? null : BODEGA,
    resuelto_en: estado === 'PENDIENTE' ? null : f(dia + 1, '08:20'),
    motivo_rechazo,
    movimientos: [],
  })
  const RETIROS = [
    retiro(1, 1, 'T-03', -1, 'PENDIENTE', [['CU-12', 10], ['SOL-AG15', 4]], 'Para línea de succión sector B'),
    retiro(2, 4, 'T-01', 0, 'PENDIENTE', [['ELE-RTM', 1], ['ELE-CAP40', 2]], 'Repuestos para tablero de la cámara'),
    retiro(3, 2, 'T-02', -6, 'RECHAZADA', [['LUB-POE', 6]], '', 'Ya se entregaron 4 L en el retiro del día 10; ajustar cantidad.'),
  ]

  // ── Log de auditoría derivado de los datos semilla ────────────────
  const LOG = []
  const log = (fecha, usuario_id, entidad, entidad_id, accion, anterior, nuevo) => {
    const u = { 'U-001': ['Carolina Fuentealba', 'ADMIN_GENERAL'], 'U-002': ['Matías Contreras', 'ADMINISTRACION'], 'U-003': ['Rodrigo Sepúlveda', 'BODEGA'], 'U-004': ['Patricio Mella', 'SUPERVISOR'] }[usuario_id]
    LOG.push({ id: '', fecha, usuario_id, usuario_nombre: u[0], rol: u[1], entidad, entidad_id, accion, anterior, nuevo, ip: `192.168.10.${20 + (LOG.length % 9)}` })
  }
  FACTURAS.forEach((fc) => log(`${fc.fecha}T10:30:00`, 'U-003', 'FacturaCompra', fc.id, 'CREAR', null, { total: fc.total }))
  PRESUPUESTOS.filter((p) => p.estado === 'APROBADO').forEach((p) => log(`${p.fecha}T15:00:00`, 'U-002', 'Presupuesto', p.id, 'APROBAR', { estado: 'ENVIADO' }, { estado: 'APROBADO' }))
  OBRAS.filter((o) => o.es_emergencia_sin_presupuesto).forEach((o) => log(`${o.fecha_inicio}T07:30:00`, 'U-004', 'Obra', o.id, 'CREAR_CU30', null, { tipo: o.tipo, es_emergencia_sin_presupuesto: true }))
  CARDEX.filter((m) => m.tipo === 'REVERSA' || m.tipo === 'REINGRESO_SOBRANTE').forEach((m) => log(m.fecha, 'U-003', 'MovimientoCardex', m.id, m.tipo, m.reversa_de ?? m.salida_origen_id, { cantidad: m.cantidad }))
  HOJAS.filter((h) => h.auditoria).forEach((h) => log(h.auditoria.fecha, 'U-004', 'HojaServicio', h.id, h.estado === 'APROBADA' ? 'APROBAR' : 'DEVOLVER', { estado: 'ENVIADA' }, { estado: h.estado }))
  LOG.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((l, i) => { l.id = `LOG-${pad(i + 1, 6)}` })

  // El costo vigente del artículo es el de su última compra.
  ARTICULOS.forEach((a) => { a.costo_unitario = lastCost(a.id) })

  // Usuarios con acceso al sistema. Los de demostración entran por tarjeta de perfil, sin contraseña almacenada.
  const RUT_USUARIO = { 'U-001': 10_234_567, 'U-002': 12_456_789, 'U-003': 13_567_891, 'U-004': 11_678_912, 'U-006': 9_876_543, 'U-007': 14_321_098 }
  const USUARIOS = USUARIOS_DEMO.map((u, i) => ({
    ...u,
    rut: u.id === 'U-005' ? TECNICOS[0].rut : formatRut(RUT_USUARIO[u.id]),
    activo: true,
    debe_cambiar_password: false,
    creado_en: f(-120 + i, '09:00'),
    creado_por: u.id === 'U-001' ? 'SISTEMA' : 'U-001',
  }))

  return structuredClone({
    usuarios: USUARIOS,
    clientes: CLIENTES,
    proveedores: PROVEEDORES,
    articulos: ARTICULOS,
    cardex: CARDEX,
    facturas: FACTURAS,
    notas_credito: NOTAS_CREDITO,
    presupuestos: PRESUPUESTOS,
    obras: OBRAS,
    hojas: HOJAS,
    retiros: RETIROS,
    personal: TECNICOS,
    flota: FLOTA_SEED,
    auditoria: LOG,
  })
}

