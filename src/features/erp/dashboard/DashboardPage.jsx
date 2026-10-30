import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Truck, Gauge, ShieldAlert, HardHat, Package, ClipboardCheck, FileText, Wallet, Banknote, AlertTriangle, CheckCircle2, Layers, PackageOpen, ChevronDown, Bell, TrendingUp } from 'lucide-react'
import { KpiTile, Card, EmptyState, Skeleton, Button, cn } from '@/components/ui'
import { dashboardService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { formatCLP } from '@/domain/money'
import { MARGEN_MINIMO, MARGEN_SALUDABLE } from '@/domain/rentabilidad'
import { formatPct } from '@/domain/format'
import { formatKm } from '@/domain/flota'
import { BarrasPareadas, ListaAlertas, ActividadReciente } from './Charts'
import { PanelInstrumentos } from './Hero'
import { BandejaTareas } from './BandejaTareas'
import { ENFOQUES, PRIORIDAD_INDICADORES, elegirInstrumento } from './enfoques'

const VISIBLES = { conBandeja: 4, sinBandeja: 6 }

/** Inicio de cada rol: panel de instrumentos, pendientes propios, indicadores relevantes y, debajo, el detalle de gestión. */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data, loading, error } = useResource(() => dashboardService.resumen(), [])
  const [todos, setTodos] = useState(false)
  const k = data?.kpis ?? {}
  const definido = (v) => v !== undefined && v !== null
  const docsVencidos = (data?.alertas ?? []).filter((a) => a.severidad === 'CRITICA' && ['LICENCIA', 'REVISION_TECNICA', 'SEGURO'].includes(a.tipo)).length
  const enfoque = ENFOQUES[user.rol] ?? ENFOQUES.CONSULTA
  const tareas = data?.tareas ?? []

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
  const prioridad = PRIORIDAD_INDICADORES[user.rol] ?? []
  const ordenados = [...tiles].sort((a, b) => {
    const pa = prioridad.indexOf(a.id)
    const pb = prioridad.indexOf(b.id)
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
  })
  const conBandeja = user.rol !== 'CONSULTA' // el rol de solo lectura no tiene nada que resolver
  const cuantos = conBandeja ? VISIBLES.conBandeja : VISIBLES.sinBandeja
  const visibles = todos ? ordenados : ordenados.slice(0, cuantos)
  const hayMas = ordenados.length > cuantos

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-crit-bg p-3 text-sm text-crit">{error.message}</p>}

      {!data ? (
        <div className="instrument h-72 animate-pulse p-8" aria-busy="true" aria-label="Cargando inicio" />
      ) : (
        <PanelInstrumentos usuario={user} titular={enfoque.titular(tareas)} apoyo={enfoque.apoyo(tareas)} accesos={enfoque.accesos} instrumento={elegirInstrumento(k)} />
      )}

      <div className={cn('grid items-start gap-6', conBandeja && 'xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]')}>
        {conBandeja && (data ? <BandejaTareas tareas={tareas} /> : <div className="card"><Skeleton rows={5} /></div>)}
        <section aria-label="Indicadores">
          <div className={cn('grid grid-cols-2 gap-3 sm:gap-4', conBandeja ? '' : 'lg:grid-cols-3 min-[1900px]:grid-cols-6')}>
            {!data && Array.from({ length: 4 }, (_, i) => <div key={i} className="card h-[116px]"><Skeleton rows={2} /></div>)}
            {visibles.map(({ id, ...t }) => <KpiTile key={id} {...t} animar />)}
          </div>
          {hayMas && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
              <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', todos && 'rotate-180')} />
              {todos ? 'Mostrar menos' : `Más indicadores (${ordenados.length - cuantos})`}
            </Button>
          )}
        </section>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 2xl:grid-cols-4">
          {data.comparativo && (
            <Card className={cn('lg:col-span-2', !data.actividad && 'lg:col-span-3')} title="Presupuestado y real por obra" subtitle="Costo comprometido frente al costo acumulado" icon={HardHat} action={<Link to="/erp/obras" className="text-sm font-medium text-brand-dark hover:underline">Ver obras</Link>}>
              {data.comparativo.length ? <BarrasPareadas items={data.comparativo} /> : <EmptyState title="Sin obras con presupuesto" hint="Cuando una obra tenga presupuesto aprobado, compararás aquí su costo real." />}
            </Card>
          )}
          {data.actividad && (
            <Card className={cn('lg:col-span-1', !data.comparativo && 'lg:col-span-3')} title="Actividad reciente" icon={ClipboardCheck} action={<Link to="/erp/auditoria" className="text-sm font-medium text-brand-dark hover:underline">Ver todo</Link>}>
              <ActividadReciente logs={data.actividad} />
            </Card>
          )}
          <Card className={cn('lg:col-span-3', data.comparativo || data.actividad ? '2xl:col-span-1' : '2xl:col-span-4')} title="Alertas del sistema" subtitle={data.alertas.length ? `${data.alertas.length} activas` : undefined} icon={Bell}>
            {data.alertas.length === 0
              ? <EmptyState icon={CheckCircle2} title="Todo en orden" hint="No hay alertas activas para tu rol." />
              : <ListaAlertas alertas={data.alertas} limite={12} columnas />}
          </Card>
        </div>
      )}
      {loading && !data && null}
    </div>
  )
}
