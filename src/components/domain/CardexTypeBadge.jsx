import { ArrowDownToLine, ArrowUpFromLine, Undo2, PackagePlus, ClipboardCheck, PackageCheck, ScanLine } from 'lucide-react'
import { Badge } from '@/components/ui'

const TIPOS = {
  ENTRADA_COMPRA: { label: 'Entrada compra', tone: 'ok', icon: ArrowDownToLine },
  ENTRADA_RECEPCION: { label: 'Recepción', tone: 'ok', icon: PackageCheck },
  SALIDA_OBRA: { label: 'Salida a obra', tone: 'info', icon: ArrowUpFromLine },
  SALIDA_RETIRO: { label: 'Salida por retiro', tone: 'info', icon: ScanLine },
  REVERSA: { label: 'Reversa', tone: 'warn', icon: Undo2 },
  ENTRADA_REVERSA: { label: 'Entrada por reversa', tone: 'warn', icon: Undo2 },
  REINGRESO_SOBRANTE: { label: 'Reingreso sobrante', tone: 'ok', icon: PackagePlus },
  AJUSTE_CONTEO: { label: 'Ajuste por conteo', tone: 'warn', icon: ClipboardCheck },
}

export const TIPO_MOV_LABEL = Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, v.label]))

export function CardexTypeBadge({ tipo }) {
  const t = TIPOS[tipo]
  return <Badge tone={t.tone} icon={t.icon}>{t.label}</Badge>
}
