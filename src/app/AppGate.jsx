import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Loader2, ServerCrash, ShieldAlert } from 'lucide-react'
import { BrandMark } from '@/components/domain'
import { Button } from '@/components/ui'
import { servidorDisponible } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useServerStore, MENSAJE_SIN_CONEXION } from '@/stores/serverStore'
import { inicioDeRolApi } from '@/domain/rolesApi'

const LATIDO_MS = 10_000

function Pantalla({ icon: Icon, tono = 'crit', titulo, children }) {
  return (
    <main role="alert" className="flex min-h-full items-center justify-center bg-gradient-to-br from-deep via-deep to-[#081E2C] px-4 py-10">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mb-5 flex justify-center"><BrandMark height={52} /></div>
        <Icon className={`mx-auto h-10 w-10 ${tono === 'crit' ? 'text-crit' : 'text-warn'}`} aria-hidden="true" />
        <h1 className="t-display mt-3 text-[1.7rem] leading-tight">{titulo}</h1>
        <div className="mt-3 space-y-4 text-sm text-ink-soft">{children}</div>
      </div>
    </main>
  )
}

/**
 * Compuerta de toda la app. Sin servidor no hay app:
 * 1) al abrir, comprueba que Django responda y, si hay sesión guardada, la revalida con /api/auth/me/;
 * 2) cada 10 s (y al recuperar la red) repite el latido; si falla, bloquea todas las pantallas;
 * 3) un 403 del servidor bloquea la vista actual.
 */
export function AppGate() {
  const caido = useServerStore((s) => s.caido)
  const denegado = useServerStore((s) => s.denegado)
  const user = useAuthStore((s) => s.user)
  const [listo, setListo] = useState(false)
  const arranque = useRef(true)
  const [reintentando, setReintentando] = useState(false)
  const estabaCaido = useRef(false)
  const { pathname } = useLocation()

  const comprobar = async () => {
    const ok = await servidorDisponible()
    const { marcarCaido, marcarOk } = useServerStore.getState()
    if (!ok) { marcarCaido(); return false }
    marcarOk()
    // Al abrir la app se recupera la sesión desde la cookie HttpOnly; al volver el servidor se revalida antes de mostrar nada.
    if (arranque.current && !useAuthStore.getState().access) {
      try { await useAuthStore.getState().restaurarSesion() } catch { marcarCaido(); return false }
    }
    if (useAuthStore.getState().access && (estabaCaido.current || arranque.current)) {
      try { await useAuthStore.getState().sincronizar() } catch (e) {
        if (e.status === 0) { marcarCaido(); return false }
        // 401/403: el interceptor ya cerró la sesión o bloqueó la vista.
      }
    }
    return true
  }

  useEffect(() => {
    let vivo = true
    comprobar().finally(() => { arranque.current = false; if (vivo) setListo(true) })
    const id = setInterval(comprobar, LATIDO_MS)
    const alVolver = () => comprobar()
    window.addEventListener('online', alVolver)
    window.addEventListener('focus', alVolver)
    return () => { vivo = false; clearInterval(id); window.removeEventListener('online', alVolver); window.removeEventListener('focus', alVolver) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { estabaCaido.current = caido }, [caido])
  // Navegar a otra pantalla descarta un bloqueo por 403.
  useEffect(() => { useServerStore.getState().limpiarDenegado() }, [pathname])

  // El técnico en terreno puede seguir trabajando sin conexión MIENTRAS su sesión esté abierta: lo que registre queda en la
  // cola del dispositivo y se envía al volver la señal. Nadie más (ni un técnico sin sesión) entra sin servidor.
  const terrenoSinConexion = caido && user?.rolApi === 'TECNICO' && pathname.startsWith('/app')
  if (caido && !terrenoSinConexion) {
    return (
      <Pantalla icon={ServerCrash} titulo={MENSAJE_SIN_CONEXION}>
        <p>No podemos verificar tu acceso ni cargar datos. La aplicación se desbloquea sola cuando el servidor vuelva a responder.</p>
        <Button loading={reintentando} onClick={async () => { setReintentando(true); await comprobar(); setReintentando(false) }}>Reintentar ahora</Button>
      </Pantalla>
    )
  }
  if (!listo) {
    return <main className="flex min-h-full items-center justify-center bg-deep"><Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label="Conectando con el servidor central" /></main>
  }
  if (denegado) {
    return (
      <Pantalla icon={ShieldAlert} tono="warn" titulo="Acceso denegado por el servidor">
        <p>{denegado}</p>
        <Link to={user ? inicioDeRolApi(user.rolApi) : '/login'} onClick={() => useServerStore.getState().limpiarDenegado()}
          className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark">Ir a mi inicio</Link>
      </Pantalla>
    )
  }
  return <Outlet />
}
