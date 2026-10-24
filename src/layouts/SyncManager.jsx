import { useEffect } from 'react'
import { toast } from 'sonner'
import { useSyncStore } from '@/stores/syncStore'
import { refrescarCola, procesarCola } from '@/services'

/** Carga la cola al abrir la app y la envía sola cuando vuelve la señal. */
export function SyncManager() {
  const online = useSyncStore((s) => s.online)
  const hayPendientes = useSyncStore((s) => s.pendientes.some((p) => p.estado === 'PENDIENTE'))

  useEffect(() => { refrescarCola() }, [])
  useEffect(() => {
    if (!online || !hayPendientes) return
    procesarCola().then((r) => {
      if (r.enviados) toast.success(`Señal recuperada: ${r.enviados} registro(s) enviado(s)`)
      if (r.errores) toast.error(`${r.errores} registro(s) fueron rechazados. Revisa la pestaña Sync.`)
    })
  }, [online, hayPendientes])
  return null
}
