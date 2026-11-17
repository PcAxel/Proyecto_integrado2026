import { can } from '@/domain/rbac'
import { LayoutDashboard, FileText, HardHat, Package, ShoppingCart, ClipboardCheck, Users, Building2, ScrollText, Shield, FileSignature, Wallet, Activity, Scale, BrainCircuit } from 'lucide-react'

/** ¿Esta persona ve este ítem en su menú? Permiso de lectura y, además, `ocultoPara` (roles que pueden leer pero cuyo trabajo no pasa por esa pantalla). */
export const itemVisible = (item, rol) => can(rol, item.accion) && !(item.ocultoPara ?? []).includes(rol)

/** Menú del ERP. `accion` enlaza con domain/rbac.js; `buscable`: la pantalla filtra su lista con `?buscar=` (lo usa el asistente de IA); `grupo` ordena el menú por tipo de tarea. */
export const ERP_NAV = [
  { to: '/erp', grupo: 'Inicio', label: 'Inicio', icon: LayoutDashboard, palabras: ['dashboard','resumen','indicadores','kpi','pendientes'], accion: 'dashboard.ver', end: true },
  { to: '/erp/presupuestos', grupo: 'Comercial', label: 'Presupuestos', icon: FileText, palabras: ['cotizaciones','rentabilidad','margen','ventas'], accion: 'presupuestos.ver', buscable: true },
  { to: '/erp/obras', grupo: 'Comercial', label: 'Obras', icon: HardHat, palabras: ['proyectos','cu30','emergencia','garantia'], accion: 'obras.ver', buscable: true, ocultoPara: ['BODEGA'] }, // las obras las gestiona Operaciones; Bodega ve solo su área (los retiros ya traen la obra)
  { to: '/erp/bodega', grupo: 'Operación', label: 'Bodega y Cardex', icon: Package, palabras: ['inventario','cardex','articulos','stock','retiros','materiales'], accion: 'bodega.ver', buscable: true, ocultoPara: ['SUPERVISOR'] }, // el Jefe de Operaciones consulta stock desde las obras; el inventario es del Jefe de Bodega
  { to: '/erp/compras', grupo: 'Operación', label: 'Compras', icon: ShoppingCart, palabras: ['facturas','notas de credito','proveedores','descuentos'], accion: 'compras.ver' },
  { to: '/erp/terreno', grupo: 'Operación', label: 'Auditoría de Terreno', icon: ClipboardCheck, palabras: ['hojas de servicio','checklist','fotos','tecnicos','gps'], accion: 'terreno.ver' },
  { to: '/erp/personal', grupo: 'Personas y socios', label: 'Personal y Flota', icon: Users, palabras: ['empleados','tecnicos','rrhh','flota','vehiculos','kilometraje','tarifas'], accion: 'personal.ver', buscable: true },
  { to: '/erp/rrhh', grupo: 'Personas y socios', label: 'Contratos y Finiquitos', icon: FileSignature, palabras: ['contratos','finiquito','despido','amonestacion','anexo','sueldo','indemnizacion','vacaciones'], accion: 'rrhh.ver' },
  { to: '/erp/cumplimiento', grupo: 'Personas y socios', label: 'Cumplimiento y Rotación', icon: Scale, palabras: ['plazo fijo','indefinido','renovacion','recontratar','rotacion','historial','alertas legales','articulo 159','people analytics'], accion: 'cumplimiento.ver' },
  { to: '/erp/finanzas', grupo: 'Personas y socios', label: 'Finiquitos por Pagar', icon: Wallet, palabras: ['finiquitos','pagos','transferencia','comprobante','tesoreria'], accion: 'finiquitos.ver' },
  { to: '/erp/maestros', grupo: 'Personas y socios', label: 'Clientes y Proveedores', icon: Building2, palabras: ['clientes','proveedores','rut'], accion: 'maestros.ver', buscable: true },
  { to: '/erp/auditoria', grupo: 'Control', label: 'Log de Auditoría', icon: ScrollText, palabras: ['log','historial','cambios','registro'], accion: 'auditoria.ver' },
  { to: '/erp/usuarios', grupo: 'Control', label: 'Accesos y Usuarios', icon: Shield, palabras: ['usuarios','accesos','roles','permisos','claves','contrasenas'], accion: 'usuarios.ver', buscable: true },
  { to: '/erp/gobernanza-ia', grupo: 'Control', label: 'Gobernanza IA', icon: BrainCircuit, palabras: ['ia','prompts','trazabilidad','agente','politicas','seguridad','bloqueos','ti'], accion: 'gobernanza_ia.ver' },
  { to: '/erp/sistema', grupo: 'Control', label: 'Estado del Sistema', icon: Activity, palabras: ['salud','servidor','integraciones','api','servicios','ti','seguridad'], accion: 'sistema.ver' },
]
