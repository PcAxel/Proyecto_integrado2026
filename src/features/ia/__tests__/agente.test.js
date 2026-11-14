import { describe, it, expect } from 'vitest'
import { catalogoDeRutas, resolverAccion } from '../agente'

const admin = { rol: 'ADMIN_GENERAL', rolApi: 'ADMIN' }
const rrhh = { rol: 'RRHH', rolApi: 'RRHH' }
const tecnico = { rol: 'TECNICO', rolApi: 'TECNICO' }

describe('catálogo de pantallas del agente', () => {
  it('cada rol solo recibe lo que ya puede abrir', () => {
    const rutas = (u) => catalogoDeRutas(u).map((r) => r.ruta)
    expect(rutas(admin)).toContain('/erp/obras')
    expect(rutas(rrhh)).toContain('/erp/rrhh')
    expect(rutas(rrhh)).not.toContain('/erp/presupuestos')
    expect(rutas(tecnico).every((r) => r.startsWith('/app'))).toBe(true)
    expect(rutas(tecnico)).not.toContain('/erp/obras')
  })
  it('marca qué pantallas admiten búsqueda', () => {
    const c = Object.fromEntries(catalogoDeRutas(admin).map((r) => [r.ruta, r.buscable]))
    expect(c['/erp/obras']).toBe(true)
    expect(c['/erp/compras']).toBe(false)
  })
  it('sin usuario no hay pantallas', () => expect(catalogoDeRutas(null)).toEqual([]))
})

describe('resolverAccion', () => {
  const cat = catalogoDeRutas(admin)
  it('navegar lleva a la ruta del catálogo', () => {
    expect(resolverAccion({ accion: 'navegar', ruta: '/erp/obras', termino_busqueda: null }, cat)).toMatchObject({ url: '/erp/obras', busqueda: null })
  })
  it('buscar inyecta el término codificado en la URL', () => {
    const r = resolverAccion({ accion: 'buscar', ruta: '/erp/personal', termino_busqueda: 'Juan Pérez & Cía' }, cat)
    expect(r.url).toBe('/erp/personal?buscar=Juan%20P%C3%A9rez%20%26%20C%C3%ADa')
    expect(r.busqueda).toBe('Juan Pérez & Cía')
  })
  it('en una pantalla sin filtro, buscar se vuelve navegar', () => {
    expect(resolverAccion({ accion: 'buscar', ruta: '/erp/compras', termino_busqueda: 'x' }, cat).url).toBe('/erp/compras')
  })
  it('rechaza rutas fuera del catálogo, externas o con parámetros ocultos', () => {
    for (const ruta of ['/erp/usuarios?nuevo=1', 'https://malo.cl', '//malo.cl', '/admin', '/erp/obras/../usuarios', undefined]) {
      expect(resolverAccion({ accion: 'navegar', ruta }, catalogoDeRutas(rrhh))).toBeNull()
    }
  })
  it('un Técnico no puede ser llevado al ERP aunque el modelo lo pida', () => {
    expect(resolverAccion({ accion: 'navegar', ruta: '/erp/obras' }, catalogoDeRutas(tecnico))).toBeNull()
  })
  it('acciones desconocidas o «ninguna» no hacen nada', () => {
    for (const accion of ['ninguna', 'eliminar', 'crear', '', undefined]) expect(resolverAccion({ accion, ruta: '/erp/obras' }, cat)).toBeNull()
  })
})


describe('llevar a facturar (la IA nunca emite)', () => {
  const finanzas = 'ADMINISTRACION'
  const resp = (extra = {}) => ({ accion: 'navegar', ruta: '/erp/obras/OB-0003', ancla: 'facturacion', ...extra })
  it('Administrador y Finanzas llegan a la obra con la marca para bajar hasta la tarjeta', () => {
    for (const rol of ['ADMIN_GENERAL', finanzas]) {
      expect(resolverAccion(resp(), [], rol)).toEqual({ url: '/erp/obras/OB-0003?facturar=1', etiqueta: 'la obra OB-0003', busqueda: null, ancla: 'facturacion' })
    }
  })
  it('cualquier otro rol queda fuera aunque el servidor lo pidiera', () => {
    for (const rol of ['SUPERVISOR', 'BODEGA', 'RRHH', 'TECNICO', 'CONSULTA', undefined]) expect(resolverAccion(resp(), [], rol)).toBeNull()
  })
  it('solo acepta una obra con ancla de facturación: nada de rutas libres ni parámetros ocultos', () => {
    for (const ruta of ['/erp/usuarios', '/erp/obras/OB-0003?x=1', '/erp/obras/OB-0003/../usuarios', '/erp/obras/otra', 'https://malo.cl/erp/obras/OB-0003', '/erp/obras/OB-', '//erp/obras/OB-0003']) {
      expect(resolverAccion(resp({ ruta }), [], 'ADMIN_GENERAL'), ruta).toBeNull()
    }
    expect(resolverAccion(resp({ ancla: 'otra' }), [], 'ADMIN_GENERAL')).toBeNull()
    expect(resolverAccion(resp({ accion: 'buscar' }), [], 'ADMIN_GENERAL')).toBeNull()
  })
  it('el texto de la etiqueta no viene del servidor (no se puede inyectar)', () => {
    expect(resolverAccion(resp({ etiqueta: '<img src=x onerror=alert(1)>' }), [], 'ADMIN_GENERAL').etiqueta).toBe('la obra OB-0003')
  })
})
