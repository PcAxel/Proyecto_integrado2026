import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/mocks/db'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { configureHttp, enviarOEncolar, procesarCola, descartarDeCola, hojasService, retirosService } from '@/services'

const hoja = (extra = {}) => ({
  obra_id: 'OB-0001', horas_trabajadas: 3, gps: { lat: -36.6285, lng: -72.1331 },
  checklist_json: { presion_psi: 90, amperaje_a: 15, fugas: 'SIN_FUGAS', temperatura_c: -18, limpieza: 'OK' }, ...extra,
})

beforeEach(async () => {
  configureHttp({ minMs: 0, maxMs: 0, failRate: 0 })
  await db.reset()
  useAuthStore.getState().login('U-005')
  useSyncStore.setState({ online: true, pendientes: [], sincronizando: false })
  await procesarCola()
})

describe('cola offline', () => {
  it('sin señal encola, y al reconectar envía y descuenta el pendiente de la obra', async () => {
    useSyncStore.getState().setOnline(false)
    const antes = db.all('hojas').length
    const r = await enviarOEncolar('HOJA', hoja(), { obra_nombre: 'Cámara 3' })
    expect(r.encolado).toBe(true)
    expect(db.all('hojas')).toHaveLength(antes)
    expect(useSyncStore.getState().pendientes).toHaveLength(1)

    const pendBefore = db.find('obras', 'OB-0001').pendientes_sync
    useSyncStore.getState().setOnline(true)
    const res = await procesarCola()
    expect(res).toMatchObject({ enviados: 1, errores: 0, pendientes: 0 })
    expect(db.all('hojas')).toHaveLength(antes + 1)
    expect(db.find('obras', 'OB-0001').pendientes_sync).toBe(pendBefore - 1)
    expect(useSyncStore.getState().ultimoSync).not.toBeNull()
  })

  it('un reintento con el mismo client_id no duplica la hoja', async () => {
    const payload = hoja({ client_id: 'C-fijo' })
    await hojasService.enviar(payload)
    const n = db.all('hojas').length
    await hojasService.enviar(payload)
    expect(db.all('hojas')).toHaveLength(n)
  })

  it('un rechazo 4xx no se encola al enviar online, pero sí queda en ERROR si venía de la cola', async () => {
    await expect(enviarOEncolar('HOJA', hoja({ horas_trabajadas: 0 }))).rejects.toMatchObject({ status: 422 })
    expect(useSyncStore.getState().pendientes).toHaveLength(0)

    useSyncStore.getState().setOnline(false)
    await enviarOEncolar('HOJA', hoja({ horas_trabajadas: 0 }))
    useSyncStore.getState().setOnline(true)
    const res = await procesarCola()
    expect(res).toMatchObject({ enviados: 0, errores: 1 })
    const [it] = useSyncStore.getState().pendientes
    expect(it.estado).toBe('ERROR')
    expect(await descartarDeCola(it.id)).toBe(true)
    expect(useSyncStore.getState().pendientes).toHaveLength(0)
  })

  it('un fallo de red deja el ítem pendiente y corta el procesamiento', async () => {
    useSyncStore.getState().setOnline(false)
    await enviarOEncolar('RETIRO', { obra_id: 'OB-0001', items: [{ articulo_id: 'ART-026', cantidad: 1 }] })
    useSyncStore.getState().setOnline(true)
    configureHttp({ failRate: 1 })
    const res = await procesarCola()
    expect(res).toMatchObject({ enviados: 0, pendientes: 1 })
    configureHttp({ failRate: 0 })
    expect((await procesarCola()).enviados).toBe(1)
    expect((await retirosService.list()).some((r) => r.obra_id === 'OB-0001')).toBe(true)
  })
})
