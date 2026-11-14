import { describe, expect, it } from 'vitest'
import { AZUL, ESTILOS, MENSAJE_COMPLETO, mostrarAvisoApex } from '../marcaApex'

describe('aviso de propiedad intelectual en la consola', () => {
  const capturar = () => { const llamadas = []; mostrarAvisoApex({ log: (...a) => llamadas.push(a) }); return llamadas }

  it('muestra exactamente el texto acordado', () => {
    expect(MENSAJE_COMPLETO).toBe('APEX SYSTEMS ERP. Sistema Propietario desarrollado por Axel Plata. Queda estrictamente prohibida la copia, distribución o uso no autorizado del código fuente.')
    const texto = capturar().map(([formato]) => formato.replace(/^%c/, '')).join(' ')
    expect(texto).toBe(MENSAJE_COMPLETO)
  })
  it('cada línea lleva su estilo CSS (letras grandes en azul oscuro y gris)', () => {
    const llamadas = capturar()
    expect(llamadas).toHaveLength(3)
    llamadas.forEach(([formato, estilo]) => { expect(formato.startsWith('%c')).toBe(true); expect(typeof estilo).toBe('string') })
    expect(ESTILOS.titulo).toContain('44px')
    expect(ESTILOS.titulo).toContain(AZUL)
    expect(ESTILOS.prohibicion).toContain('#6B7280')
  })
  it('sin consola disponible no falla', () => {
    expect(() => mostrarAvisoApex(undefined)).not.toThrow()
    expect(() => mostrarAvisoApex({})).not.toThrow()
  })
})
