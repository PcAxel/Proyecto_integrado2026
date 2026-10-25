import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/mocks/db'
import { useAuthStore } from '@/stores/authStore'
import {
  configureHttp, cardexService, articulosService, obrasService, presupuestosService,
  hojasService, comprasService, auditoriaService, personalService, retirosService, proveedoresService, clientesService, dashboardService, usuariosService, busquedaService,
} from '@/services'

const login = (id) => useAuthStore.getState().login(id)
const BODEGA = 'U-003'
const SUPERVISOR = 'U-004'
const ADMIN = 'U-002'
const GERENCIA = 'U-001'
const TECNICO = 'U-005'

beforeEach(async () => {
  configureHttp({ minMs: 0, maxMs: 0, failRate: 0 })
  await db.reset()
  login(BODEGA)
})

describe('contrato del Cardex (P1)', () => {
  it('expone solo list, retrieve, create, reversar, reingresarSobrante', () => {
    expect(Object.keys(cardexService).sort()).toEqual(['create', 'list', 'reingresarSobrante', 'retrieve', 'reversar'])
  })
  it('ningún servicio expone remove/destroy/delete', () => {
    const all = [cardexService, articulosService, obrasService, presupuestosService, hojasService, comprasService, auditoriaService, personalService]
    all.forEach((s) => expect(Object.keys(s).some((k) => /remove|destroy|delete|eliminar/i.test(k))).toBe(false))
  })
  it('reversa una sola vez y audita', async () => {
    const [ultima] = (await cardexService.list({ tipo: 'SALIDA_OBRA' })).filter((m) => !m.reversado)
    const antes = db.all('cardex').length
    const rev = await cardexService.reversar(ultima.id, 'Despacho duplicado por error')
    expect(rev.tipo).toBe('REVERSA')
    expect(db.all('cardex')).toHaveLength(antes + 1)
    await expect(cardexService.reversar(ultima.id, 'Otra vez más')).rejects.toMatchObject({ status: 422 })
    const logs = await (login(ADMIN), auditoriaService.list({ accion: 'REVERSA' }))
    expect(logs[0]).toMatchObject({ entidad: 'MovimientoCardex', usuario_id: BODEGA, rol: 'BODEGA' })
  })
  it('rechaza salidas que dejan stock negativo', async () => {
    const [a] = await articulosService.list()
    await expect(cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 99999, obra_id: 'OB-0001' }))
      .rejects.toMatchObject({ status: 422 })
  })
})

describe('RBAC en servicios (P5)', () => {
  it('Técnico no ve costos de artículos ni puede usar bodega', async () => {
    login(TECNICO)
    await expect(articulosService.list()).rejects.toMatchObject({ status: 403 })
  })
  it('Bodega no ve costos de hora-hombre en hojas pero sí costos de compra', async () => {
    login(SUPERVISOR)
    const hojas = await hojasService.list()
    expect(hojas.length).toBeGreaterThan(0)
    login(BODEGA)
    expect((await articulosService.list())[0].costo_unitario).toBeGreaterThan(0)
    await expect(hojasService.list()).rejects.toMatchObject({ status: 403 })
  })
  it('Bodega no aprueba presupuestos; Administración no aprueba margen < 20 %', async () => {
    await expect(presupuestosService.aprobar('PRE-0007')).rejects.toMatchObject({ status: 403 })
    login(ADMIN)
    const roja = await presupuestosService.create({ cliente_id: 'CLI-001', titulo: 'Prueba margen bajo', tipo_obra: 'MANTENCION', materiales: [], mano_obra: [], adicionales: [{ descripcion: 'x', monto: 100000 }], precio_venta_neto: 105000 })
    await presupuestosService.enviar(roja.id)
    await expect(presupuestosService.aprobar(roja.id)).rejects.toMatchObject({ status: 403 })
    login(GERENCIA)
    expect((await presupuestosService.aprobar(roja.id)).estado).toBe('APROBADO')
  })
  it('un presupuesto aprobado no se puede modificar', async () => {
    login(ADMIN)
    await expect(presupuestosService.update('PRE-0001', { titulo: 'Cambio' })).rejects.toMatchObject({ status: 409 })
  })
})

