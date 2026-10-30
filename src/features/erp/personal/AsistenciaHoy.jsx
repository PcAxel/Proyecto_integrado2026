import { useEffect, useState } from 'react'
import { RefreshCw, MapPin, MapPinOff, Clock } from 'lucide-react'
import { Card, DataTable, Badge, Mono, Button } from '@/components/ui'
import { FranjaEstados } from '@/components/domain'
import { asistenciaService } from '@/services'
import { useResource } from '@/hooks/useResource'
import { ESTADOS_ASISTENCIA as E, ESTADO_ASISTENCIA_LABEL, resumenAsistencia, horaDe, INICIO_JORNADA, TOLERANCIA_MIN, HORA_LIMITE_AUSENTE } from '@/domain/asistencia'
import { formatFecha, fechaLocal } from '@/domain/format'

const TONO = { [E.EN_JORNADA]: 'ok', [E.FINALIZADA]: 'info', [E.PENDIENTE]: 'warn', [E.AUSENTE]: 'crit' }
const hora = (iso) => (iso ? <Mono className="font-semibold">{horaDe(iso)}</Mono> : <span className="text-ink-faint">—</span>)

/** Asistencia de hoy: quién marcó entrada y a qué hora, y quién sigue pendiente o ausente. Se actualiza sola cada 30 s. */
export function AsistenciaHoy() {
  const lista = useResource(() => asistenciaService.hoy(), [])
  const [estado, setEstado] = useState('')
  const { reload } = lista
  useEffect(() => {
    const t = setInterval(reload, 30_000)
    return () => clearInterval(t)
  }, [reload])

  const filas = lista.data ?? []
  const r = resumenAsistencia(filas)
  const visibles = filas.filter((f) => !estado || f.estado === estado)

  const columnas = [
    { key: 'nombre', header: 'Técnico', render: (f) => <div><p className="font-medium">{f.nombre}</p><p className="text-xs text-ink-soft">{f.cargo}</p></div> },
    { key: 'estado', header: 'Estado', render: (f) => (
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={TONO[f.estado]}>{ESTADO_ASISTENCIA_LABEL[f.estado]}</Badge>
        {f.atrasado && <Badge tone="warn">Atraso</Badge>}
      </div>
    ) },
    { key: 'entrada', header: 'Entrada', render: (f) => hora(f.entrada) },
    { key: 'salida', header: 'Salida', render: (f) => hora(f.salida) },
    { key: 'horas', header: 'Horas', align: 'right', render: (f) => (f.horas ? <Mono>{f.horas} h</Mono> : <span className="text-ink-faint">—</span>) },
    { key: 'ubicacion', header: 'Ubicación de la entrada', render: (f) => (!f.geocerca
      ? <span className="text-ink-faint">{f.entrada ? 'Sin obra de referencia' : '—'}</span>
      : f.geocerca.dentro
        ? <span className="flex items-center gap-1.5 text-ok"><MapPin className="h-4 w-4" />En la obra</span>
        : <span className="flex items-center gap-1.5 text-crit"><MapPinOff className="h-4 w-4" />A {f.geocerca.distanciaM} m de la obra</span>) },
  ]

  return (
    <div className="space-y-4">
      <FranjaEstados
        cargando={!lista.data}
        activo={estado}
        onElegir={setEstado}
        segmentos={[
          { id: '', label: 'Técnicos', valor: r.total },
          { id: E.EN_JORNADA, label: 'En jornada', valor: r.enJornada, tono: 'ok' },
          { id: E.FINALIZADA, label: 'Finalizaron', valor: r.finalizadas, tono: 'info' },
          { id: E.PENDIENTE, label: 'Pendientes', valor: r.pendientes, tono: 'warn' },
          { id: E.AUSENTE, label: 'Ausentes', valor: r.ausentes, tono: 'crit' },
        ]}
        nota={<p className="text-sm text-ink-soft">Entrada hasta las <b>{INICIO_JORNADA}</b> (+{TOLERANCIA_MIN} min de tolerancia). Sin marca desde las <b>{HORA_LIMITE_AUSENTE}</b> se cuenta como ausente.</p>}
      />
      <Card
        title="Asistencia de hoy"
        subtitle={formatFecha(fechaLocal())}
        icon={Clock}
        padded={false}
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={lista.loading && Boolean(lista.data)} onClick={reload}>Actualizar</Button>}
      >
        <DataTable columns={columnas} rows={visibles} rowKey={(f) => f.tecnico_id} loading={lista.loading && !lista.data} />
      </Card>
    </div>
  )
}
