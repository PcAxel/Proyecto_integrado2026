import { useEffect, useState } from 'react'
import { AlertTriangle, BrainCircuit, CircleHelp, Lock, MessageSquareText, MousePointerClick, RefreshCw, ShieldAlert, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button, Card, Input, Select, Badge, Mono, KpiTile, Skeleton, EmptyState, Drawer, Tabs, cn } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { ROL_API_LABEL } from '@/components/domain'
import { useResource } from '@/hooks/useResource'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'
import { formatFechaHora } from '@/domain/format'
import { iaService } from '@/services'

const REFRESCO_MS = 10_000
const ESTADO = {
  PERMITIDO: { label: 'Permitido', tone: 'ok', icon: ShieldCheck },
  BLOQUEADO_POR_ROL: { label: 'Bloqueado por rol', tone: 'crit', icon: Lock },
  REQUIERE_ACLARACION: { label: 'Pidió aclaración', tone: 'info', icon: CircleHelp },
}
const RIESGO = { BAJO: { label: 'Bajo', tone: 'neutral' }, MEDIO: { label: 'Medio', tone: 'warn' }, ALTO: { label: 'Alto', tone: 'crit' } }
const MOTOR = { ia: 'Proveedor de IA', local: 'Motor del sistema', politica: 'Control de seguridad' }
const ACCION = { NAVIGATE: 'Navegar', SEARCH_OR_FILTER: 'Buscar o filtrar', HIGHLIGHT_ELEMENT: 'Resaltar', FILL_FORM: 'Completar formulario' }
const INTERRUPTORES = [
  ['agente_activo', 'Asistente activo', 'Apagado: el agente no responde a este rol'],
  ['permite_navegar', 'Navegar', 'Llevar a la persona a sus pantallas'],
  ['permite_buscar', 'Buscar y filtrar', 'Aplicar un filtro en una lista'],
  ['permite_resaltar', 'Resaltar', 'Señalar indicadores y alertas'],
  ['permite_rellenar', 'Completar formularios', 'Nunca los envía: confirma la persona'],
  ['permite_reportes', 'Reportes y cálculos', 'Archivos y proyecciones con datos'],
]
const esAlerta = (f) => f.estado_seguridad === 'BLOQUEADO_POR_ROL' || f.nivel_riesgo === 'ALTO'
const detalleAccion = (a) => (a.tipo === 'NAVIGATE' ? a.etiqueta || a.ruta : a.tipo === 'SEARCH_OR_FILTER' ? `«${a.texto}» en ${a.ruta}` : a.tipo === 'HIGHLIGHT_ELEMENT' ? a.descripcion || a.objetivo
  : `${a.nombre}: ${Object.keys(a.campos ?? {}).join(', ')}`)

function Interruptor({ activo, onChange, disabled, etiqueta }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={disabled} onClick={() => onChange(!activo)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand', activo ? 'bg-ok' : 'bg-slate-300', disabled && 'cursor-not-allowed opacity-60')}>
      <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', activo && 'translate-x-5')} />
    </button>
  )
}

