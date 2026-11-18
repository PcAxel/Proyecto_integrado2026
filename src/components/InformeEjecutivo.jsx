import { useState } from 'react'
import { Presentation } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, Input } from '@/components/ui'
import { informesService } from '@/services'
import { can } from '@/domain/rbac'
import { errorPeriodo, periodoRapido } from '@/domain/periodoInforme'
import { useAuthStore } from '@/stores/authStore'

const ATAJOS = [['mes', 'Este mes'], ['mes_anterior', 'Mes anterior'], ['anio', 'Este año'], ['todo', 'Todo el historial']]

/** Botón + ventana para descargar el informe ejecutivo en PowerPoint de un periodo (el servidor calcula y filtra por fechas). */
export function BotonInformeEjecutivo() {
  const rol = useAuthStore((s) => s.user.rol)
  const [abierto, setAbierto] = useState(false)
  const [periodo, setPeriodo] = useState(() => periodoRapido('mes'))
  const [generando, setGenerando] = useState(false)
  if (!['compras.ver', 'bodega.ver', 'presupuestos.ver', 'obras.ver'].every((p) => can(rol, p))) return null
  const error = errorPeriodo(periodo)

  const descargar = async () => {
    setGenerando(true)
    try { await informesService.descargarEjecutivo(periodo); setAbierto(false) } catch (e) { toast.error(e.message) } finally { setGenerando(false) }
  }

  return (
    <>
      <Button variant="secondary" icon={Presentation} onClick={() => setAbierto(true)}>Informe ejecutivo</Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Informe ejecutivo (PowerPoint)"
        footer={<><Button variant="secondary" onClick={() => setAbierto(false)}>Cancelar</Button><Button icon={Presentation} onClick={descargar} loading={generando} disabled={Boolean(error)}>Descargar .pptx</Button></>}>
        <p className="mb-3 text-sm text-ink-soft">Elige el periodo: las compras, el gasto de obras y los presupuestos aprobados se acotan a esas fechas, y el dinero en bodega se calcula al cierre de la fecha final.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {ATAJOS.map(([clave, texto]) => <Button key={clave} size="sm" variant="secondary" onClick={() => setPeriodo(periodoRapido(clave))}>{texto}</Button>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Desde" opcional type="date" mono value={periodo.desde} max={periodo.hasta || undefined} onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))} />
          <Input label="Hasta" opcional type="date" mono value={periodo.hasta} min={periodo.desde || undefined} onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))} />
        </div>
        {error && <p role="alert" className="mt-2 text-xs font-medium text-crit">{error}</p>}
        <p className="mt-3 text-xs text-ink-faint">{periodo.desde || periodo.hasta ? 'Se incluirá solo el periodo indicado.' : 'Sin fechas: se incluye todo el historial.'}</p>
      </Modal>
    </>
  )
}