describe('obras: CU30 y cierre', () => {
  it('exige presupuesto para instalación y permite emergencia solo a Supervisor/Gerencia', async () => {
    login(SUPERVISOR)
    await expect(obrasService.create({ nombre: 'X', cliente_id: 'CLI-001', tipo: 'INSTALACION' })).rejects.toMatchObject({ status: 422 })
    const o = await obrasService.create({ nombre: 'Falla urgente', cliente_id: 'CLI-001', tipo: 'EMERGENCIA', ubicacion: { lat: -36.6, lng: -72.1, radio_m: 150, comuna: 'Chillán', direccion: 'X' } })
    expect(o.es_emergencia_sin_presupuesto).toBe(true)
    login(ADMIN)
    await expect(obrasService.create({ nombre: 'Y', cliente_id: 'CLI-001', tipo: 'EMERGENCIA' })).rejects.toMatchObject({ status: 403 })
  })
  it('bloquea finalizar una emergencia sin regularizar y permite la obra lista', async () => {
    login(SUPERVISOR)
    await expect(obrasService.finalizar('OB-0004')).rejects.toMatchObject({ status: 422 })
    const ok = await obrasService.finalizar('OB-0007')
    expect(ok.estado).toBe('FINALIZADA')
  })
  it('oculta el costo real a quien no puede verlo', async () => {
    login(BODEGA)
    expect((await obrasService.retrieve('OB-0001')).costo_real).toBeNull()
    login(ADMIN)
    expect((await obrasService.retrieve('OB-0001')).costo_real.total).toBeGreaterThan(0)
  })
})

describe('hojas de servicio', () => {
  it('congela la tarifa hora-hombre al enviar y rechaza checklist incompleto', async () => {
    login(TECNICO)
    const base = { obra_id: 'OB-0001', horas_trabajadas: 3, gps: { lat: -36.6285, lng: -72.1331 } }
    await expect(hojasService.enviar({ ...base, checklist_json: { presion_psi: 90 } })).rejects.toMatchObject({ status: 422 })
    const h = await hojasService.enviar({ ...base, checklist_json: { presion_psi: 90, amperaje_a: 15, fugas: 'SIN_FUGAS', temperatura_c: -18, limpieza: 'OK' } })
    expect(h.estado).toBe('ENVIADA')
    expect(h.costo_hora_hombre).toBeUndefined() // el técnico no ve tarifas
    expect(db.find('hojas', h.id).costo_hora_hombre).toBe(11500)
    expect(h.geocerca.dentro).toBe(true)
  })
  it('devolver exige observaciones y aprobar deja auditoría', async () => {
    login(SUPERVISOR)
    await expect(hojasService.devolver('HS-0006', '')).rejects.toMatchObject({ status: 422 })
    expect((await hojasService.aprobar('HS-0006', 'Conforme')).estado).toBe('APROBADA')
    await expect(hojasService.aprobar('HS-0006')).rejects.toMatchObject({ status: 409 })
  })
})

describe('compras', () => {
  it('3 descuentos en cascada generan entradas valoradas al costo neto', async () => {
    const [a] = (await articulosService.list()).filter((x) => x.proveedor_id === 'PRV-003')
    const stockAntes = a.stock
    const f = await comprasService.createFactura({
      proveedor_id: 'PRV-003', numero: '99001', fecha: '2026-10-23', descuentos: [10, 5, 2],
      items: [{ articulo_id: a.id, cantidad: 10, precio_lista: 10000 }],
    })
    expect(f.neto).toBe(83790) // 100.000 × 0,90 × 0,95 × 0,98
    const mov = db.all('cardex').at(-1)
    expect(mov).toMatchObject({ tipo: 'ENTRADA_COMPRA', costo_unitario: 8379, referencia: f.id })
    expect((await articulosService.retrieve(a.id)).stock).toBe(stockAntes + 10)
    await expect(comprasService.createFactura({ ...f, descuentos: [1, 2, 3, 4], numero: 'x', items: f.items })).rejects.toMatchObject({ status: 422 })
  })
})

