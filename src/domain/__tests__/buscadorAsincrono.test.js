import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { crearBuscador } from '../buscadorAsincrono'

describe('buscador asíncrono', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const armar = (buscar) => {
    const eco = { resultados: [], cargando: [], errores: [] }
    const b = crearBuscador({ buscar, esperaMs: 250, alCargar: (c) => eco.cargando.push(c), alResultado: (r) => eco.resultados.push(r), alError: (e) => eco.errores.push(e.message) })
    return { b, eco }
  }

  it('espera a que se deje de escribir: tres teclas seguidas hacen UNA consulta', async () => {
    const buscar = vi.fn(async (t) => [t])
    const { b, eco } = armar(buscar)
    b.consultar('c'); await vi.advanceTimersByTimeAsync(100)
    b.consultar('co'); await vi.advanceTimersByTimeAsync(100)
    b.consultar('com')
    await vi.advanceTimersByTimeAsync(300)
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(buscar).toHaveBeenCalledWith('com')
    expect(eco.resultados).toEqual([['com']])
    expect(eco.cargando.at(-1)).toBe(false)
  })

  it('descarta una respuesta vieja que llega después de una más nueva', async () => {
    const lento = new Promise((r) => setTimeout(() => r(['viejo']), 1000))
    const buscar = vi.fn((t) => (t === 'a' ? lento : Promise.resolve(['nuevo'])))
    const { b, eco } = armar(buscar)
    b.consultar('a'); await vi.advanceTimersByTimeAsync(260) // sale la consulta lenta
    b.consultar('ab'); await vi.advanceTimersByTimeAsync(260) // sale la nueva y responde primero
    await vi.advanceTimersByTimeAsync(2000)
    expect(eco.resultados).toEqual([['nuevo']]) // «viejo» nunca se muestra
  })

  it('al abrir el campo consulta de inmediato y los errores se informan sin quedarse cargando', async () => {
    const { b, eco } = armar(async () => { throw new Error('sin conexión') })
    b.consultar('', { inmediato: true })
    await vi.advanceTimersByTimeAsync(5)
    expect(eco.errores).toEqual(['sin conexión'])
    expect(eco.cargando.at(-1)).toBe(false)
  })

  it('cancelar impide que una respuesta en camino llegue a la pantalla', async () => {
    const { b, eco } = armar(() => new Promise((r) => setTimeout(() => r(['x']), 500))) // el servidor tarda
    b.consultar('x'); await vi.advanceTimersByTimeAsync(260) // la consulta ya salió
    b.cancelar()
    await vi.advanceTimersByTimeAsync(1000)
    expect(eco.resultados).toEqual([])
  })
})
