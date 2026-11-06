import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { contenidoQr, resolverCodigo } from '@/domain/etiquetas'

/** Dibuja el QR en una matriz de píxeles (módulo = 8 px, borde blanco de 4 módulos), como lo vería la cámara. */
function aPixeles(texto, modulo = 8, borde = 4) {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: 'Q' })
  const n = modules.size
  const lado = (n + borde * 2) * modulo
  const datos = new Uint8ClampedArray(lado * lado * 4).fill(255)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modules.get(y, x)) continue
      for (let dy = 0; dy < modulo; dy++) {
        for (let dx = 0; dx < modulo; dx++) {
          const i = (((y + borde) * modulo + dy) * lado + (x + borde) * modulo + dx) * 4
          datos[i] = datos[i + 1] = datos[i + 2] = 0
        }
      }
    }
  }
  return { datos, lado }
}

describe('etiquetas QR: lo que se imprime lo puede leer el escáner', () => {
  const articulos = [{ id: 'ART-001', sku: 'REF-404A', activo: true }, { id: 'ART-002', sku: 'CU-12', activo: true }, { id: 'ART-009', sku: 'AIS-ARMAFLEX-25MM', activo: true }]

  it.each(articulos)('el QR de $sku se decodifica y lleva a su artículo', (a) => {
    const { datos, lado } = aPixeles(contenidoQr(a))
    const lectura = jsQR(datos, lado, lado)
    expect(lectura?.data).toBe(a.sku)
    expect(resolverCodigo(lectura.data, articulos).articulo.id).toBe(a.id)
  })
})