describe('solicitudes de retiro', () => {
  const items = [{ articulo_id: 'ART-026', cantidad: 2 }]
  it('el técnico crea solo para obras donde está asignado y sin ver costos', async () => {
    login(TECNICO)
    await expect(retirosService.create({ obra_id: 'OB-0002', items })).rejects.toMatchObject({ status: 403 })
    const r = await retirosService.create({ obra_id: 'OB-0001', items })
    expect(r.estado).toBe('PENDIENTE')
    expect(r.items[0].stock).toBeUndefined()
    expect((await articulosService.catalogo())[0].costo_unitario).toBeUndefined()
  })
  it('Bodega entrega: genera salidas valoradas y no permite resolver dos veces', async () => {
    const antes = db.all('cardex').length
    const r = await retirosService.entregar('SR-0001')
    expect(r.estado).toBe('ENTREGADA')
    expect(db.all('cardex')).toHaveLength(antes + 2)
    expect(db.all('cardex').at(-1)).toMatchObject({ tipo: 'SALIDA_OBRA', obra_id: 'OB-0001', referencia: 'Retiro SR-0001' })
    await expect(retirosService.entregar('SR-0001')).rejects.toMatchObject({ status: 409 })
  })
  it('es todo o nada si falta stock y el rechazo exige motivo', async () => {
    db.patch('retiros', 'SR-0002', { items: [{ articulo_id: 'ART-026', cantidad: 5 }, { articulo_id: 'ART-006', cantidad: 999 }] })
    const antes = db.all('cardex').length
    await expect(retirosService.entregar('SR-0002')).rejects.toMatchObject({ status: 422 })
    expect(db.all('cardex')).toHaveLength(antes)
    await expect(retirosService.rechazar('SR-0002', ' ')).rejects.toMatchObject({ status: 422 })
    expect((await retirosService.rechazar('SR-0002', 'Sin stock')).estado).toBe('RECHAZADA')
  })
})

describe('maestros', () => {
  it('Bodega lee proveedores y clientes; el Técnico ninguno', async () => {
    expect((await proveedoresService.list()).length).toBe(5)
    expect((await clientesService.list()).length).toBe(8)
    login(TECNICO)
    await expect(clientesService.list()).rejects.toMatchObject({ status: 403 })
  })
})

describe('presupuestos y obras (Fase 4)', () => {
  it('el catálogo del editor está disponible para quien ve presupuestos (incluso sin poder crearlos)', async () => {
    login(SUPERVISOR)
    expect((await presupuestosService.catalogoMateriales())[0].costo_unitario).toBeGreaterThan(0)
    expect((await presupuestosService.tarifas()).length).toBeGreaterThan(3)
    for (const id of [GERENCIA, 'U-006']) { // Administrador General y Consulta: solo lectura, igual ven los nombres de los artículos
      login(id)
      expect((await presupuestosService.catalogoMateriales()).length).toBeGreaterThan(30)
    }
    login(BODEGA)
    await expect(presupuestosService.catalogoMateriales()).rejects.toMatchObject({ status: 403 })
  })
  it('un presupuesto aprobado no puede respaldar dos obras', async () => {
    login(SUPERVISOR)
    await expect(obrasService.create({ nombre: 'Otra', cliente_id: 'CLI-001', tipo: 'INSTALACION', presupuesto_id: 'PRE-0001', ubicacion: { lat: -36.6, lng: -72.1 } }))
      .rejects.toMatchObject({ status: 422 })
  })
  it('regulariza una emergencia con un presupuesto aprobado libre', async () => {
    login(SUPERVISOR)
    const p = await presupuestosService.create({ cliente_id: 'CLI-002', titulo: 'Regularización', tipo_obra: 'EMERGENCIA', adicionales: [{ descripcion: 'x', monto: 100000 }], precio_venta_neto: 200000 })
    await presupuestosService.enviar(p.id)
    login(GERENCIA)
    await presupuestosService.aprobar(p.id)
    login(SUPERVISOR)
    const o = await obrasService.regularizarPresupuesto('OB-0004', p.id)
    expect(o.es_emergencia_sin_presupuesto).toBe(false)
    expect(o.cierre.checks.find((c) => c.id === 'presupuesto').ok).toBe(true)
  })
  it('el historial de la obra reúne obra, hojas y movimientos', async () => {
    login(SUPERVISOR)
    const h = await obrasService.historial('OB-0004')
    expect(h.some((l) => l.accion === 'CREAR_CU30')).toBe(true)
  })
})

