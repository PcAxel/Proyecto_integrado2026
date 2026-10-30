import { LayoutDashboard, FileText, HardHat, Package, ShoppingCart, ClipboardCheck, Users, Building2, ScrollText, Shield } from 'lucide-react'

/** Menú del ERP. `accion` enlaza con domain/rbac.js; `grupo` ordena el menú por tipo de tarea. */
export const ERP_NAV = [
  { to: '/erp', grupo: 'Inicio', label: 'Inicio', icon: LayoutDashboard, palabras: ['dashboard','resumen','indicadores','kpi','pendientes'], accion: 'dashboard.ver', end: true },
  { to: '/erp/presupuestos', grupo: 'Comercial', label: 'Presupuestos', icon: FileText, palabras: ['cotizaciones','rentabilidad','margen','ventas'], accion: 'presupuestos.ver' },
  { to: '/erp/obras', grupo: 'Comercial', label: 'Obras', icon: HardHat, palabras: ['proyectos','cu30','emergencia','garantia'], accion: 'obras.ver' },
  { to: '/erp/bodega', grupo: 'Operación', label: 'Bodega y Cardex', icon: Package, palabras: ['inventario','cardex','articulos','stock','retiros','materiales'], accion: 'bodega.ver' },
  { to: '/erp/compras', grupo: 'Operación', label: 'Compras', icon: ShoppingCart, palabras: ['facturas','notas de credito','proveedores','descuentos'], accion: 'compras.ver' },
  { to: '/erp/terreno', grupo: 'Operación', label: 'Auditoría de Terreno', icon: ClipboardCheck, palabras: ['hojas de servicio','checklist','fotos','tecnicos','gps'], accion: 'terreno.ver' },
  { to: '/erp/personal', grupo: 'Personas y socios', label: 'Personal y Flota', icon: Users, palabras: ['empleados','tecnicos','rrhh','flota','vehiculos','kilometraje','tarifas'], accion: 'personal.ver' },
  { to: '/erp/maestros', grupo: 'Personas y socios', label: 'Clientes y Proveedores', icon: Building2, palabras: ['clientes','proveedores','rut'], accion: 'maestros.ver' },
  { to: '/erp/auditoria', grupo: 'Control', label: 'Log de Auditoría', icon: ScrollText, palabras: ['log','historial','cambios','registro'], accion: 'auditoria.ver' },
  { to: '/erp/usuarios', grupo: 'Control', label: 'Accesos y Usuarios', icon: Shield, palabras: ['usuarios','accesos','roles','permisos','claves','contrasenas'], accion: 'usuarios.ver' },
]
