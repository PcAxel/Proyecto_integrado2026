import { useState } from 'react'
import { AlertTriangle, CalendarClock, Download, FileBarChart2, Hourglass, Loader2, Printer, RefreshCw, Scale, ShieldAlert, ShieldCheck, Sparkles, TrendingDown, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button, Card, DataTable, Modal, Drawer, Input, Badge, Mono, KpiTile, Skeleton, EmptyState, cn } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { useResource } from '@/hooks/useResource'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'
import { formatFecha, formatPct, fechaLocal } from '@/domain/format'
import { formatCLP } from '@/domain/money'
import { inline } from '@/domain/markdown'
import { bloquesInforme, informeAHtml, sinCursiva } from '@/domain/informe'
import { rrhhService } from '@/services'

/** Niveles del motor de alertas (art. 159 N°4), del más grave al más leve. */
const NIVEL = {
  PASO_AUTOMATICO_INDEFINIDO: { label: 'Paso a indefinido', tone: 'crit', luz: 'bg-crit', icon: ShieldAlert, ayuda: 'Ya se cumple una causal: regularizar hoy' },
  RIESGO_ALTO: { label: 'Riesgo alto', tone: 'crit', luz: 'bg-crit', icon: AlertTriangle, ayuda: 'En 1ª renovación y por vencer, o al borde del límite' },
  RIESGO_BAJO: { label: 'Riesgo bajo', tone: 'warn', luz: 'bg-warn', icon: CalendarClock, ayuda: 'Vence en 30 días o menos: decidir con tiempo' },
  SIN_RIESGO: { label: 'Sin riesgo', tone: 'ok', luz: 'bg-ok', icon: ShieldCheck, ayuda: 'Plazo vigente y dentro de la norma' },
}
const ESTADO_CONTRATO = { VIGENTE: { label: 'Vigente', tone: 'ok' }, FINALIZADO: { label: 'Finalizado', tone: 'neutral' }, ALERTA_INDEFINIDO: { label: 'Alerta de indefinido', tone: 'crit' } }
/** Para quien ya no trabaja aquí el riesgo es de RECONTRATARLO: la etiqueta lo dice así, para no leerlo como un contrato vigente. */
const etiquetaNivel = (p) => (p.situacion === 'ACTIVO' ? NIVEL[p.nivel].label : p.nivel === 'SIN_RIESGO' ? 'Recontratable' : 'No recontratar aún')
const dias = (n) => `${n} día${n === 1 ? '' : 's'}`

