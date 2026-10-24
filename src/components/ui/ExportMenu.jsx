import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './Button'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { exportarExcel, exportarPDF } from '@/lib/exportar'

/**
 * Botones de exportación Excel/PDF. Respeta el permiso `exportar`. Las filas se pasan ya filtradas.
 * @param {{nombre:string, titulo:string, subtitulo?:string, columnas:any[], filas:any[], disabled?:boolean}} props
 */
export function ExportMenu({ nombre, titulo, subtitulo, columnas, filas, disabled }) {
  const rol = useAuthStore((s) => s.user?.rol)
  const [cargando, setCargando] = useState(null)
  if (!can(rol, 'exportar')) return null

  const ejecutar = (tipo, fn) => async () => {
    setCargando(tipo)
    try {
      await fn({ nombre, titulo, subtitulo, columnas, filas })
      toast.success(`Archivo ${tipo === 'excel' ? 'Excel' : 'PDF'} generado`)
    } catch (e) {
      toast.error(`No se pudo exportar: ${e.message}`)
    } finally {
      setCargando(null)
    }
  }
  const sinDatos = disabled || filas.length === 0
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" icon={FileSpreadsheet} loading={cargando === 'excel'} disabled={sinDatos} onClick={ejecutar('excel', exportarExcel)}>Excel</Button>
      <Button variant="secondary" size="sm" icon={FileText} loading={cargando === 'pdf'} disabled={sinDatos} onClick={ejecutar('pdf', exportarPDF)}>PDF</Button>
    </div>
  )
}
