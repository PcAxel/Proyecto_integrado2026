/** Reduce una imagen a un JPEG pequeño (data URL) para guardarla en la cola offline. @param {File} file */
export function reducirImagen(file, maxLado = 480, calidad = 0.7) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, maxLado / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', calidad))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')) }
    img.src = url
  })
}

/** Foto de ejemplo para demos sin cámara. @param {string} etiqueta */
export function fotoDeEjemplo(etiqueta) {
  const c = document.createElement('canvas')
  c.width = 480
  c.height = 360
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 480, 360)
  grad.addColorStop(0, '#CBD5E1')
  grad.addColorStop(1, '#94A3B8')
  g.fillStyle = grad
  g.fillRect(0, 0, 480, 360)
  g.fillStyle = 'rgba(255,255,255,0.6)'
  g.fillRect(90, 110, 300, 150)
  g.fillStyle = '#475569'
  g.font = '600 28px Inter, sans-serif'
  g.textAlign = 'center'
  g.fillText(`Foto de ejemplo · ${etiqueta}`, 240, 195)
  return c.toDataURL('image/jpeg', 0.7)
}