describe('dashboard por rol', () => {
  it('Gerencia ve todo; Bodega solo lo suyo; Supervisor no ve el valor del inventario; Técnico no entra', async () => {
    login(GERENCIA)
    const g = await dashboardService.resumen()
    expect(g.kpis.ventaAprobada).toBeGreaterThan(0)
    expect(g.kpis.valorInventario).toBeGreaterThan(0)
    expect(g.comparativo.length).toBeGreaterThan(0)
    expect(g.actividad.length).toBeGreaterThan(0)
    expect(g.alertas.some((a) => a.tipo === 'CU30')).toBe(true)

    login(BODEGA)
    const b = await dashboardService.resumen()
    expect(b.kpis.ventaAprobada).toBeUndefined()
    expect(b.kpis.valorInventario).toBeGreaterThan(0)
    expect(b.comparativo).toBeNull()
    expect(b.actividad).toBeNull()

    login(SUPERVISOR)
    const s = await dashboardService.resumen()
    expect(s.kpis.valorInventario).toBeNull()
    expect(s.kpis.costoRealObrasActivas).toBeGreaterThan(0)

    login(TECNICO)
    await expect(dashboardService.resumen()).rejects.toMatchObject({ status: 403 })
  })
  it('alertas de vencimiento: la camioneta con revisión vencida es crítica', async () => {
    login(ADMIN)
    const a = await personalService.alertas()
    expect(a[0]).toMatchObject({ severidad: 'CRITICA', tipo: 'REVISION_TECNICA' })
    expect((await personalService.listFlota())[0].tecnico_nombre).not.toBe('—')
  })
})

describe('rol RRHH', () => {
  const RRHH = 'U-007'
  it('ve y edita personal y flota, pero nada más', async () => {
    login(RRHH)
    expect((await personalService.list()).length).toBe(16)
    expect((await personalService.listFlota()).length).toBeGreaterThanOrEqual(3)
    expect((await personalService.actualizarTarifa('T-02', 11800)).costo_hora_hombre).toBe(11800)
    await expect(obrasService.list()).rejects.toMatchObject({ status: 403 })
    await expect(presupuestosService.list()).rejects.toMatchObject({ status: 403 })
    await expect(clientesService.list()).rejects.toMatchObject({ status: 403 })
    await expect(articulosService.list()).rejects.toMatchObject({ status: 403 })
    await expect(hojasService.list()).rejects.toMatchObject({ status: 403 })
    await expect(auditoriaService.list()).rejects.toMatchObject({ status: 403 })
  })
  it('su dashboard solo trae indicadores de personal y flota', async () => {
    login(RRHH)
    const r = await dashboardService.resumen()
    expect(r.kpis).toMatchObject({ tecnicosActivos: 16, vehiculosEnTaller: 1 })
    expect(r.kpis.kmFlota).toBeGreaterThan(400000)
    expect(r.kpis.ventaAprobada).toBeUndefined()
    expect(r.kpis.valorInventario).toBeUndefined()
    expect(r.comparativo).toBeNull()
    expect(r.alertas.every((a) => ['LICENCIA', 'REVISION_TECNICA', 'SEGURO'].includes(a.tipo))).toBe(true)
  })
  it('puede cambiar un vehículo a taller y queda auditado', async () => {
    login(RRHH)
    const v = await personalService.setEstadoVehiculo('VH-02', 'EN_TALLER')
    expect(v.estado).toBe('EN_TALLER')
    login(GERENCIA)
    const [l] = await auditoriaService.list({ accion: 'ACTUALIZAR_ESTADO' })
    expect(l).toMatchObject({ entidad: 'Vehiculo', entidad_id: 'VH-02', usuario_nombre: 'Camila Torres', anterior: { estado: 'ACTIVO' }, nuevo: { estado: 'EN_TALLER' } })
    login(TECNICO)
    await expect(personalService.setEstadoVehiculo('VH-02', 'ACTIVO')).rejects.toMatchObject({ status: 403 })
  })
})

