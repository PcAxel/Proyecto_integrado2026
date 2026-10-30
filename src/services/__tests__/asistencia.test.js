import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/mocks/db'
import { useAuthStore } from '@/stores/authStore'
import { configureHttp, asistenciaService, auditoriaService } from '@/services'

const login = (id) => useAuthStore.getState().login(id)
const TECNICO = 'U-005' // Jorge Quezada (T-01)
const SUPERVISOR = 'U-004'
const RRHH = 'U-007'
const BODEGA = 'U-003'
const GPS = { lat: -36.4243, lng: -71.9582 }

const aLas = (hora) => vi.setSystemTime(new Date(`2026-10-30T${hora}:00`))

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  aLas('09:00')
  configureHttp({ minMs: 0, maxMs: 0, failRate: 0 })
  await db.reset()
  login(TECNICO)
})
afterEach(() => vi.useRealTimers())

describe('reloj control: marcas del técnico', () => {
  it('parte sin marcas y registra entrada con hora y coordenadas', async () => {
    expect((await asistenciaService.miDia()).marcas).toEqual([])
    const m = await asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS, capturado_en: '2026-10-30T09:00:00', obra_id: 'OB-0004' })
    expect(m).toMatchObject({ tipo: 'ENTRADA', fecha: '2026-10-30T09:00:00', lat: GPS.lat, tecnico_id: 'T-01' })
    expect(m.geocerca.dentro).toBe(true)
    expect((await asistenciaService.miDia()).marcas).toHaveLength(1)
  })

  it('rechaza una entrada repetida con el mensaje de acción inválida', async () => {
    await asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS })
    await expect(asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS })).rejects.toMatchObject({
      status: 409, message: 'Acción inválida: Ya registraste tu entrada. Debes marcar salida.',
    })
  })

  it('rechaza salida sin entrada y salida repetida', async () => {
    await expect(asistenciaService.marcar({ tipo: 'SALIDA', ...GPS })).rejects.toMatchObject({ status: 409 })
    await asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS })
    await asistenciaService.marcar({ tipo: 'SALIDA', ...GPS })
    await expect(asistenciaService.marcar({ tipo: 'SALIDA', ...GPS })).rejects.toMatchObject({ message: 'Acción inválida: Ya registraste tu salida. Debes marcar entrada.' })
  })

  it('es idempotente por client_id (reintento de la cola)', async () => {
    const a = await asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS, client_id: 'C-1' })
    const b = await asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS, client_id: 'C-1' })
    expect(b.id).toBe(a.id)
    expect((await asistenciaService.miDia()).marcas).toHaveLength(1)
  })

  it('exige ubicación, rechaza horas futuras y obras ajenas', async () => {
    await expect(asistenciaService.marcar({ tipo: 'ENTRADA' })).rejects.toMatchObject({ status: 422 })
    await expect(asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS, capturado_en: '2026-10-30T11:00:00' })).rejects.toMatchObject({ status: 422 })
    await expect(asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS, obra_id: 'OB-0003' })).rejects.toMatchObject({ status: 403 })
  })

  it('cada marca queda en la auditoría', async () => {
    await asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS })
    login('U-001')
    const log = await auditoriaService.list({ entidad: 'Asistencia' })
    expect(log.map((l) => l.accion)).toEqual(['MARCAR_ENTRADA'])
  })

  it('solo el técnico marca y solo RRHH y Gerencia ven el panel', async () => {
    login(BODEGA)
    await expect(asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS })).rejects.toMatchObject({ status: 403 })
    await expect(asistenciaService.hoy()).rejects.toMatchObject({ status: 403 })
    login(TECNICO)
    await expect(asistenciaService.hoy()).rejects.toMatchObject({ status: 403 })
    login(SUPERVISOR)
    await expect(asistenciaService.hoy()).rejects.toMatchObject({ status: 403 })
  })
})

describe('reloj control: asistencia de hoy para RRHH', () => {
  const fila = (lista, id) => lista.find((f) => f.tecnico_id === id)

  it('distingue en jornada, pendiente y atraso, con la hora exacta de marcaje', async () => {
    login(RRHH)
    const lista = await asistenciaService.hoy()
    expect(lista).toHaveLength(16)
    expect(fila(lista, 'T-02')).toMatchObject({ estado: 'EN_JORNADA', entrada: '2026-10-30T07:52:00', atrasado: false })
    expect(fila(lista, 'T-07')).toMatchObject({ estado: 'EN_JORNADA', atrasado: true })
    expect(fila(lista, 'T-01')).toMatchObject({ estado: 'PENDIENTE', entrada: null })
  })

  it('pasada la hora límite, quien no marcó figura como ausente', async () => {
    aLas('10:30')
    login(RRHH)
    expect(fila(await asistenciaService.hoy(), 'T-01').estado).toBe('AUSENTE')
  })

  it('refleja la entrada y la salida que marca el técnico', async () => {
    await asistenciaService.marcar({ tipo: 'ENTRADA', ...GPS, capturado_en: '2026-10-30T08:40:00', obra_id: 'OB-0004' })
    login(RRHH)
    expect(fila(await asistenciaService.hoy(), 'T-01')).toMatchObject({ estado: 'EN_JORNADA', entrada: '2026-10-30T08:40:00', atrasado: true, fuera_geocerca: false })
    login(TECNICO)
    await asistenciaService.marcar({ tipo: 'SALIDA', ...GPS })
    login(RRHH)
    expect(fila(await asistenciaService.hoy(), 'T-01')).toMatchObject({ estado: 'FINALIZADA', salida: '2026-10-30T09:00:00' })
  })

  it('señala la entrada marcada fuera de la geocerca', async () => {
    login(RRHH)
    expect(fila(await asistenciaService.hoy(), 'T-05')).toMatchObject({ fuera_geocerca: true })
  })

  it('la Gerencia General también puede verla', async () => {
    login('U-001')
    expect(await asistenciaService.hoy()).toHaveLength(16)
  })
})
