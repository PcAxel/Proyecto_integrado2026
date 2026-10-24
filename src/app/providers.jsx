import { Component, useEffect } from 'react'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/stores/authStore'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-base font-semibold">Ocurrió un error inesperado</h1>
          <p className="mt-2 font-mono text-xs text-ink-soft">{String(this.state.error.message)}</p>
          <button className="mt-4 h-10 rounded-lg bg-brand px-4 text-sm font-medium text-white" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    )
  }
}

/** Cierra la sesión por inactividad y registra actividad del usuario. */
function InactivityWatcher() {
  const touch = useAuthStore((s) => s.touch)
  const check = useAuthStore((s) => s.checkInactivity)
  useEffect(() => {
    const events = ['pointerdown', 'keydown']
    events.forEach((e) => window.addEventListener(e, touch))
    const timer = setInterval(check, 30_000)
    check()
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(timer)
    }
  }, [touch, check])
  return null
}

export function Providers({ children }) {
  return (
    <ErrorBoundary>
      <InactivityWatcher />
      {children}
      <Toaster position="top-right" richColors closeButton />
    </ErrorBoundary>
  )
}