describe('kilometraje en la hoja de servicio', () => {
  const hoja = (extra = {}) => ({
    obra_id: 'OB-0001', horas_trabajadas: 5, gps: { lat: -36.6285, lng: -72.1331 },
    checklist_json: { presion_psi: 90, amperaje_a: 15, fugas: 'SIN_FUGAS', temperatura_c: -18, limpieza: 'OK' }, ...extra,
  })
  beforeEach(() => login(TECNICO))

  it('el técnico ve solo vehículos operativos, el suyo primero', async () => {
    const v = await personalService.vehiculosParaTerreno()
    expect(v[0]).toMatchObject({ id: 'VH-01', patente: 'KLRT-42', asignado: true })
    expect(v.some((x) => x.estado || x.vencimiento_revision)).toBe(false)
    expect(v.find((x) => x.patente === 'RTJK-45')).toBeUndefined() // en taller
  })
  it('rechaza regreso menor o igual a la salida, y vehículo en taller', async () => {
    await expect(hojasService.enviar(hoja({ vehiculo_id: 'VH-01', km_salida: 48250, km_regreso: 48250 }))).rejects.toMatchObject({ status: 422 })
    await expect(hojasService.enviar(hoja({ vehiculo_id: 'VH-01', km_salida: 48250, km_regreso: 48000 }))).rejects.toMatchObject({ status: 422 })
    await expect(hojasService.enviar(hoja({ vehiculo_id: 'VH-01', km_salida: 48250 }))).rejects.toMatchObject({ status: 422 })
    await expect(hojasService.enviar(hoja({ vehiculo_id: 'VH-07', km_salida: 118420, km_regreso: 118500 }))).rejects.toMatchObject({ status: 422 })
    await expect(hojasService.enviar(hoja({ vehiculo_id: 'VH-99', km_salida: 1, km_regreso: 2 }))).rejects.toMatchObject({ status: 422 })
  })
  it('sin vehículo la hoja se envía normalmente', async () => {
    const h = await hojasService.enviar(hoja())
    expect(h.vehiculo).toBeNull()
    expect(h.km_recorridos).toBeNull()
  })
  it('con vehículo actualiza el odómetro, calcula el recorrido y audita', async () => {
    const h = await hojasService.enviar(hoja({ vehiculo_id: 'VH-01', km_salida: 48250, km_regreso: 48312 }))
    expect(h.vehiculo).toMatchObject({ patente: 'KLRT-42', marca: 'Toyota' })
    expect(h.km_recorridos).toBe(62)
    expect(db.find('flota', 'VH-01').km_actual).toBe(48312)
    login(GERENCIA)
    const [l] = await auditoriaService.list({ accion: 'ACTUALIZAR_KM' })
    expect(l).toMatchObject({ entidad_id: 'VH-01', anterior: { km_actual: 48250 }, nuevo: { km_actual: 48312 } })
  })
  it('una hoja atrasada (sync offline) no hace retroceder el odómetro', async () => {
    await hojasService.enviar(hoja({ vehiculo_id: 'VH-01', km_salida: 48250, km_regreso: 48400 }))
    await hojasService.enviar(hoja({ vehiculo_id: 'VH-01', km_salida: 48300, km_regreso: 48350 }))
    expect(db.find('flota', 'VH-01').km_actual).toBe(48400)
  })
})