/** Altas y bajas por mes: dos barras por mes, con la cifra a la vista (nunca solo color). */
function SerieMensual({ serie }) {
  const max = Math.max(1, ...serie.flatMap((m) => [m.altas, m.bajas]))
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`Altas y bajas de los últimos ${serie.length} meses`}>
        {serie.map((m) => (
          <div key={m.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${m.mes}: ${m.altas} altas, ${m.bajas} bajas, rotación ${formatPct(m.tasa)}`}>
            <div className="flex h-28 w-full items-end justify-center gap-0.5">
              <div className="w-1/2 max-w-[14px] rounded-t bg-ok" style={{ height: `${(m.altas / max) * 100}%`, minHeight: m.altas ? 3 : 0 }} />
              <div className="w-1/2 max-w-[14px] rounded-t bg-crit" style={{ height: `${(m.bajas / max) * 100}%`, minHeight: m.bajas ? 3 : 0 }} />
            </div>
            <span className="font-mono text-[10px] text-ink-soft">{m.mes.slice(5)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ok" />Altas ({serie.reduce((a, m) => a + m.altas, 0)})</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-crit" />Bajas ({serie.reduce((a, m) => a + m.bajas, 0)})</span>
      </p>
    </div>
  )
}

/** Semáforo de los contratos a plazo fijo vigentes. */
function Semaforo({ semaforo }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(NIVEL).map(([clave, n]) => (
        <div key={clave} className="flex items-center gap-3 rounded-lg border border-line p-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white', n.luz, !semaforo[clave] && 'opacity-30')}><n.icon className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold"><span className="font-mono text-lg">{semaforo[clave]}</span> · {n.label}</p>
            <p className="text-xs text-ink-soft">{n.ayuda}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Informe en pantalla: Markdown dibujado con elementos de React (el texto de la IA nunca se interpreta como HTML). */
function Informe({ markdown }) {
  const frag = (t) => inline(sinCursiva(t)).map((f, k) => (typeof f === 'string' ? f : f.t === 'b' ? <strong key={k}>{f.v}</strong> : <code key={k} className="rounded bg-slate-100 px-1 font-mono text-[0.85em]">{f.v}</code>))
  return (
    <div className="space-y-3 break-words text-sm leading-relaxed">
      {bloquesInforme(markdown).map((b, k) => {
        if (b.tipo === 'hr') return <hr key={k} className="border-line" />
        if (b.tipo === 'h') return b.nivel === 1 ? <h3 key={k} className="t-display text-xl">{frag(b.texto)}</h3> : <h4 key={k} className="border-b border-line pb-1 pt-2 text-base font-semibold">{frag(b.texto)}</h4>
        if (b.tipo === 'ul') return <ul key={k} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{frag(it)}</li>)}</ul>
        if (b.tipo === 'ol') return <ol key={k} className="list-decimal space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{frag(it)}</li>)}</ol>
        if (b.tipo === 'tabla') {
          return (
            <div key={k} className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-slate-50 text-xs text-ink-soft"><tr>{b.cabecera.map((c, j) => <th key={j} className="px-3 py-2 font-semibold">{frag(c)}</th>)}</tr></thead>
                <tbody>{b.filas.map((f, j) => <tr key={j} className="border-t border-line align-top">{f.map((c, i) => <td key={i} className="px-3 py-2">{frag(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        return <p key={k} className="whitespace-pre-line">{frag(b.texto)}</p>
      })}
    </div>
  )
}

/** Genera el informe al abrirse y lo muestra con opciones de descarga e impresión. */
function ReporteModal({ onClose }) {
  const { data, error, loading, reload } = useResource(() => rrhhService.reporteRotacion(), [])
  const nombre = `informe-rotacion-${data?.fecha ?? fechaLocal()}`
  const descargar = () => {
    const url = URL.createObjectURL(new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.md` })
    a.click()
    URL.revokeObjectURL(url)
  }
  const imprimir = () => {
    const w = window.open('', '_blank')
    if (!w) { toast.error('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio.'); return }
    w.document.write(informeAHtml(data.markdown, 'Informe Ejecutivo de Rotación y Riesgo Laboral'))
    w.document.close()
    w.focus()
    w.print()
  }
  return (
    <Modal open onClose={onClose} size="lg" title="Informe de Rotación y Riesgo Laboral"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={reload} disabled={loading}>Generar de nuevo</Button>
          <Button variant="secondary" icon={Printer} onClick={imprimir} disabled={!data || loading}>Imprimir / PDF</Button>
          <Button icon={Download} onClick={descargar} disabled={!data || loading}>Descargar (.md)</Button>
        </>
      )}>
      {loading ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center" role="status" aria-live="polite">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
            <Loader2 className="absolute inset-0 h-14 w-14 animate-spin text-brand/50 motion-reduce:animate-none" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold">Analizando el historial de contratos…</p>
            <p className="mt-1 text-sm text-ink-soft">Calculamos la rotación, revisamos cada plazo fijo y redactamos el informe. Puede tardar unos segundos.</p>
          </div>
        </div>
      ) : error ? <ErrorEstado error={error} onReintentar={reload} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.fuente === 'ia' ? 'info' : 'neutral'} icon={data.fuente === 'ia' ? Sparkles : FileBarChart2}>{data.fuente === 'ia' ? 'Redactado con IA' : 'Motor analítico del sistema'}</Badge>
            <span className="text-xs text-ink-soft">Corte al {formatFecha(data.fecha)} · cifras calculadas por el servidor</span>
          </div>
          {data.aviso && <p className="rounded-lg bg-warn-bg p-3 text-sm text-warn">{data.aviso}</p>}
          <Informe markdown={data.markdown} />
        </div>
      )}
    </Modal>
  )
}

