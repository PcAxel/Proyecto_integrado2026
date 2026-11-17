import { describe, it, expect } from 'vitest'
import { normalizarRespuestaIA } from '../respuestaIA'

describe('normalizarRespuestaIA', () => {
  it('extrae respuesta_texto y opciones de un JSON crudo', () => {
    const r = normalizarRespuestaIA('{"respuesta_texto":"Hola","accion":"ninguna","ruta":null,"opciones":["Bodega","Compras"]}')
    expect(r).toEqual({ texto: 'Hola', opciones: ['Bodega', 'Compras'] })
  })
  it('entiende JSON dentro de una cerca ```json', () => {
    expect(normalizarRespuestaIA('```json\n{"respuesta_texto":"Listo"}\n```').texto).toBe('Listo')
  })
  it('deja intacto el texto normal y conserva las opciones aparte', () => {
    expect(normalizarRespuestaIA('Hola {mundo}', ['Sí'])).toEqual({ texto: 'Hola {mundo}', opciones: ['Sí'] })
  })
  it('JSON inválido o sin respuesta_texto se muestra como texto', () => {
    expect(normalizarRespuestaIA('{"a":1}').texto).toBe('{"a":1}')
    expect(normalizarRespuestaIA('{roto').texto).toBe('{roto')
  })
  it('rescata el mensaje de un JSON roto por comillas sin escapar en otro campo', () => {
    const roto = '{"respuesta_texto": "Te llevo a Bodega.\\n\\nTiene 157 unidades de 1/2\\" flare.", "accion": "buscar", "ruta": "/erp/bodega", "termino_busqueda": "Adaptador 1/2""}'
    expect(normalizarRespuestaIA(roto).texto).toBe('Te llevo a Bodega.\n\nTiene 157 unidades de 1/2" flare.')
  })
})
