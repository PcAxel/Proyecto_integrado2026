import { useEffect } from 'react'
import { toast } from 'sonner'
import { useSyncStore } from '@/stores/syncStore'
import { refrescarCola, procesarCola } from '@/services'

/** Carga la cola al abrir la app y la envía sola cuando vuelve la señal. */
export function SyncManager() {
  const online = useSyncStore((s) => s.online)
  const setOnline = useSyncStore((s) => s.setOnline)
  const hayPendientes = useSyncStore((s) => s.pendientes.some((p) => p.estado === 'PENDIENTE'))

  useEffect(() => { refrescarCola() }, [])
  // El estado de señal es el real del dispositivo, no un interruptor.
  useEffect(() => {
    setOnline(navigator.onLine)
    const alVolver = () => setOnline(true)
    const alPerder = () => setOnline(false)
    window.addEventListener('online', alVolver)
    window.addEventListener('offline', alPerder)
    return () => { window.removeEventListener('online', alVolver); window.removeEventListener('offline', alPerder) }
  }, [setOnline])
  useEffect(() => {
    if (!online || !hayPendientes) return
    procesarCola().then((r) => {
      if (r.enviados) toast.success(`Señal recuperada: ${r.enviados} registro(s) enviado(s)`)
      if (r.errores) toast.error(`${r.errores} registro(s) fueron rechazados. Revisa la pestaña Sync.`)
    })
  }, [online, hayPendientes])
  return null
}
