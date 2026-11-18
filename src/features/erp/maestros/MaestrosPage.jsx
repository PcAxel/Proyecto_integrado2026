import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '@/components/ui'
import { clientesService, proveedoresService } from '@/services'
import { MaestroTab } from './MaestroTab'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'

const BASE = [{ key: 'rut', header: 'RUT', mono: true }, { key: 'razon_social', header: 'Razón social', render: (r) => <span className="font-medium">{r.razon_social}</span> }, { key: 'comuna', header: 'Comuna' }, { key: 'contacto', header: 'Contacto' }]
const BASE_X = [{ titulo: 'Código', clave: 'id' }, { titulo: 'RUT', clave: 'rut' }, { titulo: 'Razón social', clave: 'razon_social', ancho: 34 }, { titulo: 'Comuna', clave: 'comuna' }, { titulo: 'Contacto', clave: 'contacto', ancho: 22 }]

export function MaestrosPage() {
  const [params, setParams] = useSearchParams()
  const rol = useAuthStore((s) => s.user.rol)
  // Cada pestaña solo existe para quien puede leerla (el Ejecutivo Comercial ve clientes, no proveedores).
  const tabs = [['clientes', 'Clientes', 'clientes.ver'], ['proveedores', 'Proveedores', 'proveedores.ver']].filter(([, , a]) => can(rol, a)).map(([id, label]) => ({ id, label }))
  const pedida = params.get('tab') ?? 'clientes'
  const tab = tabs.some((t) => t.id === pedida) ? pedida : tabs[0]?.id
  return (
    <div className="space-y-5">
      <PageHeader title="Clientes y Proveedores" subtitle="Datos maestros: se desactivan, nunca se eliminan" />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={tabs} />
      {tab === 'clientes' ? (
        <MaestroTab key="c" singular="Cliente" plural="Clientes" servicio={clientesService} permisos={['maestros.gestionar', 'clientes.gestionar']}
          campos={[
            { clave: 'rut', label: 'RUT' }, { clave: 'razon_social', label: 'Razón social' }, { clave: 'giro', label: 'Giro', ancho: 'sm:col-span-2', opcional: true },
            { clave: 'comuna', label: 'Comuna', opcional: true }, { clave: 'contacto', label: 'Contacto', opcional: true }, { clave: 'telefono', label: 'Teléfono', opcional: true }, { clave: 'email', label: 'Correo', tipo: 'email', opcional: true },
          ]}
          columnas={[...BASE, { key: 'telefono', header: 'Teléfono', mono: true }]}
          exportar={[...BASE_X, { titulo: 'Giro', clave: 'giro', ancho: 34 }, { titulo: 'Teléfono', clave: 'telefono' }, { titulo: 'Correo', clave: 'email', ancho: 28 }]} />
      ) : tab === 'proveedores' && (
        <MaestroTab key="p" singular="Proveedor" plural="Proveedores" servicio={proveedoresService}
          campos={[
            { clave: 'rut', label: 'RUT' }, { clave: 'razon_social', label: 'Razón social' }, { clave: 'comuna', label: 'Comuna', opcional: true },
            { clave: 'contacto', label: 'Contacto', opcional: true }, { clave: 'condicion_pago', label: 'Condición de pago', opcional: true },
          ]}
          columnas={[...BASE, { key: 'condicion_pago', header: 'Pago' }, { key: 'desc', header: 'Descuentos habituales', mono: true, render: (r) => (r.descuentos_habituales ?? []).filter((d) => d > 0).map((d) => `${d}%`).join(' + ') || '—' }]}
          exportar={[...BASE_X, { titulo: 'Condición de pago', clave: 'condicion_pago' }, { titulo: 'Descuentos', clave: (r) => (r.descuentos_habituales ?? []).filter((d) => d > 0).map((d) => `${d}%`).join(' + ') }]} />
      )}
    </div>
  )
}
