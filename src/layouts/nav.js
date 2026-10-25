import { LayoutDashboard, FileText, HardHat, Package, ShoppingCart, ClipboardCheck, Users, Building2, ScrollText, Shield } from 'lucide-react'

/** Menú del ERP. `accion` enlaza con domain/rbac.js. */
export const ERP_NAV = [
  { to: '/erp', label: 'Dashboard', icon: LayoutDashboard, accion: 'dashboard.ver', end: true },
  { to: '/erp/presupuestos', label: 'Presupuestos', icon: FileText, accion: 'presupuestos.ver' },
  { to: '/erp/obras', label: 'Obras', icon: HardHat, accion: 'obras.ver' },
  { to: '/erp/bodega', label: 'Bodega y Cardex', icon: Package, accion: 'bodega.ver' },
  { to: '/erp/compras', label: 'Compras', icon: ShoppingCart, accion: 'compras.ver' },
  { to: '/erp/terreno', label: 'Auditoría de Terreno', icon: ClipboardCheck, accion: 'terreno.ver' },
  { to: '/erp/personal', label: 'Personal y Flota', icon: Users, accion: 'personal.ver' },
  { to: '/erp/maestros', label: 'Clientes y Proveedores', icon: Building2, accion: 'maestros.ver' },
  { to: '/erp/auditoria', label: 'Log de Auditoría', icon: ScrollText, accion: 'auditoria.ver' },
  { to: '/erp/usuarios', label: 'Accesos y Usuarios', icon: Shield, accion: 'usuarios.ver' },
]
