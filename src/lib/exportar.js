import { prepararTabla, nombreArchivo } from '@/domain/exportar'
import { fechaLocal, isoLocal } from '@/domain/format'

const FORMATO_EXCEL = { moneda: '"$"#,##0', numero: '#,##0.##', porcentaje: '0.0%' }

/**
 * Descarga un .xlsx. Los montos y cantidades se escriben como números con formato (sumables en Excel).
 * La librería se carga bajo demanda para no inflar el bundle inicial.
 * @param {{nombre:string, titulo:string, columnas:import('@/domain/exportar').ColumnaExport[], filas:any[]}} p
 */
export async function exportarExcel({ nombre, titulo, columnas, filas }) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const { encabezados, filas: datos } = prepararTabla(columnas, filas, 'excel')
  const cabecera = encabezados.map((value) => ({ value, fontWeight: 'bold', backgroundColor: '#E2E8F0' }))
  const cuerpo = datos.map((fila) => fila.map((v, i) => {
    const fmt = FORMATO_EXCEL[columnas[i].tipo]
    return typeof v === 'number' ? { value: v, type: Number, ...(fmt && { format: fmt }) } : { value: v ?? '', type: String }
  }))
  await writeXlsxFile(
    [{ data: [cabecera, ...cuerpo], sheet: titulo.slice(0, 31), columns: columnas.map((c) => ({ width: c.ancho ?? 18 })) }],
  ).toFile(`${nombreArchivo(nombre, fechaLocal())}.xlsx`)
}

/**
 * Descarga un PDF apaisado con la tabla y un pie con fecha de emisión.
 * @param {{nombre:string, titulo:string, subtitulo?:string, columnas:import('@/domain/exportar').ColumnaExport[], filas:any[]}} p
 */
export async function exportarPDF({ nombre, titulo, subtitulo, columnas, filas }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { encabezados, filas: datos } = prepararTabla(columnas, filas, 'pdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const emitido = isoLocal().replace('T', ' ').slice(0, 16)
  doc.setFont('helvetica', 'bold').setFontSize(14).text(titulo, 40, 42)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100).text(`Frío y Agroindustria SpA${subtitulo ? ` · ${subtitulo}` : ''}`, 40, 58)
  autoTable(doc, {
    head: [encabezados],
    body: datos,
    startY: 72,
    styles: { fontSize: 8, cellPadding: 4, textColor: [15, 23, 42] },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(columnas.map((c, i) => [i, { halign: ['moneda', 'numero', 'porcentaje'].includes(c.tipo) ? 'right' : 'left' }])),
    didDrawPage: () => {
      const n = doc.getNumberOfPages()
      doc.setFontSize(8).setTextColor(130).text(`Emitido ${emitido} · ${filas.length} registro(s) · pág. ${n}`, 40, doc.internal.pageSize.getHeight() - 20)
    },
  })
  doc.save(`${nombreArchivo(nombre, fechaLocal())}.pdf`)
}
