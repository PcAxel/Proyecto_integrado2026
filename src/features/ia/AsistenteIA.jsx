import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Compass, X, Copy, RotateCcw, FilePlus2, AlertTriangle, ShieldCheck, SendHorizontal, MessageSquarePlus, Download, FileSpreadsheet, Mic, MousePointerClick, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Textarea, cn } from '@/components/ui'
import { iaService, proveedoresService } from '@/services'
import { TAREAS_IA, tareaIA, validarEntradaIA, mensajeErrorIA, proveedorCoincidente, resumenFactura, tieneAsistente, mensajeBienvenida, historialParaEnviar, validarMensajeChat, PLACEHOLDER_CHAT, CHAT } from '@/domain/ia'
import { bloques, inline } from '@/domain/markdown'
import { formatCLP } from '@/domain/money'
import { formatFecha } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useAsistenteStore } from '@/stores/asistenteStore'
import { guiarA, ejecutarPlan } from '@/lib/guiaCursor'
import { useDictado } from '@/hooks/useDictado'
import { normalizarRespuestaIA } from '@/domain/respuestaIA'
import { catalogoDeRutas, resolverAccion, planDeAcciones, resumenDePlan } from './agente'

const copiar = async (texto) => {
  try { await navigator.clipboard.writeText(texto); toast.success('Copiado') } catch { toast.error('No se pudo copiar') }
}

const FORMATO_REPORTE = { xlsx: 'Excel', docx: 'Word', pptx: 'PowerPoint' }

/** Botón de descarga de un reporte generado por el agente (se baja con la sesión; el enlace directo no la llevaría). */
function BotonReporte({ archivo }) {
  const [bajando, setBajando] = useState(false)
  const descargar = async () => {
    setBajando(true)
    try {
      await iaService.descargarReporte(archivo)
    } catch (err) {
      toast.error(err?.message || 'No se pudo descargar el archivo.')
    } finally {
      setBajando(false)
    }
  }
  return (
    <button type="button" onClick={descargar} disabled={bajando}
      className="mt-2 flex w-full items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-left text-sm font-semibold text-brand hover:bg-brand/10 disabled:opacity-60">
      <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{archivo.nombre}<span className="block text-[11px] font-normal text-ink-soft">{FORMATO_REPORTE[archivo.formato] ?? archivo.formato} · {archivo.filas} filas</span></span>
      <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{bajando ? 'Descargando…' : 'Descargar reporte'}</span>
    </button>
  )
}

const Dato = ({ etiqueta, valor }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{etiqueta}</dt>
    <dd className="truncate text-sm font-medium text-ink">{valor ?? <span className="font-normal text-ink-faint">no encontrado</span>}</dd>
  </div>
)

function ResultadoFactura({ datos, onNueva, onUsar, puedeUsar }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-white p-3">
        <div className="col-span-2"><Dato etiqueta="Proveedor" valor={datos.proveedor} /></div>
        <Dato etiqueta="RUT" valor={datos.rut_proveedor} />
        <Dato etiqueta="N° factura" valor={datos.numero_factura} />
        <Dato etiqueta="Fecha" valor={datos.fecha && formatFecha(datos.fecha)} />
        <Dato etiqueta="Neto" valor={datos.monto_neto !== null && formatCLP(datos.monto_neto)} />
        <Dato etiqueta="IVA" valor={datos.iva !== null && formatCLP(datos.iva)} />
        <Dato etiqueta="Total" valor={datos.total !== null && formatCLP(datos.total)} />
      </dl>
      {datos.advertencias.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-warn-bg p-3 text-xs text-warn" aria-label="Advertencias">
          {datos.advertencias.map((a) => <li key={a} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</li>)}
        </ul>
      )}
      <p className="flex gap-1.5 text-xs text-ink-soft"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />La IA puede equivocarse: revisa estos datos con la factura antes de guardarlos.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {puedeUsar && <Button icon={FilePlus2} onClick={onUsar} className="sm:col-span-2">Usar en una factura nueva</Button>}
        <Button variant="secondary" icon={Copy} onClick={() => copiar(resumenFactura(datos))}>Copiar datos</Button>
        <Button variant="ghost" icon={RotateCcw} onClick={onNueva}>Otra factura</Button>
      </div>
    </div>
  )
}