/** Derechos y deberes del agente para cada rol. Los temas salen de la matriz de permisos; los interruptores los fija TI. */
function Politicas({ gestiona }) {
  const { data, error, loading, reload } = useResource(() => iaService.politicas(), [])
  const [local, setLocal] = useState(null) // copia editable, para reflejar el cambio al instante
  const [guardando, setGuardando] = useState(null)
  useEffect(() => { if (data) setLocal(data) }, [data])

  const cambiar = async (rol, campo, valor) => {
    const previo = local
    setLocal(local.map((p) => (p.rol === rol ? { ...p, [campo]: valor } : p)))
    setGuardando(`${rol}:${campo}`)
    try {
      const r = await iaService.cambiarPolitica(rol, { [campo]: valor })
      setLocal((l) => l.map((p) => (p.rol === rol ? r : p)))
      toast.success(`Política del agente actualizada para ${ROL_API_LABEL[rol] ?? rol}`)
    } catch (e) { setLocal(previo); toast.error(e.message) } finally { setGuardando(null) }
  }

  if (error) return <ErrorEstado error={error} onReintentar={reload} />
  if (!local) return <Skeleton rows={6} />
  return (
    <div className="space-y-4">
      {!gestiona && <p className="rounded-lg bg-slate-50 p-3 text-sm text-ink-soft">Vista de solo lectura: los derechos y deberes del agente los cambia el área de TI.</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {local.map((p) => (
          <section key={p.rol} className={cn('rounded-xl border p-4', p.agente_activo ? 'border-line' : 'border-crit/40 bg-crit-bg/40')}>
            <header className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{ROL_API_LABEL[p.rol] ?? p.rol_texto}</h3>
              <Badge tone={p.agente_activo ? 'ok' : 'crit'}>{p.agente_activo ? 'Asistente activo' : 'Asistente apagado'}</Badge>
            </header>
            <dl className="mt-3 grid gap-2 text-xs">
              <div><dt className="font-semibold text-ok">Puede tratar</dt><dd className="text-ink-soft">{p.temas_permitidos.join(' · ') || 'Solo orientación general'}</dd></div>
              <div><dt className="font-semibold text-crit">Rechaza y registra</dt><dd className="text-ink-soft">{p.temas_vedados.join(' · ') || 'Nada: visión transversal'}</dd></div>
            </dl>
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {INTERRUPTORES.map(([campo, titulo, ayuda]) => (
                <li key={campo} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0"><p className="text-sm font-medium">{titulo}</p><p className="text-xs text-ink-soft">{ayuda}</p></div>
                  <Interruptor activo={p[campo]} etiqueta={`${titulo} para ${ROL_API_LABEL[p.rol] ?? p.rol}`} disabled={!gestiona || guardando === `${p.rol}:${campo}` || (campo !== 'agente_activo' && !p.agente_activo)} onChange={(v) => cambiar(p.rol, campo, v)} />
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0"><p className="text-sm font-medium">Acciones automáticas por respuesta</p><p className="text-xs text-ink-soft">Máximo que el cursor ejecuta sin que la persona intervenga</p></div>
                <select aria-label={`Límite de acciones para ${ROL_API_LABEL[p.rol] ?? p.rol}`} value={p.max_acciones} disabled={!gestiona || !p.agente_activo} onChange={(ev) => cambiar(p.rol, 'max_acciones', Number(ev.target.value))}
                  className="h-9 rounded-lg border border-line-strong bg-surface px-2 font-mono text-sm disabled:opacity-60">
                  {[0, 1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </li>
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function DetalleDrawer({ fila, onClose }) {
  const e = ESTADO[fila.estado_seguridad]
  return (
    <Drawer open onClose={onClose} title="Detalle del prompt" width="max-w-xl">
      <div className="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={e.tone} icon={e.icon}>{e.label}</Badge>
          <Badge tone={RIESGO[fila.nivel_riesgo].tone}>Riesgo {RIESGO[fila.nivel_riesgo].label.toLowerCase()}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {[['Usuario', `${fila.usuario} · ${fila.email}`], ['Rol en ese momento', ROL_API_LABEL[fila.rol_activo] ?? fila.rol_texto], ['Fecha y hora', formatFechaHora(fila.timestamp)], ['Pantalla de origen', fila.modulo_origen || '—'],
            ['Respondió', MOTOR[fila.motor] ?? '—'], ['Latencia / tokens', `${fila.latencia_ms} ms · ~${fila.tokens_estimados} tokens`]].map(([t, v]) => (
            <div key={t}><dt className="text-xs text-ink-soft">{t}</dt><dd className="break-words font-medium">{v}</dd></div>
          ))}
        </dl>
        {fila.motivo && <p className={cn('rounded-lg p-3', esAlerta(fila) ? 'bg-crit-bg text-crit' : 'bg-slate-50 text-ink-soft')}><span className="font-semibold">Motivo: </span>{fila.motivo}</p>}
        <section><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Prompt enviado</h3><p className="whitespace-pre-wrap break-words rounded-lg border border-line p-3">{fila.prompt_enviado}</p></section>
        <section><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Respuesta del agente</h3><p className="whitespace-pre-wrap break-words rounded-lg border border-line p-3">{fila.respuesta_ia || '—'}</p></section>
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Acciones de interfaz autorizadas</h3>
          {fila.acciones_ui_ejecutadas.length === 0 ? <p className="text-ink-soft">Ninguna: el agente solo respondió con texto.</p> : (
            <ol className="space-y-1.5">{fila.acciones_ui_ejecutadas.map((a, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-line p-2"><MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" /><span><span className="font-semibold">{ACCION[a.tipo] ?? a.tipo}</span> · {detalleAccion(a)}</span></li>
            ))}</ol>
          )}
        </section>
        <p className="text-xs text-ink-soft">Registro inmutable: no se puede editar ni eliminar.</p>
      </div>
    </Drawer>
  )
}

/** Gobernanza IA (área de TI): trazabilidad en vivo de los prompts y derechos y deberes del agente por rol. */
export function GobernanzaIAPage() {
  const rol = useAuthStore((s) => s.user?.rol)
  const gestiona = can(rol, 'gobernanza_ia.gestionar')
  const [tab, setTab] = useState('bitacora')
  const [f, setF] = useState({ usuario: '', rol: '', estado: '', riesgo: '', desde: '', hasta: '', alertas: false })
  const [enVivo, setEnVivo] = useState(true)
  const [sel, setSel] = useState(null)
  const { data, error, loading, reload } = useResource(() => iaService.bitacora(f), [f.usuario, f.rol, f.estado, f.riesgo, f.desde, f.hasta, f.alertas])
  // «En vivo»: la tabla se vuelve a pedir cada 10 s mientras la pestaña esté visible y no haya un detalle abierto.
  useEffect(() => {
    if (!enVivo || tab !== 'bitacora' || sel) return undefined
    const id = setInterval(() => { if (!document.hidden) reload() }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [enVivo, tab, sel, reload])
  const set = (k) => (ev) => setF((x) => ({ ...x, [k]: ev.target.value }))
  const r = data?.resumen

  return (
    <div className="space-y-6">
      <PageHeader title="Gobernanza IA" subtitle="Trazabilidad de cada consulta al agente, alertas de seguridad y lo que la IA puede hacer para cada rol"
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload} loading={loading && Boolean(data)}>Actualizar</Button>} />

      {r && (
        <section aria-label="Resumen de la bitácora" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiTile label="Consultas registradas" value={r.total} icon={MessageSquareText} hint={`${r.ultimas_24h} en las últimas 24 h`} />
          <KpiTile label="Bloqueadas por rol" value={r.bloqueados} icon={Lock} tone={r.bloqueados ? 'crit' : 'ok'} hint="Pidieron datos de otra área" />
          <KpiTile label="Riesgo alto" value={r.riesgo_alto} icon={ShieldAlert} tone={r.riesgo_alto ? 'crit' : 'ok'} hint="Intentos de acceso no autorizado" />
          <KpiTile label="Aclaraciones" value={r.aclaraciones} icon={CircleHelp} hint="El agente preguntó en vez de adivinar" />
          <KpiTile label="Tokens estimados" value={r.tokens_estimados.toLocaleString('es-CL')} icon={Zap} hint="≈ 4 caracteres por token" />
        </section>
      )}

      <Card padded={false}>
        <div className="px-5 pt-3"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'bitacora', label: 'Trazabilidad de prompts', count: data?.coincidencias }, { id: 'politicas', label: 'Derechos y deberes del agente' }]} /></div>

        {tab === 'bitacora' && (
          <div data-agent-target="bitacora-prompts">
            <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-6">
              <Input label="Usuario" placeholder="correo…" value={f.usuario} onChange={set('usuario')} />
              <Select label="Rol" value={f.rol} onChange={set('rol')} options={[{ value: '', label: 'Todos' }, ...Object.entries(ROL_API_LABEL).filter(([k]) => k !== 'AUDITOR').map(([value, label]) => ({ value, label }))]} />
              <Select label="Estado" value={f.estado} onChange={set('estado')} options={[{ value: '', label: 'Todos' }, ...Object.entries(ESTADO).map(([value, e]) => ({ value, label: e.label }))]} />
              <Select label="Riesgo" value={f.riesgo} onChange={set('riesgo')} options={[{ value: '', label: 'Todos' }, ...Object.entries(RIESGO).map(([value, e]) => ({ value, label: e.label }))]} />
              <Input label="Desde" type="date" value={f.desde} onChange={set('desde')} />
              <Input label="Hasta" type="date" value={f.hasta} onChange={set('hasta')} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-sm">
              <label className="flex items-center gap-2 font-medium text-crit"><input type="checkbox" className="h-4 w-4 accent-[#C4372B]" checked={f.alertas} onChange={(ev) => setF((x) => ({ ...x, alertas: ev.target.checked }))} /><AlertTriangle className="h-4 w-4" aria-hidden="true" />Solo alertas de seguridad</label>
              <label className="flex items-center gap-2 text-ink-soft"><span className={cn('h-2 w-2 rounded-full', enVivo ? 'animate-pulse bg-ok motion-reduce:animate-none' : 'bg-slate-300')} aria-hidden="true" />En vivo (cada 10 s)<Interruptor activo={enVivo} onChange={setEnVivo} etiqueta="Actualización en vivo" /></label>
            </div>
            {error ? <ErrorEstado error={error} onReintentar={reload} /> : !data ? <Skeleton rows={8} /> : data.filas.length === 0 ? <EmptyState icon={BrainCircuit} title="Sin consultas con esos filtros" hint="Cada mensaje al asistente queda registrado aquí." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-ink-soft"><tr>{['Fecha', 'Usuario y rol', 'Origen', 'Prompt', 'Acciones', 'Seguridad', 'Riesgo'].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {data.filas.map((x) => {
                      const e = ESTADO[x.estado_seguridad]
                      return (
                        <tr key={x.id} tabIndex={0} onClick={() => setSel(x)} onKeyDown={(ev) => { if (ev.key === 'Enter') setSel(x) }}
                          className={cn('cursor-pointer border-t border-line align-top hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand', esAlerta(x) && 'border-l-4 border-l-crit bg-crit-bg/60 hover:bg-crit-bg')}>
                          <td className="whitespace-nowrap px-4 py-2.5"><Mono className="text-xs">{formatFechaHora(x.timestamp)}</Mono></td>
                          <td className="px-4 py-2.5"><p className="font-medium">{x.usuario}</p><p className="text-xs text-ink-soft">{ROL_API_LABEL[x.rol_activo] ?? x.rol_texto}</p></td>
                          <td className="px-4 py-2.5"><Mono className="text-xs text-ink-soft">{x.modulo_origen || '—'}</Mono></td>
                          <td className="max-w-[26rem] px-4 py-2.5"><p className={cn('line-clamp-2', esAlerta(x) && 'font-medium text-crit')}>{x.prompt_enviado}</p>{x.motivo && <p className="mt-0.5 text-xs text-ink-soft">{x.motivo}</p>}</td>
                          <td className="px-4 py-2.5 text-xs">{x.acciones_ui_ejecutadas.length ? x.acciones_ui_ejecutadas.map((a) => ACCION[a.tipo] ?? a.tipo).join(' → ') : <span className="text-ink-soft">—</span>}</td>
                          <td className="whitespace-nowrap px-4 py-2.5"><Badge tone={e.tone} icon={e.icon}>{e.label}</Badge></td>
                          <td className="whitespace-nowrap px-4 py-2.5"><Badge tone={RIESGO[x.nivel_riesgo].tone}>{RIESGO[x.nivel_riesgo].label}</Badge></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {data.coincidencias > data.filas.length && <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">Se muestran las {data.filas.length} más recientes de {data.coincidencias}. Acota con los filtros para ver las anteriores.</p>}
              </div>
            )}
          </div>
        )}

        {tab === 'politicas' && (
          <div className="p-4" data-agent-target="politicas-ia">
            <p className="mb-4 flex items-start gap-2 text-sm text-ink-soft"><SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Los temas que cada rol puede tratar salen de la matriz de permisos del sistema. Aquí se decide qué acciones puede ejecutar el agente en pantalla para cada rol. Los cambios rigen desde la siguiente consulta.</p>
            <Politicas gestiona={gestiona} />
          </div>
        )}
      </Card>

      {sel && <DetalleDrawer fila={sel} onClose={() => setSel(null)} />}
    </div>
  )
}