/** Renovación de un plazo fijo: la primera alarga el plazo; la segunda solo procede aceptando el paso a indefinido. */
function RenovarForm({ persona, onHecho }) {
  const [fecha, setFecha] = useState('')
  const [aviso, setAviso] = useState(persona.numero_renovacion >= 1 ? 'pendiente' : null) // 'pendiente' = ya tiene 1 renovación
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async (datos, mensaje) => {
    setEnviando(true)
    setError(null)
    try { await rrhhService.renovarContrato(persona.contrato_id, datos); toast.success(mensaje); onHecho() } catch (e) {
      if (e.code === 'segunda_renovacion') setAviso(e.message)
      else setError(e.message)
    } finally { setEnviando(false) }
  }
  if (aviso) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-crit/50 bg-crit-bg p-3 text-sm text-crit">
        <p className="font-semibold">Este contrato ya tiene 1 renovación.</p>
        <p>Una segunda renovación lo convierte en contrato indefinido. Si la empresa decide mantener a la persona, se registra el paso a indefinido; si no, corresponde el finiquito por vencimiento del plazo.</p>
        {error && <p className="font-semibold">{error}</p>}
        <Button variant="danger" size="sm" loading={enviando} onClick={() => enviar({ aceptar_indefinido: true }, 'Contrato convertido a indefinido')}>Pasar a contrato indefinido</Button>
      </div>
    )
  }
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(ev) => { ev.preventDefault(); enviar({ fecha_termino: fecha }, 'Contrato renovado (1ª renovación)') }}>
      <Input label="Nueva fecha de término" type="date" required min={persona.fecha_termino ?? undefined} value={fecha} onChange={(ev) => setFecha(ev.target.value)} error={error} />
      <Button type="submit" size="sm" loading={enviando} icon={RefreshCw}>Renovar plazo</Button>
    </form>
  )
}

