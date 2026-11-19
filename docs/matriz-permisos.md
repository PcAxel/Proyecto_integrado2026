# Matriz de permisos y segregación de funciones

> Documento **generado** desde `src/domain/rbac.js` (`PERMISOS` y `CATALOGO_PERMISOS`). No se edita a mano: ejecuta `npm run docs:permisos`.
> Una prueba automática falla si este archivo no coincide con el código.

## 1. Roles

| Rol | Código | Qué hace | Lectura | Aprobación | Operativas | Sistema |
| --- | --- | --- | :-: | :-: | :-: | :-: |
| **Gerente General** | `ADMIN_GENERAL` | Dirección ejecutiva: aprueba presupuestos con margen bajo, cierra obras y ve toda la gestión. Administra accesos mientras no exista un área de TI. No ejecuta tareas operativas. | 21 | 5 | 0 | 3 |
| **Finanzas y Tributario** | `ADMINISTRACION` | Contabilidad y cumplimiento tributario: factura electrónica (DTE), compras, pago de finiquitos, clientes y proveedores, y auditoría. Ve el personal, pero no lo modifica. | 17 | 6 | 6 | 0 |
| **Jefe de Bodega** | `BODEGA` | Inventario y Cardex: artículos, reglas de stock, recepciones, retiros con escáner, conteos y reversas. No ve ni gestiona obras, presupuestos ni facturación. | 8 | 0 | 8 | 0 |
| **Jefe de Operaciones** | `SUPERVISOR` | Obras: delegar a terreno, auditar el trabajo de terreno (avisa a Finanzas) y CU30. Ve el inventario solo para consultar; no lo opera. No emite facturas ni toca estados financieros. | 11 | 1 | 5 | 0 |
| **Técnico en Terreno** | `TECNICO` | Solo la app de terreno: hojas de servicio, horas, reloj control y retiro de materiales. | 0 | 0 | 2 | 0 |
| **Auditor Externo** | `CONSULTA` | Revisión externa de solo lectura: finanzas, presupuestos, aprobaciones e indicadores. No puede modificar nada. | 18 | 0 | 0 | 0 |
| **Recursos Humanos** | `RRHH` | Único rol que modifica personal y flota: fichas, tarifas, contratos, vehículos y vencimientos. | 5 | 0 | 2 | 0 |
| **Super Admin (TI y Seguridad)** | `SUPER_ADMIN` | TI y seguridad: usuarios y roles, log de auditoría técnica y estado del sistema e integraciones. No participa del negocio: no crea, aprueba ni ve costos. | 3 | 0 | 0 | 5 |
| **Ejecutivo Comercial** | `COMERCIAL` | Ventas: crea y simula presupuestos y gestiona la cartera de clientes. No aprueba: bajo 20 % de margen decide Gerencia. | 7 | 0 | 2 | 0 |

Las cifras son la cantidad de permisos de cada clase que tiene el rol.

## 2. Matriz de permisos

✅ permitido · — sin permiso. Clases: **Lectura** (ver o exportar), **Aprobación** (autorizar lo que otro preparó), **Operativa** (ejecutar el trabajo diario) y **Sistema** (administrar accesos).

