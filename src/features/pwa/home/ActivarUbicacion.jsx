import { useCallback, useEffect, useState } from 'react'
import { MapPin, CheckCircle2, RefreshCw } from 'lucide-react'
import { obtenerPosicion } from '@/lib/gps'
import { detectarPlataforma, estaInstalada } from '@/domain/plataforma'
import { estadoUbicacion, pasosParaReactivar } from '@/domain/permisoUbicacion'

const consultar = async () => {
  try {
    const r = await navigator.permissions?.query({ name: 'geolocation' })
    return estadoUbicacion(r?.state)
  } catch { return 'pendiente' } // Safari antiguo: no se puede consultar sin preguntar
}

/**
 * Tarjeta de inicio del técnico para activar la ubicación. El permiso solo se puede pedir con un toque del usuario, así que aquí
 * hay un botón grande y claro. Si ya está concedido no se muestra nada; si fue rechazado explica, paso a paso, cómo reactivarlo.
 */
export function ActivarUbicacion() {
  const [estado, setEstado] = useState('cargando') // cargando | concedido | pendiente | denegado
  const [pidiendo, setPidiendo] = useState(false)
  const nav = globalThis.navigator ?? {}
  const plataforma = detectarPlataforma(nav)
  const instalada = estaInstalada({ displayStandalone: globalThis.matchMedia?.('(display-mode: standalone)').matches, navigatorStandalone: nav.standalone })

  const revisar = useCallback(async () => setEstado(await consultar()), [])
  useEffect(() => { revisar() }, [revisar])

  const activar = async () => {
    setPidiendo(true)
    try {
      await obtenerPosicion() // aquí el teléfono muestra su aviso «¿Permitir que FYAG use tu ubicación?»
      setEstado('concedido')
    } catch {
      const e = await consultar()
      setEstado(e === 'concedido' ? 'concedido' : 'denegado') // sin respuesta clara tras el aviso = no se pudo: se muestra cómo corregirlo
    } finally { setPidiendo(false) }
  }

  if (estado === 'cargando' || estado === 'concedido') return null
  return (
    <section aria-label="Activar ubicación" className="rounded-3xl border-2 border-brand bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand"><MapPin className="h-8 w-8" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold leading-snug text-ink">{estado === 'denegado' ? 'La ubicación está apagada' : 'Activa tu ubicación'}</p>
          <p className="mt-1 text-base leading-snug text-ink-soft">Sirve para marcar tu entrada y enviar tus hojas de servicio desde la obra.</p>
        </div>
      </div>

      {estado === 'pendiente' && (
        <>
          <button type="button" onClick={activar} disabled={pidiendo} className="mt-4 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-ok text-xl font-bold text-white active:scale-[0.98] disabled:opacity-70">
            <CheckCircle2 className="h-7 w-7" />{pidiendo ? 'Esperando tu respuesta…' : 'Activar mi ubicación'}
          </button>
          <p className="mt-2 text-center text-[15px] text-ink-soft">Te va a aparecer un aviso. Toca <b>«Permitir»</b>{plataforma.os === 'ios' ? ' (o «Permitir al usar la app»)' : ''}.</p>
        </>
      )}

      {estado === 'denegado' && (
        <>
          <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-base leading-snug text-ink">
            {pasosParaReactivar(plataforma.os, instalada).map((p) => <li key={p}>{p}</li>)}
          </ol>
          <button type="button" onClick={revisar} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand text-lg font-bold text-brand active:bg-brand-tint">
            <RefreshCw className="h-5 w-5" />Revisar de nuevo
          </button>
        </>
      )}
    </section>
  )
}
