import { describe, it, expect } from 'vitest'
import { construirTareas } from '../tareas.js'

const fuentes = {
  presupuestosPorAprobar: [
    { id: 'PRE-0007', titulo: 'Reemplazo de evaporadores', margenPct: 24, bajoMinimo: false },
    { id: 'PRE-0006', titulo: 'Ampliación de cámara', margenPct: 14, bajoMinimo: true },
  ],
  obrasListasParaCerrar: [{ id: 'OB-0007', nombre: 'Reparación de condensación' }],
  obrasCU30: [{ id: 'OB-0004', nombre: 'Falla de compresor' }],
  hojasPorAuditar: [
    { id: 'HS-0009', obra_nombre: 'Emergencia', critico: true, dias: 2 },
    { id: 'HS-0006', obra_nombre: 'Cámara 3', critico: false, dias: 3 },
    { id: 'HS-0014', obra_nombre: 'Cámara 3', critico: false, dias: 0 },
  ],
  retirosPendientes: [{ id: 'SR-0001', obra_nombre: 'Cámara 3', items: 2, faltaStock: false }, { id: 'SR-0002', obra_nombre: 'Emergencia', items: 1, faltaStock: true }],
  articulosEnAlerta: { sinStock: 1, bajo: 2 },
  vencimientos: [{ id: 'REV-VH-03', titulo: 'Revisión técnica · JHYS-77', detalle: 'Vencido hace 5 día(s)', severidad: 'CRITICA' }, { id: 'LIC-T-02', titulo: 'Licencia · Cristian', detalle: 'Vence en 53 día(s)', severidad: 'INFO' }],
  vehiculosEnTaller: [{ patente: 'RTJK-45' }],
}
const ids = (rol, extra = {}) => construirTareas({ rol, fuentes, ...extra }).map((t) => t.id)

describe('construirTareas: cada rol recibe solo lo que puede resolver', () => {
  it('Administrador General: aprueba (incluido margen bajo) y cierra obras, pero no opera', () => {
    const r = ids('ADMIN_GENERAL')
    expect(r).toEqual(expect.arrayContaining(['apr-PRE-0007', 'apr-PRE-0006', 'cer-OB-0007']))
    expect(r.some((i) => i.startsWith('ret-') || i.startsWith('hoja-') || i.startsWith('cu30-') || i.startsWith('venc-'))).toBe(false)
  })
  it('Administración no ve el presupuesto con margen bajo (lo decide la Gerencia) y regulariza CU30', () => {
    const r = ids('ADMINISTRACION')
    expect(r).toContain('apr-PRE-0007')
    expect(r).not.toContain('apr-PRE-0006')
    expect(r).toContain('cu30-OB-0004')
    expect(r).not.toContain('cer-OB-0007')
  })
  it('Supervisor audita hojas, cierra y regulariza obras', () => {
    const r = ids('SUPERVISOR')
    expect(r).toEqual(expect.arrayContaining(['hoja-HS-0009', 'hoja-HS-0006', 'hoja-HS-0014', 'cer-OB-0007', 'cu30-OB-0004']))
    expect(r.some((i) => i.startsWith('apr-'))).toBe(false)
  })
  it('Bodega atiende retiros y repone stock', () => {
    const r = ids('BODEGA')
    expect(r).toEqual(expect.arrayContaining(['ret-SR-0001', 'ret-SR-0002', 'reponer']))
    expect(r.some((i) => i.startsWith('hoja-') || i.startsWith('apr-'))).toBe(false)
  })
  it('RRHH ve documentos vencidos y vehículos en taller, sin los que vencen lejos', () => {
    const r = ids('RRHH')
    expect(r).toEqual(expect.arrayContaining(['venc-REV-VH-03', 'taller-RTJK-45']))
    expect(r).not.toContain('venc-LIC-T-02')
  })
  it('Consulta (solo lectura) y Técnico no reciben tareas', () => {
    expect(ids('CONSULTA')).toEqual([])
    expect(ids('TECNICO')).toEqual([])
  })
})

describe('orden y límite', () => {
  it('ordena por gravedad y respeta el límite', () => {
    const t = construirTareas({ rol: 'SUPERVISOR', fuentes })
    expect(t[0].severidad).toBe('CRITICA')
    const sev = t.map((x) => x.severidad)
    expect(sev).toEqual([...sev].sort((a, b) => ({ CRITICA: 0, ADVERTENCIA: 1, INFO: 2 })[a] - ({ CRITICA: 0, ADVERTENCIA: 1, INFO: 2 })[b]))
    expect(construirTareas({ rol: 'SUPERVISOR', fuentes, limite: 2 })).toHaveLength(2)
  })
  it('clasifica la hoja por gravedad: crítica, de varios días o reciente', () => {
    const t = Object.fromEntries(construirTareas({ rol: 'SUPERVISOR', fuentes }).map((x) => [x.id, x]))
    expect(t['hoja-HS-0009'].severidad).toBe('CRITICA')
    expect(t['hoja-HS-0006'].severidad).toBe('ADVERTENCIA')
    expect(t['hoja-HS-0014']).toMatchObject({ severidad: 'INFO', detalle: 'Cámara 3. Enviada hoy' })
  })
  it('sin datos no inventa tareas', () => {
    expect(construirTareas({ rol: 'ADMIN_GENERAL', fuentes: {} })).toEqual([])
  })
})
