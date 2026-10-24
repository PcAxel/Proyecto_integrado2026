import { AlertTriangle, CircleDot, CheckCircle2, CalendarClock } from 'lucide-react'
import { Badge } from '@/components/ui'

const OBRA = {
  PLANIFICADA: { tone: 'neutral', label: 'Planificada', icon: CalendarClock },
  EN_CURSO: { tone: 'info', label: 'En curso', icon: CircleDot },
  FINALIZADA: { tone: 'ok', label: 'Finalizada', icon: CheckCircle2 },
}
export const ObraStatusBadge = ({ estado }) => {
  const e = OBRA[estado]
  return <Badge tone={e.tone} icon={e.icon}>{e.label}</Badge>
}

const PRESUPUESTO = {
  BORRADOR: { tone: 'neutral', label: 'Borrador' },
  ENVIADO: { tone: 'info', label: 'Enviado' },
  APROBADO: { tone: 'ok', label: 'Aprobado' },
  RECHAZADO: { tone: 'crit', label: 'Rechazado' },
}
export const PresupuestoStatusBadge = ({ estado }) => <Badge tone={PRESUPUESTO[estado].tone}>{PRESUPUESTO[estado].label}</Badge>

/** Marca CU30: obra abierta sin presupuesto previo, pendiente de regularizar. */
export const EmergencyBadge = ({ regularizada = false }) => (
  regularizada
    ? <Badge tone="ok" icon={CheckCircle2}>CU30 regularizada</Badge>
    : <Badge tone="warn" icon={AlertTriangle}>CU30 · sin presupuesto</Badge>
)

export const TIPO_OBRA_LABEL = {
  INSTALACION: 'Instalación', MANTENCION: 'Mantención', REPARACION: 'Reparación', EMERGENCIA: 'Emergencia', GARANTIA: 'Garantía',
}

const HOJA = {
  ENVIADA: { tone: 'info', label: 'Por auditar' },
  APROBADA: { tone: 'ok', label: 'Aprobada' },
  DEVUELTA: { tone: 'crit', label: 'Devuelta' },
}
export const HojaStatusBadge = ({ estado }) => <Badge tone={HOJA[estado].tone}>{HOJA[estado].label}</Badge>

const CHECK = {
  CONFORME: { tone: 'ok', label: 'Conforme' },
  CON_OBSERVACIONES: { tone: 'warn', label: 'Con observaciones' },
  CRITICO: { tone: 'crit', label: 'Crítico' },
  INCOMPLETO: { tone: 'neutral', label: 'Incompleto' },
}
export const ChecklistResultBadge = ({ resultado }) => <Badge tone={CHECK[resultado].tone}>{CHECK[resultado].label}</Badge>

/** Fecha de vencimiento con color según la cercanía (vencido / ≤15 días / ≤60 días). */
export function VencimientoBadge({ fecha, hoy }) {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const [hy, hm, hd] = hoy.split('-').map(Number)
  const dias = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86_400_000)
  const tone = dias < 0 ? 'crit' : dias <= 15 ? 'warn' : dias <= 60 ? 'info' : 'neutral'
  const texto = `${fecha.slice(8, 10)}-${fecha.slice(5, 7)}-${fecha.slice(0, 4)}`
  return <Badge tone={tone}>{texto}{dias < 0 ? ' · vencido' : dias <= 60 ? ` · ${dias} d` : ''}</Badge>
}
