import { ArrowDownToLine, ArrowUpFromLine, Undo2, PackagePlus } from 'lucide-react'
import { Badge } from '@/components/ui'

const TIPOS = {
  ENTRADA_COMPRA: { label: 'Entrada compra', tone: 'ok', icon: ArrowDownToLine },
  SALIDA_OBRA: { label: 'Salida a obra', tone: 'info', icon: ArrowUpFromLine },
  REVERSA: { label: 'Reversa', tone: 'warn', icon: Undo2 },
  REINGRESO_SOBRANTE: { label: 'Reingreso sobrante', tone: 'ok', icon: PackagePlus },
}

export const TIPO_MOV_LABEL = Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, v.label]))

export function CardexTypeBadge({ tipo }) {
  const t = TIPOS[tipo]
  return <Badge tone={t.tone} icon={t.icon}>{t.label}</Badge>
}
