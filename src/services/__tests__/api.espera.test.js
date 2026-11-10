import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, ApiError, TIEMPO_MAX_MS, MENSAJE_TIEMPO_AGOTADO } from '../api'
import { useServerStore } from '@/stores/serverStore'

const respuesta = (status, cuerpo = {}) => ({ ok: status < 400, status, json: async () => cuerpo })
/** fetch que nunca responde y se cancela cuando el AbortController lo pide. */
const colgado = (_url, { signal }) => new Promise((_, rechazar) => signal.addEventListener('abort', () => rechazar(new DOMException('abort', 'AbortError'))))

beforeEach(() => { vi.useFakeTimers(); useServerStore.setState({ caido: false }) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('política de espera del cliente HTTP', () => {
  it('un GET se reintenta ante 503 y termina bien cuando el servidor despierta', async () => {
    const f = vi.fn().mockResolvedValueOnce(respuesta(503)).mockResolvedValueOnce(respuesta(502)).mockResolvedValueOnce(respuesta(200, { ok: 1 }))
    vi.stubGlobal('fetch', f)
    const p = api.get('/cosas/')
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(p).resolves.toEqual({ ok: 1 })
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('un POST NUNCA se reintenta solo, aunque reciba 503 (podría duplicar un registro)', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(503, { detail: 'caído' }))
    vi.stubGlobal('fetch', f)
    await expect(api.post('/cosas/', { a: 1 })).rejects.toMatchObject({ status: 503 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('un POST que supera el tiempo máximo falla con 504 y no bloquea la app', async () => {
    const f = vi.fn(colgado)
    vi.stubGlobal('fetch', f)
    const p = api.post('/ai/chat/', { mensajes: [] })
    const resultado = p.catch((e) => e)
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_MS + 100)
    const error = await resultado
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 504, code: 'timeout', message: MENSAJE_TIEMPO_AGOTADO })
    expect(f).toHaveBeenCalledTimes(1)
    expect(useServerStore.getState().caido).toBe(false)
  })

  it('un GET sin conexión agota sus reintentos y recién entonces marca el servidor como caído', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', f)
    const resultado = api.get('/cosas/').catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await resultado).toMatchObject({ status: 0 })
    expect(f).toHaveBeenCalledTimes(3)
    expect(useServerStore.getState().caido).toBe(true)
  })

  it('la petición lleva una señal de cancelación', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, {}))
    vi.stubGlobal('fetch', f)
    await api.get('/cosas/')
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})