/** Historial de contrataciones y línea de tiempo de una persona. */
function HistorialDrawer({ persona, gestiona, onClose, onCambio }) {
  const { data, error, loading, reload } = useResource(() => rrhhService.historialContrataciones(persona.id), [persona.id])
  const r = data?.recontratacion
  const n = data ? NIVEL[data.nivel] : null
  return (
    <Drawer open onClose={onClose} title="Historial de contrataciones" width="max-w-2xl">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {loading && !data ? <Skeleton rows={8} /> : error ? <ErrorEstado error={error} onReintentar={reload} /> : (
          <>
            <div>
              <p className="t-display text-2xl leading-tight">{data.nombre}</p>
              <p className="mt-1 text-sm text-ink-soft">{data.cargo}{data.rut && <> · RUT <Mono>{data.rut}</Mono></>}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={data.situacion === 'ACTIVO' ? 'ok' : 'neutral'}>{data.situacion === 'ACTIVO' ? `Trabaja hoy · ${data.tipo_texto}` : 'Ex trabajador'}</Badge>
                <Badge tone={n.tone} icon={n.icon}>{etiquetaNivel(data)}</Badge>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Tiempo total en la empresa', dias(data.dias_trabajados_total), `${String(data.meses_trabajados_total).replace('.', ',')} meses`],
                ['Últimos 15 meses', dias(data.dias_trabajados_15_meses), `${data.contratos_plazo_15_meses} contrato(s) a plazo`],
                ['Contratos', data.contratos_total, data.primer_ingreso ? `Primer ingreso ${formatFecha(data.primer_ingreso)}` : ''],
                ['Desde su último término', data.dias_desde_ultimo_termino == null ? '—' : dias(data.dias_desde_ultimo_termino), data.dias_desde_ultimo_termino == null ? 'Tiene contrato activo' : 'Laguna laboral'],
              ].map(([t, v, h]) => (
                <div key={t} className="rounded-lg border border-line p-3">
                  <dt className="text-xs text-ink-soft">{t}</dt>
                  <dd className="mt-1 font-mono text-base font-semibold">{v}</dd>
                  <p className="text-[11px] text-ink-soft">{h}</p>
                </div>
              ))}
            </dl>

            {data.mensajes.length > 0 && data.situacion === 'ACTIVO' && (
              <div role="alert" className={cn('space-y-1.5 rounded-lg border p-3 text-sm', n.tone === 'crit' ? 'border-crit/50 bg-crit-bg text-crit' : 'border-warn/40 bg-warn-bg text-warn')}>
                {data.mensajes.map((m) => <p key={m} className={m.startsWith('ADVERTENCIA') ? 'font-semibold' : ''}>{m}</p>)}
              </div>
            )}

            {gestiona && data.situacion === 'ACTIVO' && data.tipo_contrato === 'PLAZO_FIJO' && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Renovar el plazo fijo</h3>
                <RenovarForm persona={data} onHecho={() => { reload(); onCambio() }} />
              </section>
            )}

            {data.situacion !== 'ACTIVO' && (
              <section className={cn('rounded-lg border p-4', r.nivel === 'SIN_RIESGO' ? 'border-ok/40 bg-ok-bg' : 'border-crit/50 bg-crit-bg')}>
                <h3 className={cn('flex items-center gap-2 text-sm font-semibold', r.nivel === 'SIN_RIESGO' ? 'text-ok' : 'text-crit')}><Hourglass className="h-4 w-4" aria-hidden="true" />Ventana para recontratar a plazo fijo</h3>
                {r.nivel === 'SIN_RIESGO' ? (
                  <p className="mt-2 text-sm text-ok">Se puede recontratar a plazo fijo hoy sin activar la presunción de contrato indefinido.</p>
                ) : (
                  <>
                    <p className="mt-2 text-crit"><span className="font-mono text-3xl font-bold">{r.dias_espera ?? '—'}</span> <span className="text-sm font-semibold">días de espera{r.fecha_segura && <> · seguro desde el {formatFecha(r.fecha_segura)}</>}</span></p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-crit">{r.mensajes.slice(0, -1).map((m) => <li key={m}>{m}</li>)}</ul>
                  </>
                )}
                <p className="mt-2 text-xs text-ink-soft">Evaluado para un plazo fijo de {dias(r.duracion_evaluada_dias)} que partiera hoy: {r.contratos_plazo_en_ventana} contrato(s) a plazo y {dias(r.dias_trabajados_en_ventana)} trabajados en los 15 meses anteriores.</p>
              </section>
            )}

            <section>
              <h3 className="mb-3 text-sm font-semibold">Línea de tiempo</h3>
              <ol className="relative space-y-4 border-l-2 border-line pl-5">
                {data.contratos.map((c, i) => {
                  const laguna = data.lagunas.find((l) => l.entre[1] === c.id)
                  const e = ESTADO_CONTRATO[c.estado]
                  return (
                    <li key={c.id} className="relative">
                      <span className={cn('absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-surface', c.estado === 'FINALIZADO' ? 'bg-slate-400' : c.estado === 'VIGENTE' ? 'bg-ok' : 'bg-crit')} aria-hidden="true" />
                      <div className="rounded-lg border border-line p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{c.tipo_texto}</span>
                          <Badge tone={e.tone}>{e.label}</Badge>
                          {c.numero_renovacion > 0 && <Badge tone="warn">{c.numero_renovacion === 1 ? '1ª renovación' : `${c.numero_renovacion} renovaciones`}</Badge>}
                          {i === 0 && data.situacion === 'ACTIVO' && <span className="text-xs text-ink-soft">Contrato actual</span>}
                        </div>
                        <p className="mt-1 text-sm"><Mono>{formatFecha(c.fecha_inicio)}</Mono> → <Mono>{c.fecha_termino ? formatFecha(c.fecha_termino) : 'sin fecha de término'}</Mono></p>
                        <p className="mt-0.5 text-xs text-ink-soft">{dias(c.dias_trabajados_acumulados)} trabajados{c.motivo_texto && <> · Término: {c.motivo_texto}</>}</p>
                      </div>
                      {laguna && <p className="mt-3 text-xs text-ink-soft">↑ {dias(laguna.dias)} sin contrato ({formatFecha(laguna.desde)} a {formatFecha(laguna.hasta)})</p>}
                    </li>
                  )
                })}
              </ol>
            </section>
            <p className="text-xs text-ink-soft">Ayuda para planificar según el art. 159 N°4 del Código del Trabajo. Los casos límite deben validarse con asesoría laboral.</p>
          </>
        )}
      </div>
    </Drawer>
  )
}

