import { describe, it, expect } from 'vitest'
import { createSeed } from '../seed.js'
import { calcularStock } from '@/domain/cardex'
import { simularRentabilidad } from '@/domain/rentabilidad'

describe('seed', () => {
  const s = createSeed()
  it('cumple los volúmenes pedidos', () => {
    expect(s.personal).toHaveLength(16)
    expect(s.clientes).toHaveLength(8)
    expect(s.proveedores).toHaveLength(5)
    expect(s.articulos.length).toBeGreaterThanOrEqual(30)
    expect(s.cardex.some((m) => m.tipo === 'REVERSA')).toBe(true)
    expect(s.cardex.some((m) => m.tipo === 'REINGRESO_SOBRANTE')).toBe(true)
    expect(s.obras.filter((o) => o.es_emergencia_sin_presupuesto)).toHaveLength(2)
  })
  it('no deja stock negativo y mantiene un presupuesto en rojo', () => {
    expect(s.articulos.every((a) => calcularStock(s.cardex, a.id) >= 0)).toBe(true)
    const p = s.presupuestos.find((x) => x.estado === 'BORRADOR')
    expect(simularRentabilidad(p).semaforo).toBe('ROJO')
  })
  it('la flota es coherente con el kilometraje de las hojas', () => {
    expect(s.flota.length).toBeGreaterThanOrEqual(3)
    expect(s.flota.some((v) => v.patente === 'RTJK-45' && v.estado === 'EN_TALLER')).toBe(true)
    for (const v of s.flota) {
      const hojas = s.hojas.filter((h) => h.vehiculo_id === v.id).sort((a, b) => a.fecha.localeCompare(b.fecha))
      expect(hojas.every((h) => h.km_regreso > h.km_salida)).toBe(true)
      hojas.slice(1).forEach((h, i) => expect(h.km_salida).toBe(hojas[i].km_regreso))
      if (hojas.length) expect(hojas.at(-1).km_regreso).toBe(v.km_actual)
    }
  })
  it('db.reset restaura el seed aunque se haya mutado antes', () => {
    const a = createSeed()
    a.flota[0].km_actual = 1
    expect(createSeed().flota[0].km_actual).toBe(48250)
  })
  it('trae los usuarios con acceso, con RUT válido y sin duplicados', async () => {
    const { validarRut } = await import('@/domain/rut')
    expect(s.usuarios).toHaveLength(7)
    expect(s.usuarios.every((u) => validarRut(u.rut) && u.activo)).toBe(true)
    expect(new Set(s.usuarios.map((u) => u.rut)).size).toBe(7)
    expect(new Set(s.usuarios.map((u) => u.email)).size).toBe(7)
    expect(s.usuarios.filter((u) => u.rol === 'ADMIN_GENERAL')).toHaveLength(1)
    expect(s.usuarios.find((u) => u.id === 'U-005').rut).toBe(s.personal[0].rut)
    expect(s.usuarios.some((u) => 'password_hash' in u)).toBe(false)
  })
})
