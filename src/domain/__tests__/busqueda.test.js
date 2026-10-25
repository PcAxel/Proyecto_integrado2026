import { describe, it, expect } from 'vitest'
import { normalizar, puntuar, buscar, aplanar, moverSeleccion } from '../busqueda.js'

const items = [
  { id: 'r1', grupo: 'Navegación', titulo: 'Dashboard', keywords: ['inicio'], ruta: '/erp' },
  { id: 'r2', grupo: 'Navegación', titulo: 'Personal y Flota', keywords: ['empleados', 'vehiculos'], ruta: '/erp/personal' },
  { id: 'r3', grupo: 'Navegación', titulo: 'Obras', ruta: '/erp/obras' },
  { id: 'o5', grupo: 'Obras', codigo: 'OB-0005', titulo: 'Garantía: evaporador con ruido anormal', subtitulo: 'Carnes Selectas Chillán SpA · En curso', ruta: '/erp/obras/OB-0005' },
  { id: 'o4', grupo: 'Obras', codigo: 'OB-0004', titulo: 'Emergencia: falla de compresor', subtitulo: 'Frutícola Río Ñuble SpA', ruta: '/erp/obras/OB-0004' },
  { id: 'p1', grupo: 'Personal', codigo: 'T-01', titulo: 'Jorge Quezada', subtitulo: 'Técnico Frigorista Senior', keywords: ['15.387.421-2'], ruta: '/erp/personal' },
  { id: 'v7', grupo: 'Vehículos', codigo: 'RTJK-45', titulo: 'RTJK-45 · Mitsubishi L200 Katana', subtitulo: 'En taller', ruta: '/erp/personal?tab=flota' },
]

describe('normalizar', () => {
  it('quita tildes y mayúsculas', () => expect(normalizar('  Señor ÑANDÚ  ')).toBe('senor nandu'))
  it('tolera valores vacíos', () => expect(normalizar(undefined)).toBe(''))
})

describe('puntuar', () => {
  it('el código exacto gana a cualquier otra coincidencia, con o sin guion y en cualquier caso', () => {
    for (const q of ['OB-0005', 'ob-0005', 'ob0005', 'OB 0005']) expect(puntuar(items[3], q)).toBeGreaterThanOrEqual(100)
    expect(puntuar(items[3], 'OB-0004')).toBe(0)
  })
  it('exige que aparezcan todas las palabras', () => {
    expect(puntuar(items[3], 'evaporador ruido')).toBeGreaterThan(0)
    expect(puntuar(items[3], 'evaporador compresor')).toBe(0)
  })
  it('ignora tildes: "garantia" encuentra "Garantía"', () => expect(puntuar(items[3], 'garantia')).toBeGreaterThan(0))
  it('no une el final de una palabra con el comienzo de la siguiente', () => {
    const proveedor = { id: 'p', grupo: 'Proveedores', titulo: 'Distribuidora Frigotec Ltda.', subtitulo: 'Concepción · Sergio Bravo', ruta: '/' }
    expect(puntuar(proveedor, 'obra')).toBe(0)
    expect(puntuar(proveedor, 'sergio bravo')).toBeGreaterThan(0)
  })
  it('busca también en subtítulo y palabras clave (cliente, RUT, sinónimos)', () => {
    expect(puntuar(items[3], 'carnes selectas')).toBeGreaterThan(0)
    expect(puntuar(items[5], '15387421')).toBeGreaterThan(0)
    expect(puntuar(items[1], 'empleados')).toBeGreaterThan(0)
  })
  it('pondera: comienzo del título > palabra interna > subtítulo', () => {
    expect(puntuar(items[1], 'personal')).toBeGreaterThan(puntuar(items[1], 'flota'))
    expect(puntuar(items[1], 'flota')).toBeGreaterThan(puntuar(items[1], 'vehiculos'))
  })
})

describe('buscar', () => {
  it('sin consulta lista todas las rutas, en el orden de los grupos', () => {
    const g = buscar(items, '')
    expect(g[0].grupo).toBe('Navegación')
    expect(g[0].items).toHaveLength(3)
  })
  it('encuentra una obra por su código y una persona por su nombre', () => {
    expect(aplanar(buscar(items, 'OB-0005'))[0].id).toBe('o5')
    expect(aplanar(buscar(items, 'quezada'))[0].id).toBe('p1')
    expect(aplanar(buscar(items, 'rtjk45'))[0].id).toBe('v7')
  })
  it('pone primero el grupo con la mejor coincidencia', () => {
    expect(buscar(items, 'ob-0005')[0].grupo).toBe('Obras')
    expect(buscar(items, 'dashboard')[0].grupo).toBe('Navegación')
  })
  it('sin coincidencias devuelve vacío y limita por grupo', () => {
    expect(buscar(items, 'zzzz')).toEqual([])
    const muchos = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, grupo: 'Obras', codigo: `OB-${i}`, titulo: `Obra ${i}`, ruta: '/' }))
    expect(buscar(muchos, 'obra', { limitePorGrupo: 5 })[0].items).toHaveLength(5)
  })
})

describe('moverSeleccion', () => {
  it('da la vuelta en ambos extremos', () => {
    expect(moverSeleccion(0, -1, 4)).toBe(3)
    expect(moverSeleccion(3, 1, 4)).toBe(0)
    expect(moverSeleccion(1, 1, 4)).toBe(2)
    expect(moverSeleccion(0, 1, 0)).toBe(0)
  })
})