function ResultadoReporte({ informe, setInforme, onNueva }) {
  return (
    <div className="space-y-3">
      <Textarea label="Informe redactado (puedes editarlo)" rows={7} value={informe} onChange={(e) => setInforme(e.target.value)} />
      <p className="flex gap-1.5 text-xs text-ink-soft"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />Revisa que describa lo que realmente hiciste. Pégalo en las observaciones de tu hoja de servicio.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button icon={Copy} onClick={() => copiar(informe)}>Copiar informe</Button>
        <Button variant="ghost" icon={RotateCcw} onClick={onNueva}>Otro reporte</Button>
      </div>
    </div>
  )
}

/** Texto de una respuesta del asistente: Markdown ligero dibujado con elementos de React (nunca como HTML). */
function TextoMarkdown({ texto }) {
  const frag = (t) => inline(t).map((f, k) => (typeof f === 'string' ? f : f.t === 'b' ? <strong key={k}>{f.v}</strong> : <code key={k} className="rounded bg-slate-100 px-1 font-mono text-[0.85em]">{f.v}</code>))
  return (
    <div className="space-y-2 break-words text-sm leading-relaxed">
      {bloques(texto).map((b, k) => {
        if (b.tipo === 'hr') return <hr key={k} className="border-line" />
        if (b.tipo === 'h') return <p key={k} className="font-semibold text-ink">{frag(b.texto)}</p>
        if (b.tipo === 'ul') return <ul key={k} className="list-disc space-y-0.5 pl-5">{b.items.map((it, j) => <li key={j}>{frag(it)}</li>)}</ul>
        if (b.tipo === 'ol') return <ol key={k} className="list-decimal space-y-0.5 pl-5">{b.items.map((it, j) => <li key={j}>{frag(it)}</li>)}</ol>
        return <p key={k} className="whitespace-pre-line">{frag(b.texto)}</p>
      })}
    </div>
  )
}

