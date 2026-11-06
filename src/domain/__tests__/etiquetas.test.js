import { describe, it, expect } from 'vitest'
import { contenidoQr, resolverCodigo, FORMATOS_ETIQUETA as F, distribuirEtiquetas, paginasNecesarias } from '../etiquetas'

const ARTS = [{ id: 'ART-001', sku: 'REF-404A', activo: true }, { id: 'ART-002', sku: 'CU-12', activo: true }, { id: 'ART-003', sku: 'OLD-1', activo: false }]

describe('etiquetas QR: contenido y lectura', () => {
  it('el QR lleva solo el SKU (sin precio ni stock)', () => {
    expect(contenidoQr({ sku: ' REF-404A ', costo_unitario: 1, stock: 5 })).toBe('REF-404A')
  })
  it('resuelve el código sin distinguir mayúsculas y con o sin prefijo FYAG:', () => {
    expect(resolverCodigo('ref-404a', ARTS).articulo.id).toBe('ART-001')
    expect(resolverCodigo('FYAG:CU-12', ARTS).articulo.id).toBe('ART-002')
    expect(resolverCodigo('  fyag: cu-12  ', ARTS).ok).toBe(true)
  })
  it('rechaza vacío, desconocido y desactivado con un mensaje claro', () => {
    expect(resolverCodigo('', ARTS)).toMatchObject({ ok: false })
    expect(resolverCodigo(null, ARTS).ok).toBe(false)
    expect(resolverCodigo('XXX', ARTS).error).toMatch(/no corresponde/)
    expect(resolverCodigo('OLD-1', ARTS).error).toMatch(/desactivado/)
  })
})

describe('etiquetas QR: distribución en la página', () => {
  it('hoja A4 de 24: llena de izquierda a derecha y de arriba abajo, y cambia de página', () => {
    const pos = distribuirEtiquetas(F.A4_24, 26)
    expect(pos[0]).toEqual({ pagina: 0, x: 0, y: 0.5 })
    expect(pos[1]).toEqual({ pagina: 0, x: 70, y: 0.5 })
    expect(pos[3]).toEqual({ pagina: 0, x: 0, y: 37.5 })
    expect(pos[23]).toEqual({ pagina: 0, x: 140, y: 259.5 })
    expect(pos[24]).toEqual({ pagina: 1, x: 0, y: 0.5 })
  })
  it('las etiquetas caben dentro de la hoja A4', () => {
    const f = F.A4_24
    const pos = distribuirEtiquetas(f, 24)
    expect(Math.max(...pos.map((p) => p.x)) + f.etiqueta[0]).toBeLessThanOrEqual(f.pagina[0])
    expect(Math.max(...pos.map((p) => p.y)) + f.etiqueta[1]).toBeLessThanOrEqual(f.pagina[1])
  })
  it('rollo: una etiqueta por página', () => {
    expect(distribuirEtiquetas(F.ROLLO_50x30, 3).map((p) => p.pagina)).toEqual([0, 1, 2])
    expect(paginasNecesarias(F.ROLLO_50x30, 3)).toBe(3)
    expect(paginasNecesarias(F.A4_24, 25)).toBe(2)
    expect(paginasNecesarias(F.A4_24, 0)).toBe(1)
  })
  it('el QR cabe en la etiqueta', () => {
    for (const f of Object.values(F)) expect(f.qr + 2).toBeLessThanOrEqual(Math.min(...f.etiqueta))
  })
})