describe('gestión de accesos y usuarios', () => {
  const nuevo = (extra = {}) => ({ nombre: 'Andrea Poblete', rut: '760864285', cargo: 'Asistente administrativa', rol: 'ADMINISTRACION', email: 'apoblete@fyag.cl', password: 'Inicial-2026', ...extra })

  it('solo la Gerencia General entra al módulo; el resto recibe 403', async () => {
    for (const id of [ADMIN, BODEGA, SUPERVISOR, TECNICO, 'U-006', 'U-007']) {
      login(id)
      await expect(usuariosService.list()).rejects.toMatchObject({ status: 403 })
      await expect(usuariosService.create(nuevo())).rejects.toMatchObject({ status: 403 })
      await expect(usuariosService.setActivo('U-003', false)).rejects.toMatchObject({ status: 403 })
    }
    login(GERENCIA)
    expect((await usuariosService.list()).length).toBe(7)
  })

  it('crea un acceso: normaliza datos, guarda la clave cifrada y no la expone', async () => {
    login(GERENCIA)
    const u = await usuariosService.create(nuevo({ email: 'APoblete@FYAG.cl' }))
    expect(u).toMatchObject({ id: 'U-008', rut: '76.086.428-5', email: 'apoblete@fyag.cl', rol: 'ADMINISTRACION', activo: true, debe_cambiar_password: true, tiene_password: true })
    expect(JSON.stringify(u)).not.toMatch(/Inicial-2026|password_hash|password_salt/)
    const fila = db.find('usuarios', 'U-008')
    expect(fila.password_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(fila.password_hash).not.toContain('Inicial')
    expect(JSON.stringify(await usuariosService.list())).not.toMatch(/password_hash|password_salt/)
  })

  it('la misma clave produce hashes distintos por usuario (sal)', async () => {
    login(GERENCIA)
    await usuariosService.create(nuevo())
    await usuariosService.create(nuevo({ nombre: 'Pedro Rojas', rut: '12.345.678-5', email: 'projas@fyag.cl' }))
    expect(db.find('usuarios', 'U-008').password_hash).not.toBe(db.find('usuarios', 'U-009').password_hash)
  })

  it('rechaza datos inválidos con un error por campo, RUT y correo repetidos', async () => {
    login(GERENCIA)
    await expect(usuariosService.create(nuevo({ rut: '12.345.678-9', password: 'corta' }))).rejects.toMatchObject({ status: 422, detail: { rut: expect.any(String), password: expect.any(String) } })
    await expect(usuariosService.create(nuevo({ email: 'cfuentealba@fyag.cl' }))).rejects.toMatchObject({ status: 422, detail: { email: expect.stringMatching(/Ya existe/) } })
    await expect(usuariosService.create(nuevo({ rut: db.find('usuarios', 'U-001').rut }))).rejects.toMatchObject({ status: 422, detail: { rut: expect.stringMatching(/Ya existe/) } })
  })

  it('audita sin registrar contraseñas', async () => {
    login(GERENCIA)
    await usuariosService.create(nuevo())
    await usuariosService.restablecerPassword('U-008', 'Otra-Clave-77')
    await usuariosService.update('U-008', { rol: 'BODEGA' })
    const log = (await auditoriaService.list({ entidad: 'Usuario' })).map((l) => l.accion)
    expect(log).toEqual(expect.arrayContaining(['CREAR', 'RESTABLECER_CLAVE', 'CAMBIAR_ROL']))
    expect(JSON.stringify(await auditoriaService.list())).not.toMatch(/Inicial-2026|Otra-Clave|password_hash/)
    const cambio = (await auditoriaService.list({ accion: 'CAMBIAR_ROL' }))[0]
    expect(cambio).toMatchObject({ anterior: { rol: 'ADMINISTRACION' }, nuevo: { rol: 'BODEGA' }, usuario_nombre: 'Carolina Fuentealba' })
  })

  it('no permite que la Gerencia se quede sin acceso', async () => {
    login(GERENCIA)
    await expect(usuariosService.setActivo('U-001', false)).rejects.toMatchObject({ status: 409 })
    await expect(usuariosService.update('U-001', { rol: 'BODEGA' })).rejects.toMatchObject({ status: 422 })
    await usuariosService.create(nuevo({ rol: 'ADMIN_GENERAL' }))
    const perfil = (await usuariosService.perfiles()).find((p) => p.id === 'U-008')
    useAuthStore.getState().login('U-008', perfil)
    await expect(usuariosService.setActivo('U-001', false)).resolves.toMatchObject({ activo: false }) // ya hay otro administrador
    await expect(usuariosService.setActivo('U-008', false)).rejects.toMatchObject({ status: 409 }) // el último que queda
  })

  it('los accesos desactivados no aparecen para ingresar y no se puede eliminar a nadie', async () => {
    login(GERENCIA)
    await usuariosService.setActivo('U-003', false)
    expect((await usuariosService.perfiles()).some((p) => p.id === 'U-003')).toBe(false)
    expect((await usuariosService.list()).find((u) => u.id === 'U-003').activo).toBe(false)
    expect(Object.keys(usuariosService).some((k) => /remove|destroy|delete|eliminar|borrar/i.test(k))).toBe(false)
  })

  it('un acceso nuevo puede iniciar sesión como perfil y su nombre aparece en la auditoría', async () => {
    login(GERENCIA)
    const u = await usuariosService.create(nuevo({ rol: 'BODEGA', nombre: 'Sofía Reyes', rut: '12.345.678-5', email: 'sreyes@fyag.cl' }))
    const perfil = (await usuariosService.perfiles()).find((p) => p.id === u.id)
    expect(perfil).toMatchObject({ nombre: 'Sofía Reyes', rol: 'BODEGA' })
    expect(perfil.password_hash).toBeUndefined()
    useAuthStore.getState().login(perfil.id, perfil)
    const [a] = await articulosService.list()
    await cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 1, obra_id: 'OB-0001' })
    expect((await cardexService.list())[0].usuario_nombre).toBe('Sofía Reyes')
  })
})

