import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '@/components/ui'
import { retirosService } from '@/services'
import { useResource } from '@/hooks/useResource'
import { ArticulosTab } from './ArticulosTab'
import { CardexTab } from './CardexTab'
import { SolicitudesTab } from './SolicitudesTab'

export function BodegaPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'articulos'
  const articuloId = params.get('articulo') ?? ''
  const retiros = useResource(() => retirosService.list(), [])
  const pendientes = (retiros.data ?? []).filter((r) => r.estado === 'PENDIENTE').length

  const ir = (nuevoTab, articulo = '') => {
    const p = new URLSearchParams()
    p.set('tab', nuevoTab)
    if (articulo) p.set('articulo', articulo)
    setParams(p)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Bodega y Cardex" subtitle="Inventario derivado del libro de movimientos" />
      <Tabs value={tab} onChange={(t) => ir(t)} tabs={[
        { id: 'articulos', label: 'Artículos' },
        { id: 'cardex', label: 'Cardex' },
        { id: 'solicitudes', label: 'Solicitudes de retiro', count: pendientes || undefined },
      ]} />
      {tab === 'articulos' && <ArticulosTab onVerKardex={(id) => ir('cardex', id)} />}
      {tab === 'cardex' && <CardexTab articuloId={articuloId} onArticuloChange={(id) => ir('cardex', id)} />}
      {tab === 'solicitudes' && <SolicitudesTab resource={retiros} />}
    </div>
  )
}
