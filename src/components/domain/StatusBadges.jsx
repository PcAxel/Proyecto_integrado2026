import { AlertTriangle, CircleDot, CheckCircle2, CalendarClock, ClipboardCheck, Receipt, HardHat, Send } from 'lucide-react'
import { ETAPA_LABEL } from '@/domain/etapasObra'
import { Badge, StatusBadge } from '@/components/ui'

const OBRA = {
  PLANIFICADA: { tone: 'neutral', label: 'Planificada', icon: CalendarClock },
  EN_CURSO: { tone: 'info', label: 'En curso', icon: CircleDot },
  FINALIZADA: { tone: 'ok', label: 'Finalizada', icon: CheckCircle2 },
}
const ETAPA = {
  CREADO: { tone: 'neutral', icon: CalendarClock },
  ASIGNADO_A_TERRENO: { tone: 'info', icon: Send },
  EN_EJECUCION: { tone: 'info', icon: HardHat },
  AUDITORIA_TERRENO_OK: { tone: 'ok', icon: ClipboardCheck },
  FACTURADO: { tone: 'ok', icon: Receipt },
}
/** Etapa del flujo entre áreas (Operaciones → Finanzas). */
export const EtapaObraBadge = ({ etapa }) => {
  const e = ETAPA[etapa] ?? ETAPA.CREADO
  return <Badge tone={e.tone} icon={e.icon}>{ETAPA_LABEL[etapa] ?? ETAPA_LABEL.CREADO}</Badge>
}

export const ObraStatusBadge = ({ estado }) => {
  const e = OBRA[estado]
  return <Badge tone={e.tone} icon={e.icon}>{e.label}</Badge>
}

const PRESUPUESTO = {
  BORRADOR: { type: 'neutral', label: 'Borrador' },
  ENVIADO: { type: 'info', label: 'Enviado' },
  APROBADO: { type: 'success', label: 'Aprobado' },
  RECHAZADO: { type: 'critical', label: 'Rechazado' },
}
export const PresupuestoStatusBadge = ({ estado }) => <StatusBadge type={PRESUPUESTO[estado].type} label={PRESUPUESTO[estado].label} />

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
  if (!fecha) return <Badge tone="neutral">Sin registro</Badge>
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const [hy, hm, hd] = hoy.split('-').map(Number)
  const dias = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86_400_000)
  const tone = dias < 0 ? 'crit' : dias <= 15 ? 'warn' : dias <= 60 ? 'info' : 'neutral'
  const texto = `${fecha.slice(8, 10)}-${fecha.slice(5, 7)}-${fecha.slice(0, 4)}`
  return <Badge tone={tone}>{texto}{dias < 0 ? ' · vencido' : dias <= 60 ? ` · ${dias} d` : ''}</Badge>
}
