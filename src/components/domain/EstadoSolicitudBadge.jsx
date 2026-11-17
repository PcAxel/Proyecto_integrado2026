import { Badge } from '@/components/ui'

const ESTADO = {
  PENDIENTE: { tone: 'warn', label: 'Pendiente' },
  APROBADA: { tone: 'ok', label: 'Aprobada' },
  RECHAZADA: { tone: 'crit', label: 'Rechazada' },
}

/** Estado de una solicitud de compra. */
export const EstadoSolicitudBadge = ({ estado }) => <Badge tone={(ESTADO[estado] ?? ESTADO.PENDIENTE).tone}>{(ESTADO[estado] ?? ESTADO.PENDIENTE).label}</Badge>
