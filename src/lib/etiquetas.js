import { FORMATOS_ETIQUETA, AMBIENTES_ETIQUETA, contenidoQr, distribuirEtiquetas } from '@/domain/etiquetas'
import { fechaLocal } from '@/domain/format'

/**
 * Genera el PDF con las etiquetas QR de los artículos elegidos. Las librerías (jsPDF y qrcode) se cargan bajo demanda.
 * @param {Array<{codigo:string, nombre:string, detalle?:string}>} articulos datos de cada etiqueta (de producto o de lote)
 * @param {keyof typeof FORMATOS_ETIQUETA} formatoId @param {keyof typeof AMBIENTES_ETIQUETA} [ambienteId]
 */
export async function generarPdfEtiquetas(articulos, formatoId, ambienteId = 'SECO') {
  const f = FORMATOS_ETIQUETA[formatoId]
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([import('jspdf'), import('qrcode')])
  const orientacion = f.pagina[0] > f.pagina[1] ? 'landscape' : 'portrait'
  const doc = new jsPDF({ unit: 'mm', format: f.pagina, orientation: orientacion })
  const grande = f.etiqueta[0] >= 100
  const pos = distribuirEtiquetas(f, articulos.length)
  const qrs = await Promise.all(articulos.map((a) => QRCode.toDataURL(contenidoQr(a), { errorCorrectionLevel: AMBIENTES_ETIQUETA[ambienteId].correccion, margin: 1, width: 360 })))

  articulos.forEach((a, i) => {
    const { pagina, x, y } = pos[i]
    if (i > 0 && pagina !== pos[i - 1].pagina) doc.addPage(f.pagina, orientacion)
    const [w, h] = f.etiqueta
    if (f.tipo === 'HOJA') { doc.setDrawColor(210); doc.setLineWidth(0.1); doc.rect(x + 0.3, y + 0.3, w - 0.6, h - 0.6) }
    doc.addImage(qrs[i], 'PNG', x + 2, y + (h - f.qr) / 2, f.qr, f.qr)
    const tx = x + f.qr + 4
    const ancho = w - f.qr - 6
    doc.setTextColor(11, 42, 60)
    doc.setFont('helvetica', 'bold')
    // El SKU va siempre en una sola línea: se reduce la letra hasta que quepa (mínimo 7 pt).
    let tam = grande ? 22 : 13
    doc.setFontSize(tam)
    while (doc.getTextWidth(a.codigo) > ancho && tam > 7) { tam -= 0.5; doc.setFontSize(tam) }
    doc.text(a.codigo, tx, y + (grande ? 14 : 9))
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(grande ? 12 : 7.5)
    doc.text(doc.splitTextToSize(a.nombre, ancho).slice(0, grande ? 4 : 3), tx, y + (grande ? 24 : 14), { lineHeightFactor: 1.15 })
    const pie = grande ? 10 : 6.5
    doc.setFontSize(pie)
    doc.setTextColor(100)
    const lineas = doc.splitTextToSize(`${a.detalle ? `${a.detalle}  ·  ` : ''}FYAG`, ancho).slice(0, 2)
    doc.text(lineas, tx, y + h - (grande ? 6 : 3.5) - (lineas.length - 1) * pie * 0.3528 * 1.15)
  })
  return doc
}

/** Descarga el PDF de etiquetas. */
export async function descargarEtiquetas(articulos, formatoId, ambienteId) {
  const doc = await generarPdfEtiquetas(articulos, formatoId, ambienteId)
  doc.save(`etiquetas-qr-${fechaLocal()}.pdf`)
}

/** Abre el PDF en una pestaña nueva, listo para imprimir. */
export async function abrirEtiquetasParaImprimir(articulos, formatoId, ambienteId) {
  const doc = await generarPdfEtiquetas(articulos, formatoId, ambienteId)
  window.open(doc.output('bloburl'), '_blank', 'noopener')
}
