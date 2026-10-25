import { useMemo, useState } from 'react'
import { UserPlus, Pencil, KeyRound, Power, Lock, UserCheck, UserX, ShieldCheck, KeySquare } from 'lucide-react'
import { PageHeader, Card, DataTable, KpiTile, Badge, Button, IconButton, Input, Select, ConfirmDialog, Mono } from '@/components/ui'
import { usuariosService } from '@/services'
import { ROLES, ROL_LABEL, can } from '@/domain/rbac'
import { puedeCambiarEstado, iniciales } from '@/domain/usuarios'
import { formatFecha } from '@/domain/format'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { usePersistedFilters } from '@/hooks/usePersistedFilters'
import { UsuarioFormModal, RestablecerClaveModal } from './UsuarioFormModal'

const TONO_ROL = { ADMIN_GENERAL: 'info', TECNICO: 'warn' }

/** Gestión de Accesos y Usuarios (solo Gerencia General): quién puede ingresar y con qué rol. */
export function UsuariosList() {
  const yo = useAuthStore((s) => s.user)
  const { data, loading, reload } = useResource(() => usuariosService.list(), [])
  const [f, setF] = usePersistedFilters('usuarios', { q: '', rol: '', estado: '' })
  const [modal, setModal] = useState(null) // { usuario? } | null
  const [clave, setClave] = useState(null)
  const [toggle, setToggle] = useState(null)

  const todos = data ?? []
  const filas = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return todos.filter((u) => (!f.rol || u.rol === f.rol)
      && (!f.estado || (f.estado === 'ACTIVO') === u.activo)
      && (!q || [u.nombre, u.rut, u.email, u.cargo].some((x) => x.toLowerCase().includes(q))))
  }, [todos, f])
  const kpi = (v) => (data ? v : '—')

  const confirmarToggle = async () => {
    const r = await runAction(usuariosService.setActivo(toggle.id, !toggle.activo), toggle.activo ? 'Acceso desactivado' : 'Acceso activado')
    if (r) { setToggle(null); reload() }
  }

  const columns = [
    { key: 'nombre', header: 'Usuario', render: (u) => (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand">{iniciales(u.nombre)}</span>
        <div className="min-w-0"><p className="font-medium">{u.nombre}{u.id === yo.id && <span className="ml-2 text-xs font-normal text-ink-faint">(tú)</span>}</p><p className="truncate text-xs text-ink-soft">{u.email}</p></div>
      </div>
    ) },
    { key: 'rut', header: 'RUT', mono: true },
    { key: 'cargo', header: 'Cargo' },
    { key: 'rol', header: 'Rol', render: (u) => <Badge tone={TONO_ROL[u.rol] ?? 'neutral'}>{ROL_LABEL[u.rol]}</Badge> },
    { key: 'estado', header: 'Estado', render: (u) => (
      <div className="flex flex-wrap gap-1">
        <Badge tone={u.activo ? 'ok' : 'neutral'}>{u.activo ? 'Activo' : 'Desactivado'}</Badge>
        {u.debe_cambiar_password && <Badge tone="warn" icon={KeySquare}>Clave pendiente</Badge>}
      </div>
    ) },
    { key: 'creado_en', header: 'Creado', mono: true, render: (u) => formatFecha(u.creado_en) },
    { key: 'acc', header: '', align: 'right', render: (u) => {
      const regla = puedeCambiarEstado({ objetivo: u, activo: !u.activo, usuarios: todos, actorId: yo.id })
      return (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Pencil} label="Editar usuario" size="sm" onClick={() => setModal({ usuario: u })} />
          <IconButton icon={KeyRound} label="Restablecer contraseña" size="sm" onClick={() => setClave(u)} />
          <IconButton icon={Power} size="sm" disabled={!regla.ok} label={regla.ok ? (u.activo ? 'Desactivar acceso' : 'Activar acceso') : regla.motivo} onClick={() => setToggle(u)} />
        </div>
      )
    } },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Accesos y Usuarios" subtitle="Quién puede ingresar al sistema y con qué rol"
        actions={can(yo.rol, 'usuarios.crear') && <Button icon={UserPlus} onClick={() => setModal({})}>Nuevo Acceso</Button>} />

      <div className="flex items-start gap-3 rounded-xl border border-line bg-brand-tint p-4 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-ink-soft"><span className="font-semibold text-ink">Los accesos no se eliminan: se desactivan.</span> Cada alta, cambio de rol o restablecimiento de clave queda registrado en el Log de Auditoría.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="Accesos activos" value={kpi(todos.filter((u) => u.activo).length)} icon={UserCheck} tone="ok" />
        <KpiTile label="Desactivados" value={kpi(todos.filter((u) => !u.activo).length)} icon={UserX} />
        <KpiTile label="Administradores generales" value={kpi(todos.filter((u) => u.activo && u.rol === ROLES.ADMIN_GENERAL).length)} icon={ShieldCheck} hint="Debe quedar al menos uno" />
        <KpiTile label="Con clave por cambiar" value={kpi(todos.filter((u) => u.debe_cambiar_password).length)} icon={KeySquare} tone={todos.some((u) => u.debe_cambiar_password) ? 'warn' : 'neutral'} hint="Aún no ingresan con su clave definitiva" />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Input label="Buscar" placeholder="Nombre, RUT, correo o cargo" value={f.q} onChange={(e) => setF('q', e.target.value)} className="w-full sm:w-72" />
          <Select label="Rol" value={f.rol} onChange={(e) => setF('rol', e.target.value)} placeholder="Todos" className="w-full sm:w-56" options={Object.values(ROLES).map((r) => ({ value: r, label: ROL_LABEL[r] }))} />
          <Select label="Estado" value={f.estado} onChange={(e) => setF('estado', e.target.value)} placeholder="Todos" className="w-full sm:w-40" options={[{ value: 'ACTIVO', label: 'Activos' }, { value: 'INACTIVO', label: 'Desactivados' }]} />
          <Mono className="pb-2 text-xs text-ink-soft sm:ml-auto">{filas.length} de {todos.length} usuarios</Mono>
        </div>
        <DataTable columns={columns} rows={filas} rowKey={(u) => u.id} loading={loading && !data} emptyTitle="Sin usuarios" emptyHint="Ajusta los filtros o crea un nuevo acceso." />
      </Card>

      {modal && <UsuarioFormModal usuario={modal.usuario} usuarios={todos} actorId={yo.id} onClose={() => setModal(null)} onSaved={reload} />}
      {clave && <RestablecerClaveModal usuario={clave} onClose={() => setClave(null)} onSaved={reload} />}
      <ConfirmDialog open={Boolean(toggle)} onClose={() => setToggle(null)} onConfirm={confirmarToggle} tone={toggle?.activo ? 'danger' : 'primary'}
        confirmLabel={toggle?.activo ? 'Desactivar' : 'Activar'} title={toggle?.activo ? 'Desactivar acceso' : 'Activar acceso'}
        message={toggle?.activo ? `${toggle?.nombre} ya no podrá ingresar al sistema. Su historial se conserva (no se elimina).` : `${toggle?.nombre} volverá a poder ingresar al sistema.`} />
    </div>
  )
}