describe('búsqueda global: el índice respeta los permisos', () => {
  const grupos = (items) => [...new Set(items.map((i) => i.grupo))].sort()

  it('Gerencia encuentra obras, personas, vehículos y usuarios', async () => {
    login(GERENCIA)
    const idx = await busquedaService.indice()
    expect(grupos(idx)).toEqual(['Artículos', 'Clientes', 'Hojas de servicio', 'Obras', 'Personal', 'Presupuestos', 'Proveedores', 'Usuarios', 'Vehículos'])
    expect(idx.find((i) => i.codigo === 'OB-0005')).toMatchObject({ grupo: 'Obras', ruta: '/erp/obras/OB-0005' })
    expect(idx.find((i) => i.titulo === 'Jorge Quezada' && i.grupo === 'Personal')).toBeTruthy()
    expect(idx.find((i) => i.codigo === 'RTJK-45')).toMatchObject({ grupo: 'Vehículos' })
  })
  it('RRHH solo ve personal y flota; Bodega no ve personas ni usuarios', async () => {
    login('U-007')
    expect(grupos(await busquedaService.indice())).toEqual(['Personal', 'Vehículos'])
    login(BODEGA)
    const b = grupos(await busquedaService.indice())
    expect(b).toEqual(expect.arrayContaining(['Artículos', 'Obras']))
    expect(b).not.toEqual(expect.arrayContaining(['Personal']))
    expect(b).not.toEqual(expect.arrayContaining(['Usuarios']))
  })
  it('solo Gerencia ve usuarios en la búsqueda, y nunca claves, tarifas ni costos', async () => {
    for (const id of [ADMIN, SUPERVISOR, 'U-006']) {
      login(id)
      expect((await busquedaService.indice()).some((i) => i.grupo === 'Usuarios')).toBe(false)
    }
    login(GERENCIA)
    const texto = JSON.stringify(await busquedaService.indice())
    expect(texto).not.toMatch(/password|costo_hora|costo_unitario|tarifa/i)
  })
  it('exige sesión', async () => {
    useAuthStore.getState().logout()
    await expect(busquedaService.indice()).rejects.toMatchObject({ status: 401 })
  })
})

