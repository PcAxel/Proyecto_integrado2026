import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/mocks/db'
import { useAuthStore } from '@/stores/authStore'
import { configureHttp, obrasService } from '@/services'

const login = (id) => useAuthStore.getState().login(id)
const TECNICO = 'U-005' // Jorge Quezada (T-01)
const SUPERVISOR = 'U-004'

beforeEach(async () => {
  configureHttp({ minMs: 0, maxMs: 0, failRate: 0 })
  await db.reset()
  login(TECNICO)
})

describe('asignación de obras a técnicos', () => {
  it('el técnico ve solo las obras donde está asignado', async () => {
    const obras = await obrasService.list()
    expect(obras.length).toBeGreaterThan(0)
    expect(obras.every((o) => o.tecnicos.includes('T-01'))).toBe(true)
    expect(obras.map((o) => o.id)).not.toContain('OB-0003')
  })

  it('el técnico no puede abrir el detalle de una obra ajena', async () => {
    await expect(obrasService.retrieve('OB-0003')).rejects.toMatchObject({ status: 403 })
    await expect(obrasService.retrieve('OB-0004')).resolves.toMatchObject({ id: 'OB-0004' })
  })

  it('el supervisor asigna técnicos y la obra aparece en la app de ese técnico', async () => {
    expect((await obrasService.list({ estado: 'EN_CURSO' })).map((o) => o.id)).not.toContain('OB-0007')
    login(SUPERVISOR)
    const r = await obrasService.asignarTecnicos('OB-0007', ['T-04', 'T-09', 'T-01'])
    expect(r.tecnicos).toEqual(['T-04', 'T-09', 'T-01'])
    login(TECNICO)
    expect((await obrasService.list({ estado: 'EN_CURSO' })).map((o) => o.id)).toContain('OB-0007')
    login(SUPERVISOR)
    await obrasService.asignarTecnicos('OB-0007', ['T-04', 'T-09'])
    login(TECNICO)
    expect((await obrasService.list({ estado: 'EN_CURSO' })).map((o) => o.id)).not.toContain('OB-0007')
  })

  it('la reasignación queda auditada con el antes y el después', async () => {
    login(SUPERVISOR)
    await obrasService.asignarTecnicos('OB-0007', ['T-04'])
    const log = (await obrasService.historial('OB-0007')).find((l) => l.accion === 'ASIGNAR_TECNICOS')
    expect(log.anterior.tecnicos).toEqual(['T-04', 'T-09'])
    expect(log.nuevo.tecnicos).toEqual(['T-04'])
  })

  it('valida permisos, técnicos y estado de la obra', async () => {
    await expect(obrasService.asignarTecnicos('OB-0007', ['T-01'])).rejects.toMatchObject({ status: 403 })
    login(SUPERVISOR)
    await expect(obrasService.asignarTecnicos('OB-0007', ['T-99'])).rejects.toMatchObject({ status: 422 })
    await expect(obrasService.asignarTecnicos('OB-0003', ['T-04'])).rejects.toMatchObject({ status: 409 })
  })
})
