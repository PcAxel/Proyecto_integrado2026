import { useMemo, useState } from 'react'
import { ClipboardCheck, Undo2, MapPinOff, ShieldAlert, Inbox } from 'lucide-react'
import { PageHeader, KpiTile, Select, Mono, EmptyState, Skeleton, cn } from '@/components/ui'
import { ChecklistResultBadge, HojaStatusBadge } from '@/components/domain'
import { hojasService } from '@/services'
import { formatFechaHora } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { usePersistedFilters } from '@/hooks/usePersistedFilters'
import { HojaDetalle } from './HojaDetalle'

/** Bandeja web de auditoría (RF: Auditoría de Terreno): master-detail de hojas enviadas desde la PWA. */
export function TerrenoPage() {
  const rol = useAuthStore((s) => s.user.rol)
  const [filtros, setFiltro] = usePersistedFilters('terreno', { estado: 'ENVIADA', obra: '' })
  const [selId, setSelId] = useState(null)
  const { data, loading, reload } = useResource(() => hojasService.list(), [])
  const todas = data ?? []

  const obras = useMemo(() => [...new Map(todas.map((h) => [h.obra_id, h.obra_nombre])).entries()], [todas])
  const filas = todas.filter((h) => (!filtros.estado || h.estado === filtros.estado) && (!filtros.obra || h.obra_id === filtros.obra))
  const seleccionada = todas.find((h) => h.id === selId) ?? null
  const fueraGeo = (h) => h.fotos.some((f) => f.geocerca && !f.geocerca.dentro)
  const kpi = (v) => (data ? v : '—')

  return (
    <div className="space-y-5">
      <PageHeader title="Auditoría de Terreno" subtitle="Hojas de servicio enviadas desde la app móvil" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="Por auditar" value={kpi(todas.filter((h) => h.estado === 'ENVIADA').length)} icon={ClipboardCheck} tone="warn" />
        <KpiTile label="Devueltas" value={kpi(todas.filter((h) => h.estado === 'DEVUELTA').length)} icon={Undo2} />
        <KpiTile label="Fotos fuera de geocerca" value={kpi(todas.filter(fueraGeo).length)} icon={MapPinOff} tone={todas.some(fueraGeo) ? 'crit' : 'neutral'} />
        <KpiTile label="Checklist crítico" value={kpi(todas.filter((h) => h.evaluacion.resultado === 'CRITICO').length)} icon={ShieldAlert} tone={todas.some((h) => h.evaluacion.resultado === 'CRITICO') ? 'crit' : 'neutral'} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="space-y-3 border-b border-line p-4">
            <Select label="Estado" value={filtros.estado} onChange={(e) => setFiltro('estado', e.target.value)} placeholder="Todos"
              options={[{ value: 'ENVIADA', label: 'Por auditar' }, { value: 'APROBADA', label: 'Aprobadas' }, { value: 'DEVUELTA', label: 'Devueltas' }]} />
            <Select label="Obra" value={filtros.obra} onChange={(e) => setFiltro('obra', e.target.value)} placeholder="Todas" options={obras.map(([value, label]) => ({ value, label: `${value} · ${label}` }))} />
          </div>
          {loading && !data ? <Skeleton rows={5} /> : filas.length === 0 ? <EmptyState icon={Inbox} title="Sin hojas" hint="No hay hojas con estos filtros." /> : (
            <ul className="max-h-[38rem] divide-y divide-line overflow-y-auto">
              {filas.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => setSelId(h.id)} className={cn('w-full space-y-1.5 px-4 py-3 text-left hover:bg-slate-50', selId === h.id && 'bg-brand-tint')}>
                    <div className="flex items-center justify-between"><Mono className="text-sm font-semibold">{h.id}</Mono><HojaStatusBadge estado={h.estado} /></div>
                    <p className="truncate text-sm">{h.obra_nombre}</p>
                    <p className="text-xs text-ink-soft">{h.tecnico_nombre} · <Mono>{formatFechaHora(h.fecha)}</Mono></p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ChecklistResultBadge resultado={h.evaluacion.resultado} />
                      {fueraGeo(h) && <span className="inline-flex items-center gap-1 rounded-full bg-crit-bg px-2 py-0.5 text-xs font-medium text-crit"><MapPinOff className="h-3 w-3" />Fuera de geocerca</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div>
          {seleccionada
            ? <HojaDetalle key={seleccionada.id + seleccionada.estado} hoja={seleccionada} puedeAuditar={can(rol, 'hojas.auditar')} onChanged={reload} />
            : <div className="card"><EmptyState icon={ClipboardCheck} title="Selecciona una hoja" hint="Revisa el checklist, la evidencia con sello GPS y aprueba o devuelve con observaciones." /></div>}
        </div>
      </div>
    </div>
  )
}
