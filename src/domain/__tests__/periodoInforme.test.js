import { describe, it, expect } from 'vitest'
import { periodoRapido, errorPeriodo } from '../periodoInforme'

describe('periodoRapido', () => {
  it('mes en curso y mes anterior, con fin de mes correcto', () => {
    expect(periodoRapido('mes', '2026-11-18')).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' })
    expect(periodoRapido('mes', '2028-02-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
    expect(periodoRapido('mes_anterior', '2026-11-18')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' })
  })
  it('enero retrocede a diciembre del año anterior', () => {
    expect(periodoRapido('mes_anterior', '2027-01-05')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' })
  })
  it('año y todo el historial', () => {
    expect(periodoRapido('anio', '2026-11-18')).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' })
    expect(periodoRapido('todo')).toEqual({ desde: '', hasta: '' })
  })
})

describe('errorPeriodo', () => {
  it('rechaza un rango al revés y acepta rangos abiertos', () => {
    expect(errorPeriodo({ desde: '2026-11-10', hasta: '2026-11-01' })).toMatch(/anterior/)
    expect(errorPeriodo({ desde: '2026-11-01', hasta: '' })).toBeNull()
    expect(errorPeriodo({ desde: '', hasta: '' })).toBeNull()
  })
})