/** Conversación abierta. El historial vive solo aquí (en memoria): no se guarda ni en el navegador ni en el servidor. */
function Conversacion({ activo, onCerrar }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [mensajes, setMensajes] = useState(() => [mensajeBienvenida()])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const fin = useRef(null)
  const campo = useRef(null)
  const n = useRef(0)
  const setTrabajando = useAsistenteStore((s) => s.setTrabajando)
  // Dictado por voz: lo dicho aparece en el cuadro de mensaje (no se envía solo: lo revisas y envías tú).
  const textoActual = useRef('') // siempre el texto más reciente (el dictado lo actualiza más rápido que React)
  const enviarRef = useRef(null)
  const dictado = useDictado({
    onTexto: (t) => { const v = t.slice(0, CHAT.maxCharsMensaje); textoActual.current = v; setTexto(v); setError(null) },
    // Al tocar el micrófono para terminar, se envía solo lo dictado (si hay algo); el navegador ya entregó la última frase.
    onTerminar: () => { if (textoActual.current.trim()) enviarRef.current?.(null, textoActual.current) },
  })
  useEffect(() => { if (!activo) dictado.detener() }, [activo]) // eslint-disable-line react-hooks/exhaustive-deps -- al cerrar el panel se apaga el micrófono

  useEffect(() => { if (activo) campo.current?.focus() }, [activo])
  useEffect(() => { fin.current?.scrollIntoView?.({ block: 'end' }) }, [mensajes, cargando, error])

  const enviar = async (e, textoEnviar) => {
    e?.preventDefault()
    if (cargando) return
    dictado.detener() // si estaba dictando, se corta antes de enviar (sin envío automático: ya se está enviando)
    const contenido = textoEnviar ?? texto
    const v = validarMensajeChat(contenido)
    if (!v.ok) { setError(v.error); return }
    const nuevo = { id: `u${++n.current}`, role: 'user', content: contenido.trim() }
    const lista = [...mensajes, nuevo]
    setMensajes(lista)
    setTexto('')
    textoActual.current = ''
    setError(null)
    setCargando(true)
    setTrabajando(true) // enciende el resplandor del borde mientras la IA trabaja
    try {
      // Solo lectura: el servidor propone una pantalla o una búsqueda; aquí se vuelve a validar y recién entonces se navega.
      const catalogo = catalogoDeRutas(user)
      const r = await iaService.conversar(historialParaEnviar(lista), catalogo, window.location.pathname)
      const accion = resolverAccion(r, catalogo, user.rol)
      // Copiloto: el servidor autoriza una lista de acciones de interfaz (`ui_actions`) y aquí se vuelven a validar antes de ejecutarlas.
      const plan = planDeAcciones(r.ui_actions, catalogo, user.rol, accion)
      const limpia = normalizarRespuestaIA(r.respuesta_texto ?? r.respuesta, r.opciones) // si llegó JSON crudo, solo se muestra el mensaje
      setMensajes((m) => [...m, { id: `a${++n.current}`, role: 'assistant', content: limpia.texto, accion: plan.length ? null : accion, plan, archivo: r.archivo ?? null, calculo: r.calculo ?? null,
        opciones: limpia.opciones, bloqueado: r.estado_seguridad === 'BLOQUEADO_POR_ROL', motor: r.motor }])
      // El cursor del agente recorre el camino a la vista; con el panel acoplado a la derecha (pantalla grande) no tapa lo que se trabaja.
      if ((accion?.ancla || plan.some((p) => p.tipo !== 'NAVIGATE')) && !window.matchMedia('(min-width: 1024px)').matches) onCerrar?.() // en pantallas chicas el chat flota encima: se esconde (la conversación se conserva)
      if (r.archivo?.autodescarga) iaService.descargarReporte(r.archivo).catch((err) => toast.error(err?.message || 'No se pudo descargar el archivo. Usa el botón del mensaje.')) // descarga silenciosa; el botón queda como respaldo
      if (plan.length) await ejecutarPlan(plan, navigate)
      else if (accion) await guiarA(accion.url, navigate) // respuesta sin `ui_actions` (servidor anterior): se navega como siempre
    } catch (err) {
      setError(mensajeErrorIA(err))
      setTexto(nuevo.content) // no se pierde lo escrito: se puede reenviar
      textoActual.current = nuevo.content
      setMensajes((m) => m.filter((x) => x.id !== nuevo.id))
    } finally {
      setCargando(false)
      setTrabajando(false)
    }
  }
  enviarRef.current = enviar // la versión más reciente, para el envío automático al terminar de dictar
  const nueva = () => { setMensajes([mensajeBienvenida()]); setTexto(''); setError(null) }
  const hayConversacion = mensajes.length > 1

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {mensajes.map((m) => (
          <div key={m.id ?? m.content} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[88%] rounded-2xl px-3.5 py-2.5', m.role === 'user' ? 'rounded-br-md bg-brand text-white' : m.bloqueado ? 'rounded-bl-md border border-crit/50 bg-crit-bg text-ink' : 'rounded-bl-md border border-line bg-white text-ink')}>
              {m.bloqueado && <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-crit"><ShieldAlert className="h-3 w-3" />Fuera del ámbito de tu perfil</p>}
              {m.role === 'user' ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p> : <TextoMarkdown texto={m.content} />}
              {m.calculo && (
                // Cifras calculadas por el servidor, mostradas tal cual: no dependen de cómo las redacte el modelo.
                <div className="mt-2 rounded-lg border border-line bg-slate-50 p-2.5">
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint"><ShieldCheck className="h-3 w-3" />Cálculo del sistema</p>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-ink">{m.calculo}</p>
                </div>
              )}
              {m.archivo && <BotonReporte archivo={m.archivo} />}
              {m.accion && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-brand"><Compass className="h-3 w-3" />{m.accion.busqueda ? `Busqué «${m.accion.busqueda}» en ${m.accion.etiqueta}` : `Te llevé a ${m.accion.etiqueta}`}</p>
              )}
              {m.plan?.length > 0 && <p className="mt-1.5 flex items-start gap-1 text-[11px] font-semibold text-brand"><MousePointerClick className="mt-px h-3 w-3 shrink-0" />{resumenDePlan(m.plan)}</p>}
              {m.opciones?.length > 0 && m.id === mensajes.at(-1)?.id && (
                // Respuestas rápidas: el agente pregunta en vez de adivinar; un toque envía la opción como si la hubieras escrito.
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.opciones.map((o) => <button key={o} type="button" disabled={cargando} onClick={() => enviar(null, o)} className="rounded-full border border-brand/40 bg-brand-tint px-3 py-1 text-xs font-medium text-brand hover:bg-brand hover:text-white disabled:opacity-50">{o}</button>)}
                </div>
              )}
              {m.role === 'assistant' && !m.local && (
                <button type="button" onClick={() => copiar(m.content)} className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-ink-faint hover:text-ink"><Copy className="h-3 w-3" />Copiar</button>
              )}
            </div>
          </div>
        ))}
        {cargando && (
          <div className="flex justify-start" role="status" aria-label="El asistente está escribiendo">
            <div className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3">
              {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${i * 120}ms` }} />)}
            </div>
          </div>
        )}
        <div ref={fin} />
      </div>
      <form onSubmit={enviar} className="space-y-2 border-t border-line bg-white p-3">
        {(error || dictado.error) && <p role="alert" className="text-sm font-medium text-crit">{error || dictado.error}</p>}
        {dictado.escuchando && <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-crit"><span className="h-2 w-2 animate-pulse rounded-full bg-crit motion-reduce:animate-none" aria-hidden="true" />Escuchando… habla y toca el micrófono para terminar y enviar.</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={campo} rows={2} value={texto} maxLength={CHAT.maxCharsMensaje} aria-label="Escribe tu mensaje al asistente" placeholder={PLACEHOLDER_CHAT}
            onChange={(e) => { setTexto(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) enviar(e) }}
            className="min-h-[3.25rem] flex-1 resize-none rounded-xl border border-line-strong bg-white px-3 py-2 text-sm placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {dictado.soportado && (
            <button type="button" onClick={() => (dictado.escuchando ? dictado.detener({ enviar: true }) : dictado.iniciar(texto))} aria-pressed={dictado.escuchando}
              aria-label={dictado.escuchando ? 'Terminar el dictado y enviar' : 'Dictar con la voz'} title={dictado.escuchando ? 'Terminar y enviar' : 'Dictar con la voz'}
              className={cn('relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                dictado.escuchando ? 'border-crit bg-crit text-white hover:bg-crit/90' : 'border-line-strong bg-white text-ink-soft hover:border-brand hover:text-brand')}>
              {dictado.escuchando && <span className="absolute inset-0 animate-ping rounded-xl bg-crit/40 motion-reduce:hidden" aria-hidden="true" />}
              <Mic className="relative h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <button type="submit" disabled={cargando || !texto.trim()} aria-label="Enviar mensaje"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-dark disabled:opacity-40"><SendHorizontal className="h-5 w-5" /></button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-snug text-ink-faint">La IA puede equivocarse: revisa lo importante. No pegues claves ni datos sensibles de otras personas.</p>
          {hayConversacion && <button type="button" onClick={nueva} className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand-dark"><MessageSquarePlus className="h-3.5 w-3.5" />Nueva</button>}
        </div>
      </form>
    </div>
  )
}

/** Tarea estructurada (leer factura / redactar informe): formulario con resultado editable para autocompletar otros módulos. */
function PanelTarea({ tarea, onUsarFactura }) {
  const user = useAuthStore((s) => s.user)
  const cfg = TAREAS_IA[tarea]
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [informe, setInforme] = useState('')
  const valida = validarEntradaIA(tarea, texto)

  const enviar = async (e) => {
    e.preventDefault()
    if (!valida.ok) { setError(valida.error); return }
    setCargando(true)
    setError(null)
    try {
      if (tarea === 'factura') setResultado(await iaService.extraerFactura(texto.trim()))
      else { const r = await iaService.redactarReporte(texto.trim()); setInforme(r.informe); setResultado(r) }
    } catch (err) {
      setError(mensajeErrorIA(err))
    } finally {
      setCargando(false)
    }
  }
  const nueva = () => { setResultado(null); setTexto(''); setError(null); setInforme('') }

  return (
    <div className="space-y-3 overflow-y-auto p-4">
      {resultado ? (
        tarea === 'factura'
          ? <ResultadoFactura datos={resultado} onNueva={nueva} onUsar={() => onUsarFactura(resultado)} puedeUsar={can(user.rol, 'compras.registrar')} />
          : <ResultadoReporte informe={informe} setInforme={setInforme} onNueva={nueva} />
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <p className="text-sm text-ink-soft">{cfg.ayuda}</p>
          <Textarea label={cfg.etiqueta} rows={tarea === 'factura' ? 7 : 5} placeholder={cfg.placeholder} value={texto} maxLength={cfg.max}
            onChange={(e) => { setTexto(e.target.value); setError(null) }} hint={`${texto.length.toLocaleString('es-CL')} / ${cfg.max.toLocaleString('es-CL')} caracteres`} />
          {error && <p role="alert" className="text-sm font-medium text-crit">{error}</p>}
          <Button type="submit" className="w-full" icon={Sparkles} loading={cargando} disabled={!texto.trim()}>{cfg.boton}</Button>
        </form>
      )}
    </div>
  )
}

/**
 * Asistente de IA flotante: un botón redondo abre un chat con el perfil de tu rol. Quien lee facturas (Finanzas, Administrador)
 * o redacta informes (Operaciones, Técnico) también tiene esa herramienta en la segunda pestaña.
 * El perfil del asistente lo fija el servidor según el rol de la sesión; aquí el usuario solo conversa.
 * @param {{posicion?: 'fijo'|'marco'}} props `marco`: dentro del marco del teléfono de la app de terreno.
 */
export function AsistenteIA({ posicion = 'fijo' }) {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const tarea = tareaIA(user?.rolApi)
  const abierto = useAsistenteStore((s) => s.abierto)
  const setAbierto = useAsistenteStore((s) => s.setAbierto)
  const [modo, setModo] = useState('chat')

  useEffect(() => {
    if (!abierto) return undefined
    const alTecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [abierto])

  if (!tieneAsistente(user?.rolApi)) return null
  const marco = posicion === 'marco'

  const usarEnFactura = async (factura) => {
    let proveedor_id = ''
    try { proveedor_id = proveedorCoincidente(factura, await proveedoresService.list())?.id ?? '' } catch { /* sin acceso a proveedores: se elige a mano */ }
    setAbierto(false)
    navigate('/erp/compras', { state: { facturaIA: { proveedor_id, numero: factura.numero_factura ?? '', fecha: factura.fecha ?? '' } } })
  }
  const pestana = (id, etiqueta) => (
    <button type="button" role="tab" aria-selected={modo === id} onClick={() => setModo(id)}
      className={cn('flex-1 border-b-2 px-3 py-2 text-sm font-medium', modo === id ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>{etiqueta}</button>
  )

  return (
    <>
      {/* Siempre montado y oculto al cerrar: así la conversación no se pierde al cerrar el asistente. */}
      {(
        <section
          role="dialog" aria-label="Asistente de IA" aria-hidden={!abierto}
          className={cn(
            'z-30 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop', !abierto && 'hidden',
            marco ? 'absolute inset-x-3 bottom-20 h-[78%]'
              // Pantallas chicas: ventana flotante. Desde `lg`: panel acoplado a todo el alto del borde derecho (el ERP se corre y no queda tapado).
              : 'fixed bottom-24 right-4 h-[min(36rem,calc(100vh-7rem))] w-[min(26rem,calc(100vw-2rem))] sm:right-6 lg:bottom-0 lg:right-0 lg:top-0 lg:h-auto lg:w-[23rem] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none',
          )}
        >
          <header className="flex items-center gap-3 bg-gradient-to-br from-deep to-[#164563] px-4 py-3 text-white">
            <Sparkles className="h-5 w-5 shrink-0 text-ice" aria-hidden="true" />
            <div className="min-w-0 flex-1"><h2 className="t-display text-lg leading-tight">Asistente IA</h2><p className="truncate text-xs text-white/70">Tu ayudante de trabajo en FYAG</p></div>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar el asistente" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </header>
          {tarea && <div role="tablist" className="flex border-b border-line bg-white">{pestana('chat', 'Conversar')}{pestana('tarea', TAREAS_IA[tarea].corto)}</div>}
          {/* Conversacion queda montada aunque se cambie de pestaña: no se pierde lo hablado */}
          <div className={cn('min-h-0 flex-1 flex-col', modo === 'chat' ? 'flex' : 'hidden')}><Conversacion activo={abierto && modo === 'chat'} onCerrar={() => setAbierto(false)} /></div>
          {tarea && modo === 'tarea' && <div className="flex min-h-0 flex-1 flex-col overflow-y-auto"><PanelTarea tarea={tarea} onUsarFactura={usarEnFactura} /></div>}
        </section>
      )}
      <button
        type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-label={abierto ? 'Cerrar el asistente de IA' : 'Abrir el asistente de IA'}
        className={cn(
          'z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lift transition-transform hover:bg-brand-dark active:scale-95',
          marco ? 'absolute bottom-4 right-4' : 'fixed bottom-5 right-4 sm:right-6', !marco && abierto && 'lg:hidden', // acoplado, el panel ya trae su botón de cerrar
        )}
      >
        {abierto ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </>
  )
}