| Módulo | Permiso | Clase | Qué permite | Gerente Gral. | Finanzas | Bodega | Operaciones | Técnico | Auditor | RRHH | Super Admin | Comercial |
| --- | --- | --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Dashboard | `dashboard.ver` | Lectura | Ver el tablero de indicadores (cada rol ve solo los de su ámbito) | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Presupuestos | `presupuestos.ver` | Lectura | Ver presupuestos y su simulación de rentabilidad | ✅ | ✅ | — | ✅ | — | ✅ | — | — | ✅ |
| Presupuestos | `presupuestos.crear` | Operativa | Crear y editar presupuestos en borrador o enviados | — | ✅ | — | ✅ | — | — | — | — | ✅ |
| Presupuestos | `presupuestos.aprobar` | Aprobación | Aprobar o rechazar presupuestos (con margen < 20 % solo el Administrador General) | ✅ | ✅ | — | — | — | — | — | — | — |
| Obras | `obras.ver` | Lectura | Ver obras y su panel de cierre | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| Obras | `obras.crear` | Operativa | Crear, iniciar y regularizar obras | — | ✅ | — | ✅ | — | — | — | — | — |
| Obras | `obras.emergencia` | Operativa | Abrir obras de emergencia o garantía sin presupuesto previo (CU30) | — | — | — | ✅ | — | — | — | — | — |
| Obras | `obras.cerrar` | Aprobación | Dar la Auditoría de terreno OK: finalizar una obra que cumple los 6 requisitos de cierre y avisar a Finanzas | ✅ | — | — | ✅ | — | — | — | — | — |
| Obras | `obras.aprobar` | Aprobación | Aprobar o rechazar una obra nueva que creó Operaciones, antes de que pueda delegarse a terreno | — | ✅ | — | — | — | — | — | — | — |
| Obras | `obras.delegar` | Operativa | Delegar una obra a terreno: asignar técnicos y dejarla lista para que trabajen | — | — | — | ✅ | — | — | — | — | — |
| Bodega | `bodega.ver` | Lectura | Ver artículos, stock, Cardex y solicitudes de retiro | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| Bodega | `articulos.gestionar` | Operativa | Crear, editar y desactivar artículos | — | — | ✅ | — | — | — | — | — | — |
| Bodega | `cardex.crear` | Operativa | Registrar salidas a obra y entregar solicitudes de retiro | — | — | ✅ | — | — | — | — | — | — |
| Bodega | `bodega.recepcionar` | Operativa | Ingresar mercadería recibida (recepción directa con guía de despacho) | — | — | ✅ | — | — | — | — | — | — |
| Bodega | `cardex.reversar` | Operativa | Reversar un movimiento del Cardex (contra-asiento auditado) | — | — | ✅ | — | — | — | — | — | — |
| Bodega | `cardex.reingresar` | Operativa | Reingresar sobrantes y conciliarlos | — | — | ✅ | — | — | — | — | — | — |
| Bodega | `conteo.registrar` | Operativa | Registrar conteos físicos de inventario (conteo ciego) | — | — | ✅ | — | — | — | — | — | — |
| Bodega | `conteo.aprobar` | Aprobación | Aprobar o rechazar el ajuste de inventario de un conteo (siempre otra persona que quien contó) | ✅ | ✅ | — | — | — | — | — | — | — |
| Bodega | `solicitudes_compra.crear` | Operativa | Solicitar a Finanzas la compra de artículos que faltan en bodega | — | — | ✅ | — | — | — | — | — | — |
| Compras | `compras.ver` | Lectura | Ver facturas de compra y notas de crédito | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| Compras | `compras.liberar_factura` | Aprobación | Liberar una factura de compra bloqueada por discrepancia (orden de compra, recepción y factura no coinciden), con un motivo que queda en la auditoría | ✅ | ✅ | — | — | — | — | — | — | — |
| Compras | `compras.aprobar` | Aprobación | Aprobar solicitudes de compra de Bodega y emitir las órdenes de compra a proveedores | — | ✅ | — | — | — | — | — | — | — |
| Compras | `compras.registrar` | Operativa | Registrar facturas (hasta 3 descuentos) y notas de crédito | — | ✅ | ✅ | — | — | — | — | — | — |
| Facturación | `facturacion.ver` | Lectura | Ver el estado de la factura electrónica de una obra y descargar su PDF | ✅ | ✅ | — | — | — | ✅ | — | — | — |
| Facturación | `facturacion.emitir` | Aprobación | Emitir la factura electrónica (DTE, SII) de una obra finalizada y descargar su PDF | ✅ | ✅ | — | — | — | — | — | — | — |
| Cobranzas | `cobranzas.ver` | Lectura | Ver las facturas emitidas por cobrar y los pagos de los clientes | ✅ | ✅ | — | — | — | ✅ | — | — | — |
| Cobranzas | `cobranzas.gestionar` | Operativa | Registrar pagos de clientes (fecha, monto y método) y dejar la factura pagada | — | ✅ | — | — | — | — | — | — | — |
| Auditoría de terreno | `terreno.ver` | Lectura | Ver las hojas de servicio enviadas desde la app móvil | ✅ | ✅ | — | ✅ | — | ✅ | — | — | — |
| Auditoría de terreno | `hojas.auditar` | Operativa | Aprobar o devolver hojas de servicio | — | — | — | ✅ | — | — | — | — | — |
| Personal y Flota | `personal.ver` | Lectura | Ver fichas, tarifas, vehículos y vencimientos | ✅ | ✅ | — | — | — | ✅ | ✅ | — | — |
| Personal y Flota | `personal.editar` | Operativa | Modificar fichas, tarifas hora-hombre y estado de vehículos | — | — | — | — | — | — | ✅ | — | — |
| Personal y Flota | `asistencia.ver` | Lectura | Ver la asistencia diaria de los técnicos (hora de entrada, salida y ubicación) | ✅ | — | — | — | — | — | ✅ | — | — |
| Contratos y Finiquitos | `rrhh.ver` | Lectura | Ver contratos, documentos laborales y finiquitos del personal | ✅ | — | — | — | — | — | ✅ | — | — |
| Contratos y Finiquitos | `rrhh.gestionar` | Operativa | Crear contratos, subir amonestaciones y anexos, y generar finiquitos (no puede registrar su pago) | — | — | — | — | — | — | ✅ | — | — |
| Contratos y Finiquitos | `cumplimiento.ver` | Lectura | Ver el historial de contrataciones, las alertas legales de plazo fijo (art. 159 N°4), la rotación de personal y su informe con IA | ✅ | — | — | — | — | ✅ | ✅ | — | — |
| Contratos y Finiquitos | `finiquitos.ver` | Lectura | Ver los finiquitos por pagar y los ya pagados | ✅ | ✅ | — | — | — | ✅ | — | — | — |
| Contratos y Finiquitos | `finiquitos.pagar` | Operativa | Adjuntar el comprobante de transferencia y marcar un finiquito como pagado | — | ✅ | — | — | — | — | — | — | — |
| Clientes y Proveedores | `maestros.ver` | Lectura | Ver el módulo de clientes y proveedores | ✅ | ✅ | — | — | — | ✅ | — | — | ✅ |
| Clientes y Proveedores | `clientes.ver` | Lectura | Consultar clientes (para presupuestos y obras) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ |
| Clientes y Proveedores | `proveedores.ver` | Lectura | Consultar proveedores (para compras y artículos) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| Clientes y Proveedores | `maestros.gestionar` | Operativa | Crear, editar y desactivar clientes y proveedores | — | ✅ | — | — | — | — | — | — | — |
| Clientes y Proveedores | `clientes.gestionar` | Operativa | Crear, editar y desactivar clientes (cartera comercial), sin tocar proveedores | — | — | — | — | — | — | — | — | ✅ |
| Auditoría | `auditoria.ver` | Lectura | Ver el Log de Auditoría de todo el sistema | ✅ | ✅ | — | — | — | ✅ | — | ✅ | — |
| Costos | `costos.ver` | Lectura | Ver costos de obras, mano de obra y tarifas hora-hombre | ✅ | ✅ | — | ✅ | — | ✅ | — | — | ✅ |
| Costos | `costos_compra.ver` | Lectura | Ver costos de compra de artículos y valor del inventario | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ |
| Exportación | `exportar` | Lectura | Exportar listados a Excel y PDF | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ |
| Accesos y Usuarios | `usuarios.ver` | Lectura | Ver los usuarios con acceso al sistema | ✅ | — | — | — | — | — | — | ✅ | — |
| Accesos y Usuarios | `usuarios.crear` | Sistema | Crear accesos y asignar roles y contraseña inicial | ✅ | — | — | — | — | — | — | ✅ | — |
| Accesos y Usuarios | `usuarios.editar` | Sistema | Editar usuarios, cambiar roles, restablecer claves y desactivar accesos | ✅ | — | — | — | — | — | — | ✅ | — |
| Sistema | `gobernanza_ia.ver` | Sistema | Ver la trazabilidad de prompts de la IA, sus alertas de seguridad y los derechos y deberes del agente por rol | ✅ | — | — | — | — | — | — | ✅ | — |
| Sistema | `gobernanza_ia.gestionar` | Sistema | Activar o desactivar lo que el agente de IA puede hacer para cada rol y su límite de acciones automáticas | — | — | — | — | — | — | — | ✅ | — |
| Sistema | `sistema.ver` | Sistema | Ver la salud de los servicios, las integraciones configuradas y el resumen de accesos | — | — | — | — | — | — | — | ✅ | — |
| App de terreno | `asistencia.marcar` | Operativa | Marcar entrada y salida en el reloj control desde la app móvil | — | — | — | — | ✅ | — | — | — | — |
| App de terreno | `pwa.usar` | Operativa | Usar la app móvil: hojas de servicio y solicitudes de retiro | — | — | — | — | ✅ | — | — | — | — |

