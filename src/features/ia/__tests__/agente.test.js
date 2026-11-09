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
