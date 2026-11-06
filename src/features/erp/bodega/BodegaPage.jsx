import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ScanLine } from 'lucide-react'
import { PageHeader, Tabs, Button } from '@/components/ui'
import { retirosService } from '@/services'
import { useResource } from '@/hooks/useResource'
import { ArticulosTab } from './ArticulosTab'
import { CardexTab } from './CardexTab'
import { SolicitudesTab } from './SolicitudesTab'
import { EtiquetasTab } from './EtiquetasTab'
import { ConteoTab } from './ConteoTab'
import { conteosService } from '@/services'
import { EscanearModal } from './EscanearModal'

export function BodegaPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'articulos'
  const articuloId = params.get('articulo') ?? ''
  const [escaneando, setEscaneando] = useState(false)
  const retiros = useResource(() => retirosService.list(), [])
  const pendientes = (retiros.data ?? []).filter((r) => r.estado === 'PENDIENTE').length
  const conteos = useResource(() => conteosService.list({ estado: 'PENDIENTE' }), [])
  const conteosPendientes = conteos.data?.length ?? 0

  const ir = (nuevoTab, articulo = '') => {
    const p = new URLSearchParams()
    p.set('tab', nuevoTab)
    if (articulo) p.set('articulo', articulo)
    setParams(p)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Bodega y Cardex" subtitle="Inventario derivado del libro de movimientos"
        actions={<Button icon={ScanLine} onClick={() => setEscaneando(true)}>Escanear producto</Button>} />
      <Tabs value={tab} onChange={(t) => ir(t)} tabs={[
        { id: 'articulos', label: 'Artículos' },
        { id: 'cardex', label: 'Cardex' },
        { id: 'solicitudes', label: 'Solicitudes de retiro', count: pendientes || undefined },
        { id: 'conteo', label: 'Conteo físico', count: conteosPendientes || undefined },
        { id: 'etiquetas', label: 'Etiquetas QR' },
      ]} />
      {tab === 'articulos' && <ArticulosTab onVerKardex={(id) => ir('cardex', id)} />}
      {tab === 'cardex' && <CardexTab articuloId={articuloId} onArticuloChange={(id) => ir('cardex', id)} />}
      {tab === 'solicitudes' && <SolicitudesTab resource={retiros} />}
      {tab === 'conteo' && <ConteoTab key={articuloId} articuloInicial={articuloId} />}
      {tab === 'etiquetas' && <EtiquetasTab />}
      <EscanearModal open={escaneando} onClose={() => { setEscaneando(false); retiros.reload() }} />
    </div>
  )
}
