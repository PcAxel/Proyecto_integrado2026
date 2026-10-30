import { describe, it, expect } from 'vitest'
import {
  validarMarca, siguienteMarca, estadoDelDia, marcasDelDia, horasTrabajadas, llegoTarde, resumenAsistencia, horaDe, ESTADOS_ASISTENCIA as E,
} from '../asistencia'

const m = (tipo, hora, tecnico_id = 'T-01', dia = '2026-10-30') => ({ tipo, tecnico_id, fecha: `${dia}T${hora}:00` })

describe('asistencia: validación de marcas', () => {
  it('sin marcas solo corresponde entrada', () => {
    expect(siguienteMarca([])).toBe('ENTRADA')
    expect(validarMarca('ENTRADA', []).ok).toBe(true)
    expect(validarMarca('SALIDA', []).ok).toBe(false)
  })
  it('entrada repetida: error con el mensaje exigido', () => {
    const r = validarMarca('ENTRADA', [m('ENTRADA', '08:00')])
    expect(r).toEqual({ ok: false, error: 'Acción inválida: Ya registraste tu entrada. Debes marcar salida.' })
  })
  it('salida repetida y salida sin entrada también se rechazan', () => {
    expect(validarMarca('SALIDA', [m('ENTRADA', '08:00'), m('SALIDA', '17:00')]).error).toBe('Acción inválida: Ya registraste tu salida. Debes marcar entrada.')
    expect(validarMarca('SALIDA', []).error).toMatch(/Debes marcar entrada/)
  })
  it('alterna entrada y salida', () => {
    expect(siguienteMarca([m('ENTRADA', '08:00')])).toBe('SALIDA')
    expect(siguienteMarca([m('ENTRADA', '08:00'), m('SALIDA', '13:00')])).toBe('ENTRADA')
    expect(validarMarca('SALIDA', [m('ENTRADA', '08:00')]).ok).toBe(true)
  })
  it('rechaza un tipo desconocido', () => {
    expect(validarMarca('ALMUERZO', []).ok).toBe(false)
  })
})

describe('asistencia: estado del día', () => {
  it('sin marcas: pendiente antes de las 10:00 y ausente desde entonces', () => {
    expect(estadoDelDia([], '09:59')).toBe(E.PENDIENTE)
    expect(estadoDelDia([], '10:00')).toBe(E.AUSENTE)
  })
  it('con marcas depende de la última', () => {
    expect(estadoDelDia([m('ENTRADA', '08:00')], '12:00')).toBe(E.EN_JORNADA)
    expect(estadoDelDia([m('ENTRADA', '08:00'), m('SALIDA', '17:00')], '18:00')).toBe(E.FINALIZADA)
  })
  it('filtra las marcas por técnico y día, en orden', () => {
    const todas = [m('SALIDA', '17:00'), m('ENTRADA', '08:00'), m('ENTRADA', '08:10', 'T-02'), m('ENTRADA', '08:00', 'T-01', '2026-10-29')]
    expect(marcasDelDia(todas, 'T-01', '2026-10-30').map((x) => x.tipo)).toEqual(['ENTRADA', 'SALIDA'])
  })
})

describe('asistencia: horas, atrasos y resumen', () => {
  it('suma pares y cuenta la jornada abierta hasta ahora', () => {
    expect(horasTrabajadas([m('ENTRADA', '08:00'), m('SALIDA', '13:00'), m('ENTRADA', '14:00')], '16:30')).toBe(7.5)
  })
  it('atraso después de la tolerancia de 15 min', () => {
    expect(llegoTarde('08:15')).toBe(false)
    expect(llegoTarde('08:16')).toBe(true)
  })
  it('horaDe y resumen', () => {
    expect(horaDe('2026-10-30T08:05:09')).toBe('08:05')
    const r = resumenAsistencia([{ estado: E.EN_JORNADA, atrasado: true }, { estado: E.FINALIZADA }, { estado: E.AUSENTE, fuera_geocerca: false }, { estado: E.PENDIENTE, fuera_geocerca: true }])
    expect(r).toMatchObject({ total: 4, presentes: 2, ausentes: 1, pendientes: 1, atrasados: 1, fueraGeocerca: 1 })
  })
})
