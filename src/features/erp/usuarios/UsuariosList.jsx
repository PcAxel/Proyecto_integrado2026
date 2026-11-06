import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { normalizar } from '@/domain/busqueda'
import { FiltroBusqueda } from '@/components/FiltroBusqueda'
import { UserPlus, ShieldCheck, ShieldOff } from 'lucide-react'
import { PageHeader, Button, Card, DataTable, Modal, Input, Select, Badge, Mono } from '@/components/ui'
import { RolBadge } from '@/components/domain'
import { ErrorEstado } from '@/components/ErrorEstado'
import { usuariosService } from '@/services'
import { formatFechaHora } from '@/domain/format'
import { useResource } from '@/hooks/useResource'
import { toast } from 'sonner'

const ROLES = [{ value: 'ADMIN', label: 'Administrador' }, { value: 'FINANZAS', label: 'Finanzas' }, { value: 'OPERACIONES', label: 'Operaciones' }, { value: 'TECNICO', label: 'Técnico' }, { value: 'RRHH', label: 'Recursos Humanos' }]

function UsuarioModal({ onClose, onSaved }) {
  const [f, setF] = useState({ email: '', first_name: '', last_name: '', role: 'TECNICO' })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const guardar = async (ev) => {
    ev.preventDefault()
    setGuardando(true)
    setErrores({})
    try {
      const r = await usuariosService.create(f)
      if (r.email_sent) toast.success(`Acceso creado. Enviamos las credenciales a ${r.email}.`)
      else toast.warning('Acceso creado, pero el correo no pudo enviarse. Revisa la configuración de correo del servidor.')
      onSaved()
      onClose()
    } catch (err) { setErrores(err.data && typeof err.data === 'object' ? err.data : { _: [err.message] }) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title="Nuevo acceso"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-usuario" loading={guardando}>Crear y enviar correo</Button></>}>
      <form id="form-usuario" onSubmit={guardar} className="space-y-4">
        <Input label="Correo" type="email" required value={f.email} onChange={set('email')} error={errores.email?.[0]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" value={f.first_name} onChange={set('first_name')} />
          <Input label="Apellido" value={f.last_name} onChange={set('last_name')} />
        </div>
        <Select label="Rol" value={f.role} onChange={set('role')} options={ROLES} error={errores.role?.[0]} />
        <p className="text-xs text-ink-soft">El servidor genera una contraseña temporal y la envía por correo junto al link de instalación de la app.</p>
        {errores._ && <p role="alert" className="text-sm font-medium text-crit">{errores._[0]}</p>}
      </form>
    </Modal>
  )
}

export function UsuariosList() {
  const [params, setParams] = useSearchParams()
  const buscar = params.get('buscar') ?? ''
  const [modal, setModal] = useState(params.get('nuevo') === '1')
  const { data, loading, error, reload } = useResource(() => usuariosService.list(), [])
  const columns = [
    { key: 'nombre', header: 'Usuario', render: (u) => <div><p className="font-medium">{`${u.first_name} ${u.last_name}`.trim() || '—'}</p><p className="text-xs text-ink-soft">{u.email}</p></div> },
    { key: 'role', header: 'Rol', render: (u) => <RolBadge rol={u.role} /> },
    { key: '2fa', header: '2FA', render: (u) => (u.is_2fa_enabled ? <Badge tone="ok" icon={ShieldCheck}>Vinculado</Badge> : <Badge tone="warn" icon={ShieldOff}>Pendiente</Badge>) },
    { key: 'terms', header: 'Términos', render: (u) => (u.terms_accepted_at ? <Mono className="text-xs">{formatFechaHora(u.terms_accepted_at)}</Mono> : <Badge tone="warn">Sin aceptar</Badge>) },
  ]
  return (
    <div className="space-y-5">
      <PageHeader title="Accesos y Usuarios" subtitle="Cuentas del sistema, administradas en el servidor central"
        actions={<Button icon={UserPlus} onClick={() => setModal(true)}>Nuevo acceso</Button>} />
      <Card padded={false}>
        {buscar && <FiltroBusqueda texto={buscar} onQuitar={() => setParams({})} />}
        {error ? <ErrorEstado error={error} onReintentar={reload} /> : (
          <DataTable columns={columns} rows={(data ?? []).filter((u) => !buscar || normalizar(`${u.email} ${u.first_name} ${u.last_name}`).includes(normalizar(buscar)))} rowKey={(u) => u.id} loading={loading && !data} emptyTitle="Sin usuarios" />
        )}
      </Card>
      {modal && <UsuarioModal onClose={() => setModal(false)} onSaved={reload} />}
    </div>
  )
}
