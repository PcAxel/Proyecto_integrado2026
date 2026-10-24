import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '@/components/ui'
import { clientesService, proveedoresService } from '@/services'
import { MaestroTab } from './MaestroTab'

const BASE = [{ key: 'rut', header: 'RUT', mono: true }, { key: 'razon_social', header: 'Razón social', render: (r) => <span className="font-medium">{r.razon_social}</span> }, { key: 'comuna', header: 'Comuna' }, { key: 'contacto', header: 'Contacto' }]
const BASE_X = [{ titulo: 'Código', clave: 'id' }, { titulo: 'RUT', clave: 'rut' }, { titulo: 'Razón social', clave: 'razon_social', ancho: 34 }, { titulo: 'Comuna', clave: 'comuna' }, { titulo: 'Contacto', clave: 'contacto', ancho: 22 }]

export function MaestrosPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'clientes'
  return (
    <div className="space-y-5">
      <PageHeader title="Clientes y Proveedores" subtitle="Datos maestros: se desactivan, nunca se eliminan" />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'clientes', label: 'Clientes' }, { id: 'proveedores', label: 'Proveedores' }]} />
      {tab === 'clientes' ? (
        <MaestroTab key="c" singular="Cliente" plural="Clientes" servicio={clientesService}
          campos={[
            { clave: 'rut', label: 'RUT' }, { clave: 'razon_social', label: 'Razón social' }, { clave: 'giro', label: 'Giro', ancho: 'sm:col-span-2' },
            { clave: 'comuna', label: 'Comuna' }, { clave: 'contacto', label: 'Contacto' }, { clave: 'telefono', label: 'Teléfono' }, { clave: 'email', label: 'Correo', tipo: 'email' },
          ]}
          columnas={[...BASE, { key: 'telefono', header: 'Teléfono', mono: true }]}
          exportar={[...BASE_X, { titulo: 'Giro', clave: 'giro', ancho: 34 }, { titulo: 'Teléfono', clave: 'telefono' }, { titulo: 'Correo', clave: 'email', ancho: 28 }]} />
      ) : (
        <MaestroTab key="p" singular="Proveedor" plural="Proveedores" servicio={proveedoresService}
          campos={[
            { clave: 'rut', label: 'RUT' }, { clave: 'razon_social', label: 'Razón social' }, { clave: 'comuna', label: 'Comuna' },
            { clave: 'contacto', label: 'Contacto' }, { clave: 'condicion_pago', label: 'Condición de pago' },
          ]}
          columnas={[...BASE, { key: 'condicion_pago', header: 'Pago' }, { key: 'desc', header: 'Descuentos habituales', mono: true, render: (r) => (r.descuentos_habituales ?? []).filter((d) => d > 0).map((d) => `${d}%`).join(' + ') || '—' }]}
          exportar={[...BASE_X, { titulo: 'Condición de pago', clave: 'condicion_pago' }, { titulo: 'Descuentos', clave: (r) => (r.descuentos_habituales ?? []).filter((d) => d > 0).map((d) => `${d}%`).join(' + ') }]} />
      )}
    </div>
  )
}
