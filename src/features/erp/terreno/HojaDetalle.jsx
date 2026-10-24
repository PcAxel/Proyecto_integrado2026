import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Undo2, Camera, Clock, PackageOpen, Pencil } from 'lucide-react'
import { Card, Button, Badge, Mono, Modal, Textarea } from '@/components/ui'
import { ChecklistGrid, ChecklistResultBadge, HojaStatusBadge, GpsStamp } from '@/components/domain'
import { hojasService } from '@/services'
import { formatFechaHora } from '@/domain/format'
import { runAction } from '@/hooks/runAction'

function Foto({ f }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line">
      <div className="relative aspect-[4/3] bg-slate-100">
        {f.thumb
          ? <img src={f.thumb} alt={`Foto ${f.etiqueta}`} className="h-full w-full object-cover" />
          : <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-faint"><Camera className="h-6 w-6" /><span className="text-[11px]">Imagen no incluida en el dato de demostración</span></div>}
        <span className="absolute left-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-medium text-white">{f.etiqueta}</span>
        {f.geocerca && !f.geocerca.dentro && <span className="absolute bottom-2 right-2 rounded bg-crit px-1.5 py-0.5 text-[11px] font-semibold text-white">Fuera de geocerca</span>}
      </div>
      <figcaption className="p-2"><GpsStamp lat={f.lat} lng={f.lng} ts={f.ts} geocerca={f.geocerca} simulado={f.simulado} className="flex-wrap" /></figcaption>
    </figure>
  )
}

/** Detalle de auditoría de una hoja: checklist evaluado, evidencia con GPS y decisión. */
export function HojaDetalle({ hoja: h, puedeAuditar, onChanged }) {
  const [devolver, setDevolver] = useState(null)
  const [aprobar, setAprobar] = useState(false)
  const [obs, setObs] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const fuera = h.fotos.filter((f) => f.geocerca && !f.geocerca.dentro)
  const critico = h.evaluacion.resultado === 'CRITICO'
  const riesgo = fuera.length > 0 || critico

  const ejecutar = async (promesa, mensaje) => {
    setTrabajando(true)
    const r = await runAction(promesa, mensaje)
    setTrabajando(false)
    if (r) { setDevolver(null); setAprobar(false); setObs(''); onChanged() }
  }

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="flex items-center gap-2"><Mono className="text-base font-semibold">{h.id}</Mono><HojaStatusBadge estado={h.estado} /></div>
            <p className="mt-1 text-sm font-medium">{h.obra_nombre}</p>
            <p className="text-xs text-ink-soft">{h.tecnico_nombre} · <Mono>{formatFechaHora(h.fecha)}</Mono> · <Mono>{h.horas_trabajadas} h</Mono></p>
          </div>
          {h.estado === 'ENVIADA' && puedeAuditar && (
            <div className="flex gap-2">
              <Button variant="secondary" icon={Undo2} onClick={() => setDevolver('')}>Devolver</Button>
              <Button icon={CheckCircle2} onClick={() => setAprobar(true)}>Aprobar</Button>
            </div>
          )}
        </div>
        {riesgo && (
          <div role="alert" className="mx-5 mb-5 flex items-start gap-2 rounded-lg bg-warn-bg p-3 text-sm text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <ul className="space-y-0.5">
              {critico && <li>El checklist tiene puntos <b>críticos</b>: revisa las mediciones antes de aprobar.</li>}
              {fuera.length > 0 && <li><b>{fuera.length} foto(s)</b> tomadas fuera de la geocerca de la obra.</li>}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Checklist paramétrico" action={<ChecklistResultBadge resultado={h.evaluacion.resultado} />}>
        <ChecklistGrid valores={h.checklist_json} />
      </Card>

      <Card title={`Evidencia fotográfica (${h.fotos.length})`}>
        {h.fotos.length === 0 ? <p className="text-sm text-ink-faint">Sin fotos adjuntas.</p> : <div className="grid gap-3 sm:grid-cols-2">{h.fotos.map((f) => <Foto key={f.id} f={f} />)}</div>}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Trabajo registrado">
          <p className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-ink-faint" /><Mono className="font-semibold">{h.horas_trabajadas} h</Mono> trabajadas</p>
          <p className="mb-1 mt-4 flex items-center gap-2 text-xs font-medium text-ink-soft"><PackageOpen className="h-3.5 w-3.5" />Materiales usados</p>
          {h.materiales.length === 0 ? <p className="text-sm text-ink-faint">Sin materiales declarados.</p>
            : <ul className="space-y-1 text-sm">{h.materiales.map((m) => <li key={m.articulo_id}><Mono>{m.cantidad} {m.unidad}</Mono> {m.nombre}</li>)}</ul>}
          {h.observaciones && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-ink-soft">“{h.observaciones}”</p>}
        </Card>
        <Card title="Conformidad del cliente">
          {h.firma_img
            ? <img src={h.firma_img} alt="Firma del cliente" className="h-28 w-full rounded-lg border border-line bg-white object-contain" />
            : <p className="flex items-center gap-2 text-sm text-ink-soft"><Pencil className="h-4 w-4" />{h.firma_cliente ? 'Firmada (imagen no incluida en el dato de demostración).' : 'Sin firma.'}</p>}
        </Card>
      </div>

      {h.auditoria && (
        <Card title="Resultado de la auditoría">
          <div className="flex items-start justify-between gap-3 text-sm">
            <p>{h.auditoria.observaciones || 'Sin observaciones.'}</p>
            <Mono className="shrink-0 text-xs text-ink-soft">{formatFechaHora(h.auditoria.fecha)}</Mono>
          </div>
        </Card>
      )}

      <Modal open={aprobar} onClose={() => setAprobar(false)} title="Aprobar hoja de servicio"
        footer={<><Button variant="secondary" onClick={() => setAprobar(false)}>Cancelar</Button><Button loading={trabajando} onClick={() => ejecutar(hojasService.aprobar(h.id, obs), 'Hoja aprobada: costos imputados a la obra')}>{riesgo ? 'Aprobar de todas formas' : 'Aprobar'}</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">Al aprobar, las horas se mantienen imputadas al costo real de la obra y la hoja queda cerrada.</p>
          {riesgo && <p className="rounded-lg bg-warn-bg p-3 text-xs text-warn">Esta hoja tiene alertas (checklist crítico o fotos fuera de geocerca). Deja constancia en las observaciones.</p>}
          <Textarea label={riesgo ? 'Observaciones' : 'Observaciones (opcional)'} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </Modal>
      <Modal open={devolver !== null} onClose={() => setDevolver(null)} title="Devolver al técnico"
        footer={<><Button variant="secondary" onClick={() => setDevolver(null)}>Cancelar</Button><Button variant="danger" loading={trabajando} disabled={!devolver?.trim()} onClick={() => ejecutar(hojasService.devolver(h.id, devolver), 'Hoja devuelta al técnico')}>Devolver</Button></>}>
        <Textarea label="¿Qué debe corregir?" value={devolver ?? ''} onChange={(e) => setDevolver(e.target.value)} hint="Las observaciones son obligatorias." />
      </Modal>
    </div>
  )
}
