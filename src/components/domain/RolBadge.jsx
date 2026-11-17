import { Badge } from '@/components/ui'

const TONO = { ADMIN: 'info', FINANZAS: 'ok', OPERACIONES: 'warn', TECNICO: 'neutral', RRHH: 'info', SUPERADMIN: 'crit', COMERCIAL: 'ok', AUDITOR: 'neutral' }
export const ROL_API_LABEL = { SUPERADMIN: 'Super Admin (TI)', ADMIN: 'Gerente General', FINANZAS: 'Finanzas y Tributario', RRHH: 'Recursos Humanos', OPERACIONES: 'Operaciones y Bodega', COMERCIAL: 'Ejecutivo Comercial', TECNICO: 'Técnico en Terreno', AUDITOR: 'Auditor Externo' }

export const RolBadge = ({ rol }) => <Badge tone={TONO[rol] ?? 'neutral'}>{ROL_API_LABEL[rol] ?? rol}</Badge>
