import { describe, it, expect } from 'vitest'
import { bloques, inline } from '../markdown.js'

describe('markdown ligero', () => {
  it('separa párrafos, títulos, listas y separadores', () => {
    const b = bloques('# Título\nHola\nmundo\n\n- uno\n- dos\n\n1. a\n2. b\n\n---\nFin')
    expect(b.map((x) => x.tipo)).toEqual(['h', 'p', 'ul', 'ol', 'hr', 'p'])
    expect(b[1].texto).toBe('Hola\nmundo')
    expect(b[2].items).toEqual(['uno', 'dos'])
    expect(b[3].items).toEqual(['a', 'b'])
  })
  it('negrita y código en línea', () => {
    expect(inline('Usa **R410A** con `P1`.')).toEqual(['Usa ', { t: 'b', v: 'R410A' }, ' con ', { t: 'c', v: 'P1' }, '.'])
  })
  it('el HTML del modelo queda como texto, nunca como marcado', () => {
    const [p] = bloques('<img src=x onerror=alert(1)> **ok**')
    expect(p.tipo).toBe('p')
    expect(inline(p.texto)[0]).toBe('<img src=x onerror=alert(1)> ')
  })
  it('entrada vacía', () => { expect(bloques('')).toEqual([]); expect(bloques(null)).toEqual([]) })
})
