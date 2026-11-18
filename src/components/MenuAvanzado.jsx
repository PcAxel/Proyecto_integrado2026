import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Presentation } from 'lucide-react'
import { toast } from 'sonner'
import { IconButton } from '@/components/ui'
import { InformeEjecutivoModal, puedeInformeEjecutivo } from '@/components/InformeEjecutivo'
import { finanzasService } from '@/services'
import { can } from '@/domain/rbac'
import { fechaLocal } from '@/domain/format'
import { useAuthStore } from '@/stores/authStore'

/**
 * Menú discreto «⋯» con las acciones avanzadas de reportes. El camino principal para pedirlos es el asistente de IA («prepárame el reporte de finanzas»);
 * este menú es el respaldo manual y por eso no lleva un botón visible.
 */
export function MenuAvanzado() {
  const rol = useAuthStore((s) => s.user.rol)
  const [abierto, setAbierto] = useState(false)
  const [informe, setInforme] = useState(false)
  const [bajando, setBajando] = useState(false)
  const caja = useRef(null)
  const verFinanzas = can(rol, 'facturacion.ver') && can(rol, 'compras.ver')
  const verInforme = puedeInformeEjecutivo(rol)

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  if (!verFinanzas && !verInforme) return null

  const reporteFinanzas = async () => {
    setAbierto(false)
    setBajando(true)
    try { await finanzasService.descargarReportePpt(fechaLocal().slice(0, 7)) } catch (e) { toast.error(e.message) } finally { setBajando(false) }
  }
  const item = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-brand-tint disabled:opacity-60'

  return (
    <div ref={caja} className="relative">
      <IconButton icon={MoreHorizontal} label="Más acciones" size="sm" aria-haspopup="menu" aria-expanded={abierto} disabled={bajando} onClick={() => setAbierto((v) => !v)} />
      {abierto && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Reportes avanzados</p>
          {verFinanzas && <button type="button" role="menuitem" className={item} onClick={reporteFinanzas}><Presentation className="h-4 w-4 shrink-0" aria-hidden="true" />Reporte de finanzas del mes (PowerPoint)</button>}
          {verInforme && <button type="button" role="menuitem" className={item} onClick={() => { setAbierto(false); setInforme(true) }}><Presentation className="h-4 w-4 shrink-0" aria-hidden="true" />Informe ejecutivo por periodo…</button>}
          <p className="px-3 pb-2 pt-1 text-[11px] text-ink-faint">También puedes pedírselo al asistente de IA.</p>
        </div>
      )}
      {verInforme && <InformeEjecutivoModal abierto={informe} onClose={() => setInforme(false)} />}
    </div>
  )
}
