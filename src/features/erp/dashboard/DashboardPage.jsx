import { Link } from 'react-router-dom'
import { Users, Truck, Gauge, ShieldAlert, HardHat, Package, ClipboardCheck, FileText, Wallet, TrendingUp, Banknote, AlertTriangle, CheckCircle2, Layers, PackageOpen } from 'lucide-react'
import { KpiTile, Card, EmptyState, Skeleton, PageHeader, Mono, cn } from '@/components/ui'
import { dashboardService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { ROL_LABEL } from '@/domain/rbac'
import { formatCLP } from '@/domain/money'
import { formatFechaHora, formatPct } from '@/domain/format'
import { formatKm } from '@/domain/flota'
import { MARGEN_MINIMO, MARGEN_SALUDABLE } from '@/domain/rentabilidad'
import { BarrasPareadas, ListaAlertas, ActividadReciente } from './Charts'

/** Tablero de gerencia: solo muestra lo que el rol puede ver (cada KPI ausente se omite). */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data, loading, error } = useResource(() => dashboardService.resumen(), [])
  const k = data?.kpis ?? {}
  const definido = (v) => v !== undefined && v !== null
  const docsVencidos = (data?.alertas ?? []).filter((a) => a.severidad === 'CRITICA' && ['LICENCIA', 'REVISION_TECNICA', 'SEGURO'].includes(a.tipo)).length

  const tiles = [
    definido(k.ventaAprobada) && { id: 'venta', label: 'Venta aprobada (neto)', value: formatCLP(k.ventaAprobada), icon: Banknote, hint: 'Presupuestos aprobados' },
    definido(k.margenPonderado) && { id: 'margen', label: 'Margen ponderado', value: formatPct(k.margenPonderado), icon: TrendingUp, tone: k.margenPonderado < MARGEN_MINIMO ? 'crit' : k.margenPonderado < MARGEN_SALUDABLE ? 'warn' : 'ok', hint: `${k.presupuestosBajoMargen} presupuesto(s) bajo ${MARGEN_MINIMO} %` },
    definido(k.costoRealObrasActivas) && { id: 'costo', label: 'Costo real obras activas', value: formatCLP(k.costoRealObrasActivas), icon: Wallet, hint: 'Materiales netos + horas-hombre' },
    definido(k.valorInventario) && { id: 'inv', label: 'Valor de inventario', value: formatCLP(k.valorInventario), icon: Package, hint: 'Stock × último costo' },
    definido(k.presupuestosEnCurso) && { id: 'pres', label: 'Presupuestos en curso', value: k.presupuestosEnCurso, icon: FileText, tone: k.presupuestosBajoMargen ? 'warn' : 'neutral', hint: `${k.presupuestosBajoMargen} bajo ${MARGEN_MINIMO} % de margen` },
    definido(k.obrasActivas) && { id: 'obras', label: 'Obras en curso', value: k.obrasActivas, icon: HardHat, hint: `${k.obrasPlanificadas} planificadas · ${k.obrasFinalizadas} finalizadas` },
    definido(k.cu30Pendientes) && { id: 'cu30', label: 'CU30 por regularizar', value: k.cu30Pendientes, icon: AlertTriangle, tone: k.cu30Pendientes ? 'warn' : 'ok', hint: 'Emergencias sin presupuesto' },
    definido(k.hojasPorAuditar) && { id: 'hojas', label: 'Hojas por auditar', value: k.hojasPorAuditar, icon: ClipboardCheck, tone: k.hojasPorAuditar ? 'warn' : 'ok', hint: 'Enviadas desde terreno' },
    definido(k.articulosBajoMinimo) && { id: 'stock', label: 'Stock en alerta', value: k.articulosBajoMinimo + k.articulosSinStock, icon: Layers, tone: k.articulosSinStock ? 'crit' : k.articulosBajoMinimo ? 'warn' : 'ok', hint: `${k.articulosSinStock} sin stock` },
    definido(k.retirosPendientes) && { id: 'retiros', label: 'Retiros pendientes', value: k.retirosPendientes, icon: PackageOpen, tone: k.retirosPendientes ? 'warn' : 'ok', hint: 'Esperan entrega de Bodega' },
    definido(k.tecnicosActivos) && { id: 'tec', label: 'Técnicos activos', value: k.tecnicosActivos, icon: Users, hint: `de ${k.tecnicosTotal} en dotación` },
    definido(k.tarifaPromedio) && { id: 'tarifa', label: 'Tarifa hora-hombre', value: formatCLP(k.tarifaPromedio), icon: Wallet, hint: 'Promedio de técnicos activos' },
    definido(k.vehiculosOperativos) && { id: 'veh', label: 'Vehículos operativos', value: k.vehiculosOperativos, icon: Truck, tone: k.vehiculosEnTaller ? 'warn' : 'ok', hint: `${k.vehiculosEnTaller} en taller` },
    definido(k.kmFlota) && { id: 'km', label: 'Kilometraje de la flota', value: formatKm(k.kmFlota), icon: Gauge, hint: 'Suma de odómetros' },
    definido(k.tecnicosActivos) && { id: 'venc', label: 'Documentos vencidos', value: docsVencidos, icon: ShieldAlert, tone: docsVencidos ? 'crit' : 'ok', hint: 'Licencias, revisión técnica, seguros' },
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <PageHeader title={`Hola, ${user.nombre.split(' ')[0]}`} subtitle={<>Vista de {ROL_LABEL[user.rol]}{data && <> · actualizado <Mono>{formatFechaHora(data.generado)}</Mono></>}</>} />
      {error && <p className="rounded-lg bg-crit-bg p-3 text-sm text-crit">{error.message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 min-[2400px]:grid-cols-10">
        {!data && Array.from({ length: 10 }, (_, i) => <div key={i} className="card h-[108px]"><Skeleton rows={2} /></div>)}
        {tiles.map(({ id, ...t }) => <KpiTile key={id} {...t} />)}
      </div>

      {loading && !data ? <div className="card"><Skeleton rows={6} /></div> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 2xl:grid-cols-4">
          {data.comparativo && (
            <Card className={cn('lg:col-span-2', !data.actividad && 'lg:col-span-3')} title="Presupuestado vs. real por obra" action={<Link to="/erp/obras" className="text-xs font-medium text-brand">Ver obras</Link>}>
              {data.comparativo.length ? <BarrasPareadas items={data.comparativo} /> : <EmptyState title="Sin obras con presupuesto" />}
            </Card>
          )}
          {data.actividad && (
            <Card className={cn('lg:col-span-1', !data.comparativo && 'lg:col-span-3')} title="Actividad reciente" action={<Link to="/erp/auditoria" className="text-xs font-medium text-brand">Ver log completo</Link>}>
              <ActividadReciente logs={data.actividad} />
            </Card>
          )}
          <Card className={cn('lg:col-span-3', data.comparativo || data.actividad ? '2xl:col-span-1' : '2xl:col-span-4')} title={`Alertas (${data.alertas.length})`}>
            {data.alertas.length === 0
              ? <EmptyState icon={CheckCircle2} title="Todo en orden" hint="No hay alertas activas para tu rol." />
              : <ListaAlertas alertas={data.alertas} limite={12} columnas />}
          </Card>
        </div>
      )}
    </div>
  )
}
