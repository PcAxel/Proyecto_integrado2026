import { describe, it, expect } from 'vitest'
import { planDeAcciones, resumenDePlan, resolverAccion } from '../agente'
import { ERP_NAV } from '@/layouts/nav'
import { can } from '@/domain/rbac'
import { useBusquedaStore } from '@/stores/busquedaStore'

const CATALOGO = [
  { ruta: '/erp', label: 'Inicio', buscable: false },
  { ruta: '/erp/bodega', label: 'Bodega y Cardex', buscable: true },
  { ruta: '/erp/compras', label: 'Compras', buscable: false },
  { ruta: '/erp/maestros', label: 'Clientes y Proveedores', buscable: true },
  { ruta: '/erp/cumplimiento', label: 'Cumplimiento y Rotación', buscable: false },
]
const RELLENAR = { tipo: 'FILL_FORM', formulario: 'cliente-nuevo', ruta: '/erp/maestros', abrir: 'btn-nuevo-cliente', confirmar: 'btn-guardar-maestro', nombre: 'Nuevo cliente', campos: { razon_social: 'Agrícola Demo SpA', rut: '76.543.210-3', activo: 'false', giro: '' } }

describe('plan de acciones del copiloto (validación en el cliente)', () => {
  it('navegar y buscar se funden en una búsqueda con su URL', () => {
    const plan = planDeAcciones([{ tipo: 'NAVIGATE', ruta: '/erp/bodega', etiqueta: 'Bodega' }, { tipo: 'SEARCH_OR_FILTER', ruta: '/erp/bodega', texto: 'compresor bitzer' }], CATALOGO, 'SUPERVISOR')
    expect(plan).toEqual([{ tipo: 'SEARCH_OR_FILTER', url: '/erp/bodega?buscar=compresor%20bitzer', texto: 'compresor bitzer', objetivo: 'search-input', etiqueta: 'Bodega y Cardex' }])
    expect(resumenDePlan(plan)).toBe('Busqué «compresor bitzer» en Bodega y Cardex')
  })
  it('descarta pantallas fuera del catálogo de la persona y búsquedas donde no se filtra', () => {
    expect(planDeAcciones([{ tipo: 'NAVIGATE', ruta: '/erp/usuarios' }, { tipo: 'SEARCH_OR_FILTER', ruta: '/erp/compras', texto: 'x' }, { tipo: 'NAVIGATE', ruta: 'https://malo.cl' }, { tipo: 'BORRAR_TODO' }, null], CATALOGO, 'SUPERVISOR')).toEqual([])
    expect(planDeAcciones(undefined, CATALOGO, 'SUPERVISOR')).toEqual([])
  })
  it('el buscador general se abre con el texto, solo para quien tiene el ERP completo', () => {
    const plan = planDeAcciones([{ tipo: 'GLOBAL_SEARCH', texto: '  Vargas \n', objetivo: 'search-input' }], CATALOGO, 'RRHH')
    expect(plan).toEqual([{ tipo: 'GLOBAL_SEARCH', texto: 'Vargas', objetivo: 'search-input' }])
    expect(resumenDePlan(plan)).toBe('Busqué «Vargas» en el buscador general')
    expect(planDeAcciones([{ tipo: 'GLOBAL_SEARCH', texto: '   ' }], CATALOGO, 'RRHH')).toEqual([])
    expect(planDeAcciones([{ tipo: 'GLOBAL_SEARCH', texto: 'Vargas' }], [{ ruta: '/app', label: 'Inicio' }], 'TECNICO')).toEqual([]) // el técnico no tiene buscador general
    expect(planDeAcciones([{ tipo: 'GLOBAL_SEARCH', texto: 'x'.repeat(300) }], CATALOGO, 'RRHH')[0].texto).toHaveLength(80)
  })
  it('el almacén del buscador abre con el texto de la IA y se limpia al cerrar o alternar', () => {
    const s = useBusquedaStore.getState()
    s.abrir('Vargas')
    expect(useBusquedaStore.getState()).toMatchObject({ abierta: true, consulta: 'Vargas' })
    useBusquedaStore.getState().cerrar()
    expect(useBusquedaStore.getState()).toMatchObject({ abierta: false, consulta: '' })
    useBusquedaStore.getState().alternar()
    expect(useBusquedaStore.getState()).toMatchObject({ abierta: true, consulta: '' })
    useBusquedaStore.getState().alternar()
    expect(useBusquedaStore.getState().abierta).toBe(false)
  })
  it('resaltar exige una pantalla propia y un identificador simple', () => {
    const ok = planDeAcciones([{ tipo: 'HIGHLIGHT_ELEMENT', ruta: '/erp/cumplimiento', objetivo: 'semaforo-plazo-fijo', descripcion: 'el semáforo' }], CATALOGO, 'RRHH')
    expect(ok).toEqual([{ tipo: 'HIGHLIGHT_ELEMENT', url: '/erp/cumplimiento', objetivo: 'semaforo-plazo-fijo', descripcion: 'el semáforo', etiqueta: 'Cumplimiento y Rotación' }])
    expect(planDeAcciones([{ tipo: 'HIGHLIGHT_ELEMENT', ruta: '/erp/cumplimiento', objetivo: '"] , body *' }], CATALOGO, 'RRHH')).toEqual([])
    expect(planDeAcciones([{ tipo: 'HIGHLIGHT_ELEMENT', ruta: '/erp/sistema', objetivo: 'servicios-sistema' }], CATALOGO, 'RRHH')).toEqual([])
  })
  it('rellenar solo con permiso, solo campos conocidos y sin valores vacíos', () => {
    const [p] = planDeAcciones([RELLENAR], CATALOGO, 'COMERCIAL')
    expect(p.campos).toEqual({ razon_social: 'Agrícola Demo SpA', rut: '76.543.210-3' })
    expect((({ tipo, url, abrir, confirmar }) => ({ tipo, url, abrir, confirmar }))(p)).toEqual({ tipo: 'FILL_FORM', url: '/erp/maestros', abrir: 'btn-nuevo-cliente', confirmar: 'btn-guardar-maestro' })
    expect(resumenDePlan([p])).toBe('Completé «Nuevo cliente» (falta que lo confirmes)')
    expect(planDeAcciones([RELLENAR], CATALOGO, 'SUPERVISOR')).toEqual([])                                    // Operaciones no gestiona clientes
    expect(planDeAcciones([{ ...RELLENAR, formulario: 'usuario-nuevo' }], CATALOGO, 'COMERCIAL')).toEqual([]) // formulario desconocido
    expect(planDeAcciones([{ ...RELLENAR, confirmar: 'x" onclick="' }], CATALOGO, 'COMERCIAL')).toEqual([])
  })
  it('la navegación usa la URL que ya validó resolverAccion (p. ej. la de facturación)', () => {
    const catalogo = [...CATALOGO, { ruta: '/erp/obras', label: 'Obras', buscable: true }]
    const r = { accion: 'navegar', ruta: '/erp/obras/OB-0003', ancla: 'facturacion' }
    const accion = resolverAccion(r, catalogo, 'ADMINISTRACION')
    expect(planDeAcciones([{ tipo: 'NAVIGATE', ruta: '/erp/obras/OB-0003' }], catalogo, 'ADMINISTRACION', accion)).toEqual([{ tipo: 'NAVIGATE', url: '/erp/obras/OB-0003?facturar=1', etiqueta: 'la obra OB-0003' }])
    expect(planDeAcciones([{ tipo: 'NAVIGATE', ruta: '/erp/obras/OB-0003' }], catalogo, 'SUPERVISOR', resolverAccion(r, catalogo, 'SUPERVISOR'))).toEqual([]) // sin permiso de emitir no hay atajo
  })
})

describe('Gobernanza IA en el menú', () => {
  const menu = (rol) => ERP_NAV.filter((i) => can(rol, i.accion)).map((i) => i.to)
  it('la ven TI y la Gerencia General; solo TI la administra', () => {
    for (const rol of ['SUPER_ADMIN', 'ADMIN_GENERAL']) expect(menu(rol)).toContain('/erp/gobernanza-ia')
    for (const rol of ['ADMINISTRACION', 'SUPERVISOR', 'RRHH', 'COMERCIAL', 'CONSULTA', 'TECNICO']) expect(menu(rol)).not.toContain('/erp/gobernanza-ia')
    expect([can('SUPER_ADMIN', 'gobernanza_ia.gestionar'), can('ADMIN_GENERAL', 'gobernanza_ia.gestionar')]).toEqual([true, false])
  })
})
