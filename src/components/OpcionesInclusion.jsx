import { useEffect, useRef, useState } from 'react'
import { Accessibility, Captions, Eye, Languages, MonitorSpeaker, Pause, Play, Square, TextCursorInput } from 'lucide-react'
import { StatusBadge, cn } from '@/components/ui'
import { useAccessibility } from '@/context/AccessibilityContext'
import { textoDeLaPantalla } from '@/lib/leerPantalla'
import { useLectorStore } from '@/stores/lectorStore'

const MENSAJE_TRADUCCION = {
  'no-soportado': 'Tu navegador no incluye traducción automática (hoy solo en Chrome de escritorio reciente). Los subtítulos seguirán en español.',
  preparando: 'Preparando el traductor…',
  error: 'No se pudo traducir. Los subtítulos siguen en español.',
}

function Interruptor({ activo, onChange, icono: Icono, titulo, detalle, deshabilitado }) {
  return (
    <button type="button" role="switch" aria-checked={activo} disabled={deshabilitado} onClick={() => onChange(!activo)}
      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent">
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{titulo}</span>{detalle && <span className="block text-xs leading-snug text-ink-soft">{detalle}</span>}</span>
      <span className={cn('mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors', activo ? 'bg-brand' : 'bg-line-strong')} aria-hidden="true">
        <span className={cn('h-4 w-4 rounded-full bg-white shadow transition-transform', activo && 'translate-x-4')} />
      </span>
    </button>
  )
}

const Accion = ({ icono: Icono, children, ...props }) => (
  <button type="button" {...props}
    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
    <Icono className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{children}
  </button>
)

/**
 * Botón de accesibilidad de la barra superior (junto al de modo día/noche): abre el menú «Opciones de Inclusión».
 * Hoy trae el lector de textos: leer la pantalla o lo seleccionado, pausar/detener y subtítulos en español (y en inglés si el navegador traduce).
 * Se cierra con Esc, con un clic fuera o al volver a pulsar el botón.
 */
export function OpcionesInclusion({ alineado = 'derecha' }) {
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState(null)
  const raiz = useRef(null)
  const { colorBlindMode, toggleColorBlindMode } = useAccessibility()
  const { soportado, estado, ultimaSeleccion, subtitulos, ingles, traduccion, iniciar, pausar, reanudar, detener, setSubtitulos, setIngles } = useLectorStore()
  const activo = estado !== 'inactivo'

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => { if (!raiz.current?.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') { setAbierto(false); raiz.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  const leerPantalla = () => {
    const { texto, recortado } = textoDeLaPantalla()
    if (!texto) { setAviso('No encontré texto para leer en esta pantalla.'); return }
    setAviso(recortado ? 'La pantalla es muy larga: se lee la primera parte.' : null)
    iniciar(texto, 'pantalla')
    setAbierto(false)
  }
  const leerSeleccion = () => { iniciar(ultimaSeleccion, 'seleccion'); setAbierto(false) }
  const detalleIngles = ingles && traduccion.estado === 'lista' ? 'Solo se muestra: la voz sigue en español. Se traduce en tu dispositivo.'
    : traduccion.estado === 'preparando' ? `Preparando el traductor… ${traduccion.progreso ? `${traduccion.progreso} %` : ''}`.trim()
      : MENSAJE_TRADUCCION[traduccion.estado] ?? 'Se traduce en tu dispositivo, sin enviar nada a internet.'

  return (
    <div ref={raiz} className="relative" data-no-leer>
      <button
        type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-haspopup="dialog" aria-label="Opciones de inclusión y accesibilidad" title="Accesibilidad"
        className={cn('relative flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-fyag-deep/30 hover:text-fyag-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-fyag-ice/50',
          abierto ? 'border-fyag-ice/40 bg-fyag-deep/30 text-fyag-cream' : 'border-fyag-ice/15 text-fyag-ice')}
      >
        <Accessibility className="h-4 w-4" aria-hidden="true" />
        {activo && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-brand ring-2 ring-fyag-bg motion-reduce:animate-none" aria-hidden="true" />}
      </button>
      {abierto && (
        <div role="dialog" aria-label="Opciones de Inclusión"
          className={cn('absolute top-full z-50 mt-2 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-pop', alineado === 'derecha' ? 'right-0' : 'left-0')}>
          <header className="flex items-center gap-2.5 border-b border-line bg-slate-50 px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><Accessibility className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-tight">Opciones de Inclusión</h2>
              <p className="text-xs text-ink-soft">Haz el sistema más cómodo para ti</p>
            </div>
          </header>
          <div className="space-y-3 p-3">
            <section aria-labelledby="lector-titulo">
              <h3 id="lector-titulo" className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Lector de textos</h3>
              {!soportado ? (
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-ink-soft">Tu navegador no puede leer en voz alta. Prueba con Chrome, Edge o Safari.</p>
              ) : (
                <>
                  <Accion icono={MonitorSpeaker} onClick={leerPantalla}>Leer la pantalla</Accion>
                  <Accion icono={TextCursorInput} onClick={leerSeleccion} disabled={!ultimaSeleccion}>
                    <span className="min-w-0"><span className="block">Leer lo seleccionado</span>
                      <span className="block text-xs font-normal text-ink-soft">{ultimaSeleccion ? `«${ultimaSeleccion.slice(0, 38)}${ultimaSeleccion.length > 38 ? '…' : ''}»` : 'Selecciona un texto con el mouse o el dedo'}</span></span>
                  </Accion>
                  {activo && (
                    <div className="mt-1 grid grid-cols-2 gap-2 px-2">
                      <button type="button" onClick={estado === 'pausado' ? reanudar : pausar} className="flex items-center justify-center gap-1.5 rounded-lg border border-line-strong py-1.5 text-sm font-medium hover:bg-slate-100">
                        {estado === 'pausado' ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}{estado === 'pausado' ? 'Continuar' : 'Pausar'}
                      </button>
                      <button type="button" onClick={detener} className="flex items-center justify-center gap-1.5 rounded-lg border border-line-strong py-1.5 text-sm font-medium hover:bg-slate-100">
                        <Square className="h-4 w-4 fill-current" aria-hidden="true" />Detener
                      </button>
                    </div>
                  )}
                  {aviso && <p role="status" className="mt-1 px-2 text-xs text-warn">{aviso}</p>}
                  <div className="mt-2 border-t border-line pt-2">
                    <Interruptor activo={subtitulos} onChange={setSubtitulos} icono={Captions} titulo="Subtítulos mientras lee" detalle="Muestra en español lo que se está diciendo." />
                    <Interruptor activo={ingles} onChange={setIngles} icono={Languages} titulo="Subtítulos también en inglés" detalle={detalleIngles}
                      deshabilitado={traduccion.estado === 'no-soportado' || traduccion.estado === 'preparando' || !subtitulos} />
                  </div>
                </>
              )}
            </section>
            <section aria-labelledby="vision-titulo" className="border-t border-line pt-2">
              <h3 id="vision-titulo" className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Visión</h3>
              <Interruptor activo={colorBlindMode} onChange={toggleColorBlindMode} icono={Eye} titulo="Modo Daltonismo (Íconos de Estado)"
                detalle="Los estados llevan además un ícono y un borde con forma propia, para no depender del rojo y el verde." />
              <div className="mt-1 flex flex-wrap items-center gap-1.5 px-2 pb-1" aria-label="Vista previa de los estados">
                <StatusBadge type="success" label="Aprobado" />
                <StatusBadge type="warning" label="Bajo mínimo" />
                <StatusBadge type="critical" label="Sin stock" />
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