/** Cumplimiento laboral (art. 159 N°4) y rotación de personal. Lectura para RR. HH., Gerencia General y Auditor Externo. */
export function CumplimientoPage() {
  const rol = useAuthStore((s) => s.user?.rol)
  const gestiona = can(rol, 'rrhh.gestionar')
  const { data, error, loading, reload } = useResource(() => rrhhService.cumplimiento(), [])
  const [persona, setPersona] = useState(null)
  const [reporte, setReporte] = useState(false)
  const r = data?.rotacion
  const t = r?.dotacion_por_tipo

  const columnas = [
    { key: 'nombre', header: 'Persona', render: (p) => <div><p className="font-medium">{p.nombre}</p><p className="text-xs text-ink-soft">{p.cargo}</p></div> },
    { key: 'situacion', header: 'Situación', render: (p) => (p.situacion === 'ACTIVO' ? <span>{p.tipo_texto}{p.numero_renovacion > 0 && <span className="text-ink-soft"> · {p.numero_renovacion} renov.</span>}</span> : <span className="text-ink-soft">Ex trabajador</span>) },
    { key: 'vence', header: 'Vence / espera', render: (p) => (p.situacion === 'ACTIVO'
      ? (p.fecha_termino ? <span><Mono>{formatFecha(p.fecha_termino)}</Mono>{p.dias_para_vencer != null && <span className="text-xs text-ink-soft"> ({p.dias_para_vencer < 0 ? `venció hace ${dias(-p.dias_para_vencer)}` : `en ${dias(p.dias_para_vencer)}`})</span>}</span> : '—')
      : (p.dias_espera ? <span className="font-medium text-crit">Esperar {dias(p.dias_espera)}</span> : <span className="text-ink-soft">Recontratable</span>)) },
    { key: 'dias', header: 'Días trabajados', align: 'right', render: (p) => <Mono>{p.dias_trabajados_total}</Mono> },
    { key: 'nivel', header: 'Riesgo', render: (p) => <Badge tone={NIVEL[p.nivel].tone} icon={NIVEL[p.nivel].icon}>{etiquetaNivel(p)}</Badge> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Cumplimiento y Rotación" subtitle="Historial de contrataciones, alertas legales de plazo fijo (art. 159 N°4) y rotación de personal"
        actions={<Button icon={Sparkles} onClick={() => setReporte(true)} disabled={!data}>Generar Reporte de Rotación con IA</Button>} />

      {error ? <Card><ErrorEstado error={error} onReintentar={reload} /></Card> : !data ? <Card><Skeleton rows={8} /></Card> : (
        <>
          {!gestiona && <p className="rounded-lg border border-fyag-ice/20 bg-fyag-deep/30 px-4 py-2.5 text-sm text-fyag-ice">Vista de solo lectura. Las renovaciones y los contratos los gestiona Recursos Humanos.</p>}

          <section aria-label="Indicadores de rotación" data-agent-target="kpi-rotacion" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Rotación anual" value={formatPct(r.tasa_rotacion_anual)} icon={TrendingDown} tone={r.tasa_rotacion_anual >= 25 ? 'crit' : r.tasa_rotacion_anual >= 12 ? 'warn' : 'ok'} hint={`${r.bajas_anual} bajas · dotación promedio ${String(r.dotacion_promedio_anual).replace('.', ',')}`} />
            <KpiTile label="Rotación del mes" value={formatPct(r.tasa_rotacion_mes_actual)} icon={CalendarClock} hint={`Promedio mensual ${formatPct(r.tasa_rotacion_mensual_promedio)}`} />
            <KpiTile label="Voluntaria / involuntaria" value={`${formatPct(r.rotacion_voluntaria.tasa)} / ${formatPct(r.rotacion_involuntaria.tasa)}`} icon={Users} hint={`${r.rotacion_voluntaria.bajas} renuncias o acuerdos · ${r.rotacion_involuntaria.bajas} por la empresa o plazo`} />
            <KpiTile label="Duración promedio de contrato" value={dias(r.duracion_promedio_contratos_dias)} icon={Hourglass} hint={`Plazo fijo: ${dias(r.duracion_promedio_plazo_fijo_dias)}`} />
            <KpiTile label="Dotación a plazo fijo" value={formatPct(t.PLAZO_FIJO.porcentaje)} icon={Scale} tone={t.PLAZO_FIJO.porcentaje >= 30 ? 'warn' : 'neutral'} hint={`Indefinido ${formatPct(t.INDEFINIDO.porcentaje)} · obra ${formatPct(t.OBRA_FAENA.porcentaje)} · ${r.dotacion_actual} personas`} />
            <KpiTile label="Mayor fuga de talento" value={r.cargo_mayor_fuga?.cargo ?? 'Sin bajas'} icon={Users} hint={r.cargo_mayor_fuga ? `${r.cargo_mayor_fuga.bajas} bajas en 12 meses` : 'Últimos 12 meses'} />
            <KpiTile label="Costo de reemplazo estimado" value={formatCLP(r.costo_reemplazo_estimado)} icon={Wallet} hint="1,5 sueldos base por baja (estimación)" />
            <KpiTile label="Alertas legales activas" value={data.alertas.length} icon={ShieldAlert} tone={data.alertas.some((a) => NIVEL[a.nivel].tone === 'crit') ? 'crit' : data.alertas.length ? 'warn' : 'ok'} hint={`${data.semaforo.plazo_fijo_vigentes} plazo(s) fijo(s) vigentes`} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Alertas de Contratos a Plazo Fijo" subtitle={`${data.semaforo.plazo_fijo_vigentes} contrato(s) a plazo fijo vigentes`} icon={Scale}>
              <div data-agent-target="semaforo-plazo-fijo"><Semaforo semaforo={data.semaforo} /></div>
            </Card>
            <Card title="Altas y bajas por mes" subtitle={`${formatFecha(r.periodo.desde)} a ${formatFecha(r.periodo.hasta)}`} icon={FileBarChart2}>
              <SerieMensual serie={r.serie_mensual} />
            </Card>
          </div>

          <Card data-agent-target="casos-decision" title="Casos que requieren decisión" subtitle="Ordenados por gravedad. Abre uno para ver su historial." icon={ShieldAlert}>
            {data.alertas.length === 0 ? <EmptyState icon={ShieldCheck} title="Sin alertas legales" hint="Ningún plazo fijo está por vencer con renovaciones ni hay recontrataciones comprometidas." /> : (
              <ul className="divide-y divide-line">
                {data.alertas.map((a) => {
                  const n = NIVEL[a.nivel]
                  return (
                    <li key={a.id}>
                      <button type="button" onClick={() => setPersona(a)} className="flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                        <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white', n.luz)}><n.icon className="h-4 w-4" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{a.nombre}</span><Badge tone={n.tone}>{etiquetaNivel(a)}</Badge>{a.situacion !== 'ACTIVO' && <Badge tone="neutral">Ex trabajador</Badge>}</span>
                          <span className={cn('mt-1 block text-sm', a.critica ? 'font-semibold text-crit' : 'text-ink-soft')}>{a.mensajes[0]}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card title="Historial de contrataciones" subtitle="Haz clic en una persona para ver su línea de tiempo" icon={Users} padded={false}>
            <DataTable columns={columnas} rows={data.personas} rowKey={(p) => p.id} onRowClick={setPersona} pageSize={15} emptyTitle="Sin contratos registrados" />
          </Card>
        </>
      )}

      {persona && <HistorialDrawer persona={persona} gestiona={gestiona} onClose={() => setPersona(null)} onCambio={reload} />}
      {reporte && <ReporteModal onClose={() => setReporte(false)} />}
    </div>
  )
}
