import { describe, it, expect } from 'vitest'
import { BIENVENIDA_IA, PLACEHOLDER_CHAT, historialParaEnviar, mensajeBienvenida, tieneAsistente, validarMensajeChat, tareaIA, validarEntradaIA, mensajeErrorIA, proveedorCoincidente, resumenFactura, TAREAS_IA } from '../ia'

describe('asistente de IA: tarea por rol', () => {
  it('cada rol ve solo la tarea de su ámbito', () => {
    expect(tareaIA('FINANZAS')).toBe('factura')
    expect(tareaIA('ADMIN')).toBe('factura')
    expect(tareaIA('TECNICO')).toBe('reporte')
    expect(tareaIA('OPERACIONES')).toBe('reporte')
  })
  it('RRHH y roles desconocidos no tienen tarea estructurada', () => {
    expect(tareaIA('RRHH')).toBeNull()
    expect(tareaIA(undefined)).toBeNull()
    expect(tareaIA('HACKER')).toBeNull()
  })
  it('los límites coinciden con los del servidor', () => {
    expect(TAREAS_IA.reporte.max).toBe(2000)
    expect(TAREAS_IA.factura.max).toBe(20000)
  })
})

describe('asistente de IA: validación y errores', () => {
  it('valida el largo antes de gastar una consulta', () => {
    expect(validarEntradaIA('reporte', 'hola').ok).toBe(false)
    expect(validarEntradaIA('reporte', 'cambié el filtro').ok).toBe(true)
    expect(validarEntradaIA('reporte', 'x'.repeat(2001)).ok).toBe(false)
    expect(validarEntradaIA('factura', '   ').ok).toBe(false)
  })
  it('traduce los errores a mensajes claros', () => {
    expect(mensajeErrorIA({ status: 429 })).toMatch(/límite de consultas/)
    expect(mensajeErrorIA({ code: 'ai_not_configured' })).toMatch(/todavía no está activado/)
    expect(mensajeErrorIA({ message: 'El agente tardó demasiado.' })).toBe('El agente tardó demasiado.')
    expect(mensajeErrorIA(null)).toMatch(/No se pudo/)
  })
})

describe('asistente de IA: factura extraída', () => {
  const proveedores = [{ id: 'PRV-001', rut: '76.554.120-4', razon_social: 'Distribuidora Frigotec Ltda.' }, { id: 'PRV-002', rut: '77.019.384-1', razon_social: 'Repuestos Refrigeración Biobío SpA' }]
  it('encuentra el proveedor por RUT, aunque venga con otro formato', () => {
    expect(proveedorCoincidente({ rut_proveedor: '76554120-4' }, proveedores).id).toBe('PRV-001')
  })
  it('si no hay RUT, por nombre exacto sin tildes ni mayúsculas', () => {
    expect(proveedorCoincidente({ proveedor: 'repuestos refrigeracion biobio spa' }, proveedores).id).toBe('PRV-002')
  })
  it('no adivina: sin coincidencia clara devuelve null', () => {
    expect(proveedorCoincidente({ proveedor: 'Frigotec' }, proveedores)).toBeNull()
    expect(proveedorCoincidente({ proveedor: '', rut_proveedor: null }, proveedores)).toBeNull()
  })
  it('resume los datos para copiar', () => {
    const t = resumenFactura({ proveedor: 'Frigotec', rut_proveedor: null, numero_factura: '4821', fecha: '2026-11-05', monto_neto: 100000, iva: 19000, total: 119000 })
    expect(t).toContain('Proveedor: Frigotec')
    expect(t).toContain('N° factura: 4821')
    expect(t).toContain('Total: $119.000')
    expect(t).not.toContain('RUT')
  })
})


describe('asistente de IA: conversación', () => {
  it('todos los roles conversan; un rol desconocido no', () => {
    for (const r of ['ADMIN', 'FINANZAS', 'OPERACIONES', 'TECNICO', 'RRHH']) expect(tieneAsistente(r)).toBe(true)
    expect(tieneAsistente('HACKER')).toBe(false)
    expect(tieneAsistente(undefined)).toBe(false)
  })
  it('el chat abre con la bienvenida generada en el frontend', () => {
    expect(BIENVENIDA_IA).toBe('¡Hola! Soy tu asistente de FYAG. ¿En qué te puedo ayudar hoy?')
    expect(mensajeBienvenida()).toMatchObject({ role: 'assistant', content: BIENVENIDA_IA, local: true })
    expect(PLACEHOLDER_CHAT).toBe('¿Qué hacemos hoy? (Ej: Ayúdame a redactar un reporte, o ¿cómo reparo un compresor?)')
  })
  it('la bienvenida y los errores no viajan al servidor, y se recorta a los últimos 20', () => {
    const m = [mensajeBienvenida(), { role: 'user', content: 'hola' }, { role: 'assistant', content: 'falló', error: true }, { role: 'user', content: 'otra vez' }]
    expect(historialParaEnviar(m)).toEqual([{ role: 'user', content: 'hola' }, { role: 'user', content: 'otra vez' }])
    const largo = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }))
    expect(historialParaEnviar(largo)).toHaveLength(20)
    expect(historialParaEnviar(largo).at(-1).content).toBe('29')
  })
  it('valida el mensaje antes de enviarlo', () => {
    expect(validarMensajeChat('   ').ok).toBe(false)
    expect(validarMensajeChat('hola').ok).toBe(true)
    expect(validarMensajeChat('x'.repeat(4001)).ok).toBe(false)
  })
})