## 3. Verificación de segregación de funciones

| | Regla | Resultado |
| :-: | --- | --- |
| ✅ | Solo TI (Super Admin) y la Gerencia General gestionan usuarios | usuarios.ver, usuarios.crear y usuarios.editar son solo del Super Admin y del Gerente General |
| ✅ | Toda acción de administración del sistema es de TI (Super Admin) o de la Gerencia General | 5 acciones de clase «sistema» |
| ✅ | El Super Admin no opera ni aprueba nada del negocio, ni ve costos | Solo accesos, auditoría técnica y estado del sistema |
| ✅ | El Ejecutivo Comercial prepara presupuestos y clientes, pero no aprueba | Operativas: presupuestos.crear y clientes.gestionar; 0 aprobaciones |
| ✅ | Jefe de Operaciones y Jefe de Bodega no emiten facturas ni pagan | Sin facturacion.emitir, finiquitos.pagar ni presupuestos.aprobar |
| ✅ | Operaciones no opera el inventario y Bodega no delega ni audita obras | El inventario es solo de Bodega; delegar y auditar terreno es solo de Operaciones |
| ✅ | El Gerente General no ejecuta tareas operativas | Tiene 0 acciones operativas: solo lectura, aprobación y sistema |
| ✅ | El Gerente General conserva la autorización (margen < 20 % y cierre de obras) | Puede aprobar presupuestos y finalizar obras |
| ✅ | El Auditor Externo es estrictamente solo lectura | 18 permisos y todos son de lectura |
| ✅ | RRHH controla únicamente Personal y Flota, contratos y finiquitos | Solo asistencia.ver, cumplimiento.ver, dashboard.ver, personal.editar, personal.ver, rrhh.gestionar, rrhh.ver |
| ✅ | Solo RRHH modifica el personal y la flota (personal.editar) | Finanzas y el Gerente General ya no lo modifican |
| ✅ | Quien genera el finiquito (RRHH) no lo paga, y quien lo paga (Administración) no lo genera | rrhh.gestionar es de RRHH y finiquitos.pagar es de Administración |
| ✅ | El Técnico solo usa la app de terreno | Solo pwa.usar y asistencia.marcar (reloj control) |
| ✅ | Toda acción está catalogada y solo nombra roles existentes | 54 acciones catalogadas |
| ✅ | Ninguna acción permite borrar (Cardex y entidades críticas inmutables) | No existen acciones de eliminación |

