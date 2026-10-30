import { useState } from 'react'
import { CheckCircle2, XCircle, Flag, Lock } from 'lucide-react'
import { Card, Button, ConfirmDialog, Modal, Select, Mono, cn } from '@/components/ui'
import { obrasService, presupuestosService } from '@/services'
import { can } from '@/domain/rbac'
import { formatFecha } from '@/domain/format'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'

/** Panel de cierre (RF06): los 6 checks de validarCierreObra y el botón Finalizar, bloqueado si falta alguno. */
export function PanelCierre({ obra, onChanged }) {
  const rol = useAuthStore((s) => s.user.rol)
  const { checks, puedeFinalizar } = obra.cierre
  const ok = checks.filter((c) => c.ok).length
  const [dialogo, setDialogo] = useState(null) // 'finalizar' | 'conciliar' | 'regularizar'
  const [trabajando, setTrabajando] = useState(false)
  const finalizada = obra.estado === 'FINALIZADA'
  const enCurso = obra.estado === 'EN_CURSO'

  const ejecutar = async (promesa, mensaje) => {
    setTrabajando(true)
    const r = await runAction(promesa, mensaje)
    setTrabajando(false)
    if (r) { setDialogo(null); onChanged() }
  }

  const accionPara = (check) => {
    if (check.ok || finalizada) return null
    if (check.id === 'presupuesto' && obra.es_emergencia_sin_presupuesto && can(rol, 'obras.crear'))
      return <Button size="sm" variant="secondary" onClick={() => setDialogo('regularizar')}>Regularizar</Button>
    if (check.id === 'sobrantes' && can(rol, 'cardex.reingresar'))
      return <Button size="sm" variant="secondary" onClick={() => setDialogo('conciliar')}>Conciliar</Button>
    return null
  }

  return (
    <Card title="Panel de cierre" subtitle={ok === 6 ? 'Lista para finalizar' : `${6 - ok} requisito${6 - ok === 1 ? '' : 's'} pendiente${6 - ok === 1 ? '' : 's'}`} action={<span className={cn('t-display text-2xl tabular-nums', ok === 6 ? 'text-ok' : 'text-ink')}>{ok}<span className="text-ink-faint">/6</span></span>}>
      <div className="mb-4 flex gap-1" role="img" aria-label={`${ok} de 6 requisitos cumplidos`}>
        {checks.map((c) => <span key={c.id} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', c.ok ? 'bg-ok' : 'bg-slate-200')} title={c.label} />)}
      </div>
      <ul className="space-y-3">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-3">
            {c.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-crit" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-xs text-ink-soft">{c.detalle}</p>
            </div>
            {accionPara(c)}
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-line pt-4">
        {finalizada ? (
          <p className="flex items-center gap-2 text-sm text-ok"><Lock className="h-4 w-4" />Obra finalizada el <Mono>{formatFecha(obra.fecha_cierre)}</Mono></p>
        ) : (
          <>
            <Button className="w-full" icon={Flag} disabled={!puedeFinalizar || !enCurso || !can(rol, 'obras.cerrar')} onClick={() => setDialogo('finalizar')}>Finalizar obra</Button>
            <p className="mt-2 text-xs text-ink-soft">
              {!enCurso ? 'La obra debe estar en curso para finalizarse.'
                : !can(rol, 'obras.cerrar') ? 'Tu rol no puede finalizar obras.'
                : puedeFinalizar ? 'Todos los requisitos se cumplen.' : `Faltan ${6 - ok} requisito(s) para poder finalizar.`}
            </p>
          </>
        )}
      </div>

      <ConfirmDialog open={dialogo === 'finalizar'} onClose={() => setDialogo(null)} loading={trabajando} confirmLabel="Finalizar obra"
        title="Finalizar obra" message="La obra quedará cerrada y sus costos pasarán a ser definitivos. Esta acción queda registrada en la auditoría."
        onConfirm={() => ejecutar(obrasService.finalizar(obra.id), 'Obra finalizada')} />
      <ConfirmDialog open={dialogo === 'conciliar'} onClose={() => setDialogo(null)} loading={trabajando} confirmLabel="Marcar conciliados"
        title="Conciliar sobrantes" message="Confirma que los materiales sobrantes de esta obra fueron devueltos a bodega (o reingresados) y que no quedan diferencias."
        onConfirm={() => ejecutar(obrasService.conciliarSobrantes(obra.id), 'Sobrantes conciliados')} />
      {dialogo === 'regularizar' && <RegularizarModal obra={obra} trabajando={trabajando} onClose={() => setDialogo(null)}
        onConfirm={(presupuestoId) => ejecutar(obrasService.regularizarPresupuesto(obra.id, presupuestoId), 'Obra regularizada con presupuesto aprobado')} />}
    </Card>
  )
}

function RegularizarModal({ obra, onClose, onConfirm, trabajando }) {
  const [sel, setSel] = useState('')
  const { data } = useResource(() => presupuestosService.list({ estado: 'APROBADO', cliente_id: obra.cliente_id }), [])
  const libres = (data ?? []).filter((p) => !p.obra_id)
  return (
    <Modal open onClose={onClose} title="Regularizar presupuesto (CU30)"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={trabajando} disabled={!sel} onClick={() => onConfirm(sel)}>Vincular presupuesto</Button></>}>
      <p className="mb-4 text-sm text-ink-soft">Vincula un presupuesto <b>aprobado</b> del mismo cliente. Si aún no existe, créalo y apruébalo primero en Presupuestos.</p>
      <Select label="Presupuesto aprobado" placeholder={libres.length ? 'Seleccione…' : 'No hay presupuestos aprobados disponibles'} value={sel} onChange={(e) => setSel(e.target.value)}
        options={libres.map((p) => ({ value: p.id, label: `${p.id} · ${p.titulo}` }))} />
    </Modal>
  )
}
