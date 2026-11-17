import { describe, expect, it } from 'vitest'
import { pasosDeGuia } from '../guiaCursor'

describe('pasosDeGuia', () => {
  it('una sección del menú', () => {
    expect(pasosDeGuia('/erp/bodega')).toEqual({ seccion: '/erp/bodega', ruta: '/erp/bodega', consulta: '', esDetalle: false })
  })
  it('una sección con filtro de búsqueda', () => {
    expect(pasosDeGuia('/erp/personal?buscar=Juan')).toEqual({ seccion: '/erp/personal', ruta: '/erp/personal', consulta: 'buscar=Juan', esDetalle: false })
  })
  it('el detalle de una obra: primero la sección, luego la obra', () => {
    expect(pasosDeGuia('/erp/obras/OB-0003?facturar=1')).toEqual({ seccion: '/erp/obras', ruta: '/erp/obras/OB-0003', consulta: 'facturar=1', esDetalle: true })
  })
  it('rutas que no son del ERP no tienen guía (se navega directo)', () => {
    for (const u of ['/app/hoja-servicio', '/login', '', undefined, null, '/erp/obras/OB-1/extra/mas', 'https://malo.cl']) expect(pasosDeGuia(u).seccion).toBeNull()
  })
})
