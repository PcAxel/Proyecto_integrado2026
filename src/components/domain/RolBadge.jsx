import { Badge } from '@/components/ui'

const TONO = { ADMIN: 'info', FINANZAS: 'ok', OPERACIONES: 'warn', TECNICO: 'neutral', RRHH: 'info' }
export const ROL_API_LABEL = { ADMIN: 'Administrador', FINANZAS: 'Finanzas', OPERACIONES: 'Operaciones', TECNICO: 'Técnico', RRHH: 'Recursos Humanos' }

export const RolBadge = ({ rol }) => <Badge tone={TONO[rol] ?? 'neutral'}>{ROL_API_LABEL[rol] ?? rol}</Badge>
