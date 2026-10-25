import { LayoutDashboard, FileText, HardHat, Package, ShoppingCart, ClipboardCheck, Users, Building2, ScrollText, Shield } from 'lucide-react'

/** Menú del ERP. `accion` enlaza con domain/rbac.js. */
export const ERP_NAV = [
  { to: '/erp', label: 'Dashboard', icon: LayoutDashboard, palabras: ['inicio','resumen','indicadores','kpi'], accion: 'dashboard.ver', end: true },
  { to: '/erp/presupuestos', label: 'Presupuestos', icon: FileText, palabras: ['cotizaciones','rentabilidad','margen','ventas'], accion: 'presupuestos.ver' },
  { to: '/erp/obras', label: 'Obras', icon: HardHat, palabras: ['proyectos','cu30','emergencia','garantia'], accion: 'obras.ver' },
  { to: '/erp/bodega', label: 'Bodega y Cardex', icon: Package, palabras: ['inventario','cardex','articulos','stock','retiros','materiales'], accion: 'bodega.ver' },
  { to: '/erp/compras', label: 'Compras', icon: ShoppingCart, palabras: ['facturas','notas de credito','proveedores','descuentos'], accion: 'compras.ver' },
  { to: '/erp/terreno', label: 'Auditoría de Terreno', icon: ClipboardCheck, palabras: ['hojas de servicio','checklist','fotos','tecnicos','gps'], accion: 'terreno.ver' },
  { to: '/erp/personal', label: 'Personal y Flota', icon: Users, palabras: ['empleados','tecnicos','rrhh','flota','vehiculos','kilometraje','tarifas'], accion: 'personal.ver' },
  { to: '/erp/maestros', label: 'Clientes y Proveedores', icon: Building2, palabras: ['clientes','proveedores','rut'], accion: 'maestros.ver' },
  { to: '/erp/auditoria', label: 'Log de Auditoría', icon: ScrollText, palabras: ['log','historial','cambios','registro'], accion: 'auditoria.ver' },
  { to: '/erp/usuarios', label: 'Accesos y Usuarios', icon: Shield, palabras: ['usuarios','accesos','roles','permisos','claves','contrasenas'], accion: 'usuarios.ver' },
]
