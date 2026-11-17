import { describe, it, expect } from 'vitest'
import { normalizar, filtrarOpciones, prepararOpciones } from '../combobox'

const catalogo = prepararOpciones([
  { value: 'A1', label: 'REF-404A · Refrigerante R404A cilindro 10,9 kg' },
  { value: 'A2', label: 'CMP-SCR3 · Compresor scroll 3 HP' },
  { value: 'A3', label: 'CMP-5HP · Compresor semihermético 5 HP' },
  { value: 'A4', label: 'VAL-001 · Válvula solenoide 1/2"', detail: 'Válvulas' },
  { value: 'A5', label: 'ZZZ-1 · Repuesto del compresor viejo' },
])

describe('filtrarOpciones', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizar('  VÁLVULA Solenoide ')).toBe('valvula solenoide')
    expect(filtrarOpciones(catalogo, 'valvula').items.map((o) => o.value)).toEqual(['A4'])
  })
  it('exige todas las palabras, en cualquier orden', () => {
    expect(filtrarOpciones(catalogo, 'compresor 5').items.map((o) => o.value)).toEqual(['A3'])
    expect(filtrarOpciones(catalogo, '5hp compresor').items.map((o) => o.value)).toEqual(['A3'])
    expect(filtrarOpciones(catalogo, 'compresor xyz').total).toBe(0)
  })
  it('un SKU escrito gana a los nombres que solo lo mencionan', () => {
    const r = filtrarOpciones(catalogo, 'cmp')
    expect(r.items.map((o) => o.value)).toEqual(['A2', 'A3'])
    expect(filtrarOpciones(catalogo, 'compresor').items[0].value).toBe('A2') // empieza el nombre, no el SKU: conserva el orden del catálogo
  })
  it('sin texto devuelve el comienzo del catálogo', () => {
    expect(filtrarOpciones(catalogo, '', 2)).toMatchObject({ total: 5, items: [{ value: 'A1' }, { value: 'A2' }] })
  })
  it('con miles de artículos limita lo que se dibuja pero informa el total', () => {
    const miles = prepararOpciones(Array.from({ length: 5000 }, (_, i) => ({ value: `P${i}`, label: `SKU-${String(i).padStart(4, '0')} · Producto ${i}` })))
    const t0 = performance.now()
    const r = filtrarOpciones(miles, 'producto 1')
    expect(performance.now() - t0).toBeLessThan(200)
    expect(r.items).toHaveLength(50)
    expect(r.total).toBeGreaterThan(50)
    expect(filtrarOpciones(miles, 'sku-4999').items.map((o) => o.value)).toEqual(['P4999'])
  })
})