## 4. Observaciones (sin cambios)

Solapamientos que existen hoy, pero que no corresponden a las tres reglas verificadas arriba. Se dejan documentados para decidirlos por separado:

- **Administración crea y aprueba presupuestos** (`presupuestos.crear` y `presupuestos.aprobar`): preparador y aprobador son el mismo rol. Se mitiga porque los de margen < 20 % solo los aprueba el Administrador General.
- **Bodega crea y también reversa o reingresa movimientos del Cardex.** Cada reversa exige motivo y queda auditada, pero no la autoriza otro rol.
- **Supervisor crea obras, las cierra y audita las hojas de sus técnicos.** Es la combinación más amplia fuera de la Gerencia; si se quiere separar, `obras.cerrar` o `hojas.auditar` pasarían a otro rol.
- **Administración y Bodega registran compras** sin una aprobación posterior de otro rol.
- **Administración ve las tarifas y fichas del personal** (`personal.ver`) para costear presupuestos, pero ya no las modifica.
- **La Gerencia General también administra accesos** (`usuarios.*`), además de aprobar. Se conserva para que ninguna instalación quede sin quien cree usuarios; con un Super Admin activo, la segregación estricta es quitar `ADMIN_GENERAL` de esas tres acciones.
- **La Gerencia General y Finanzas emiten la factura electrónica** (`facturacion.emitir`). En una segregación estricta la emisión sería solo de Finanzas y Tributario.
- **Finanzas y Operaciones siguen pudiendo crear presupuestos**, aunque ahora existe el Ejecutivo Comercial. Se dejó así para no cortar el flujo actual.

## 5. Reglas de negocio que complementan los permisos

- Un presupuesto con **margen < 20 %** solo lo aprueba el Gerente General, aunque Finanzas tenga `presupuestos.aprobar` (`domain/rentabilidad.js`).
- El **Técnico** solo ve las obras en las que está asignado y nunca ve costos.
- Los **costos** se ocultan en los servicios a quien no tiene `costos.ver` o `costos_compra.ver`.
- Un acceso no se elimina: se desactiva. No se puede desactivar el propio acceso ni dejar al sistema sin un Gerente General activo.
- El **Auditor Externo** solo puede hacer lecturas: el servidor rechaza con 403 cualquier petición suya que no sea `GET` (`accounts/authentication.py`), sin depender de esta matriz.
