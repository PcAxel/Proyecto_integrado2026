import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'

/** Estado de error de una carga: el mensaje viene del servidor; sin datos de respaldo. */
export function ErrorEstado({ error, onReintentar }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-warn" aria-hidden="true" />
      <p className="text-sm text-ink-soft">{error?.message ?? 'No se pudieron cargar los datos.'}</p>
      {onReintentar && <Button variant="secondary" size="sm" onClick={onReintentar}>Reintentar</Button>}
    </div>
  )
}