describe('segregación de funciones en los servicios', () => {
  it('el Administrador General autoriza pero no ejecuta: sus escrituras operativas dan 403', async () => {
    login(GERENCIA)
    const [a] = await articulosService.list()
    await expect(cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 1, obra_id: 'OB-0001' })).rejects.toMatchObject({ status: 403 })
    await expect(articulosService.create({ sku: 'X-1', nombre: 'x', categoria: 'x', unidad: 'un', proveedor_id: 'PRV-001' })).rejects.toMatchObject({ status: 403 })
    await expect(presupuestosService.create({ cliente_id: 'CLI-001', titulo: 'x', tipo_obra: 'INSTALACION' })).rejects.toMatchObject({ status: 403 })
    await expect(obrasService.create({ nombre: 'x', cliente_id: 'CLI-001', tipo: 'EMERGENCIA', ubicacion: { lat: 1, lng: 1 } })).rejects.toMatchObject({ status: 403 })
    await expect(hojasService.aprobar('HS-0006')).rejects.toMatchObject({ status: 403 })
    await expect(personalService.actualizarTarifa('T-02', 12000)).rejects.toMatchObject({ status: 403 })
    await expect(comprasService.createFactura({ proveedor_id: 'PRV-001', numero: '1', fecha: '2026-10-01', items: [{ articulo_id: 'ART-001', cantidad: 1, precio_lista: 1 }] })).rejects.toMatchObject({ status: 403 })
    await expect(clientesService.create({ rut: '12.345.678-5', razon_social: 'x' })).rejects.toMatchObject({ status: 403 })
  })
  it('conserva lo que autoriza: aprueba presupuestos con margen bajo y finaliza obras', async () => {
    login(SUPERVISOR)
    const p = await presupuestosService.create({ cliente_id: 'CLI-001', titulo: 'Margen bajo', tipo_obra: 'MANTENCION', adicionales: [{ descripcion: 'x', monto: 100000 }], precio_venta_neto: 105000 })
    await presupuestosService.enviar(p.id)
    login(GERENCIA)
    expect((await presupuestosService.aprobar(p.id)).estado).toBe('APROBADO')
    expect((await obrasService.finalizar('OB-0007')).estado).toBe('FINALIZADA')
  })
  it('Administración (Finanzas) ya no modifica personal; RRHH sí', async () => {
    login(ADMIN)
    await expect(personalService.actualizarTarifa('T-02', 12000)).rejects.toMatchObject({ status: 403 })
    await expect(personalService.setActivo('T-02', false)).rejects.toMatchObject({ status: 403 })
    expect((await personalService.list()).length).toBe(16) // sigue pudiendo verlo
    login('U-007')
    expect((await personalService.actualizarTarifa('T-02', 12000)).costo_hora_hombre).toBe(12000)
  })
  it('Consulta no puede ejecutar ninguna escritura de servicio', async () => {
    login('U-006')
    const [a] = await articulosService.list()
    const intentos = [
      () => cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 1, obra_id: 'OB-0001' }),
      () => cardexService.reversar('MOV-000001', 'intento de prueba'),
      () => presupuestosService.create({ cliente_id: 'CLI-001', titulo: 'x', tipo_obra: 'INSTALACION' }),
      () => presupuestosService.aprobar('PRE-0007'),
      () => obrasService.finalizar('OB-0007'),
      () => hojasService.aprobar('HS-0006'),
      () => personalService.actualizarTarifa('T-02', 12000),
      () => personalService.setEstadoVehiculo('VH-01', 'EN_TALLER'),
      () => usuariosService.setActivo('U-003', false),
      () => clientesService.setActivo('CLI-001', false),
      () => retirosService.entregar('SR-0001'),
    ]
    for (const intento of intentos) await expect(intento()).rejects.toMatchObject({ status: 403 })
  })
})
