import { describe, it, expect } from 'vitest'
import { bloquesInforme, informeAHtml, sinCursiva } from '../informe'

const MD = `# Informe

_Corte al 2026-11-15_

## 3. Trabajadores en riesgo

Hay **2** casos.

| Trabajador | Riesgo |
| --- | --- |
| Ana Riesgo | Riesgo alto |
| Beto <script>alert(1)</script> | Paso automático |

- Revisar el semáforo
- Actuar con 15 días`

describe('informe en Markdown', () => {
  it('reconoce títulos con su nivel, tablas y listas', () => {
    const b = bloquesInforme(MD)
    expect(b.map((x) => x.tipo)).toEqual(['h', 'p', 'h', 'p', 'tabla', 'ul'])
    expect([b[0].nivel, b[2].nivel]).toEqual([1, 2])
    expect(b[4].cabecera).toEqual(['Trabajador', 'Riesgo'])
    expect(b[4].filas).toHaveLength(2)
    expect(b[4].filas[0]).toEqual(['Ana Riesgo', 'Riesgo alto'])
    expect(b[5].items).toHaveLength(2)
  })
  it('una línea con barras sin separador no es una tabla', () => {
    expect(bloquesInforme('| suelto |').map((x) => x.tipo)).toEqual(['p'])
  })
  it('quita la cursiva con guiones bajos sin tocar los nombres con guion', () => {
    expect(sinCursiva('_Corte al 2026_')).toBe('Corte al 2026')
    expect(sinCursiva('archivo_de_datos')).toBe('archivo_de_datos')
  })
  it('el HTML para imprimir escapa todo el contenido', () => {
    const html = informeAHtml(MD, 'Rotación <2026>')
    expect(html).toContain('<title>Rotación &lt;2026&gt;</title>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('<h2>3. Trabajadores en riesgo</h2>')
    expect(html).toContain('<strong>2</strong>')
    expect(html).toContain('<th>Trabajador</th>')
  })
})
