# Matriz de permisos y segregación de funciones

> Documento **generado** desde `src/domain/rbac.js` (`PERMISOS` y `CATALOGO_PERMISOS`). No se edita a mano: ejecuta `npm run docs:permisos`.
> Una prueba automática falla si este archivo no coincide con el código.

## 1. Roles

| Rol | Código | Qué hace | Lectura | Aprobación | Operativas | Sistema |
| --- | --- | --- | :-: | :-: | :-: | :-: |
| **Administrador General** | `ADMIN_GENERAL` | Autoriza y supervisa: aprueba presupuestos con margen bajo, cierra obras, ve toda la gestión y administra los accesos. No ejecuta tareas operativas. | 15 | 2 | 0 | 2 |
| **Administración** | `ADMINISTRACION` | Presupuestos, compras, clientes y proveedores, y auditoría. Ve el personal, pero no lo modifica. | 14 | 1 | 4 | 0 |
| **Bodega** | `BODEGA` | Artículos, Cardex, compras y solicitudes de retiro. | 8 | 0 | 5 | 0 |
| **Supervisor de Obras** | `SUPERVISOR` | Obras, CU30, auditoría de hojas de terreno y presupuestos. | 8 | 1 | 4 | 0 |
| **Técnico de Terreno** | `TECNICO` | Solo la app de terreno: hojas de servicio y retiro de materiales. | 0 | 0 | 1 | 0 |
| **Consulta (Gerencia)** | `CONSULTA` | Solo lectura de la información de gestión. No puede modificar nada. | 14 | 0 | 0 | 0 |
| **Recursos Humanos** | `RRHH` | Único rol que modifica personal y flota: fichas, tarifas, vehículos y vencimientos. | 2 | 0 | 1 | 0 |

Las cifras son la cantidad de permisos de cada clase que tiene el rol.

## 2. Matriz de permisos

✅ permitido · — sin permiso. Clases: **Lectura** (ver o exportar), **Aprobación** (autorizar lo que otro preparó), **Operativa** (ejecutar el trabajo diario) y **Sistema** (administrar accesos).

| Módulo | Permiso | Clase | Qué permite | Admin. General | Administración | Bodega | Supervisor | Técnico | Consulta | RRHH |
| --- | --- | --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Dashboard | `dashboard.ver` | Lectura | Ver el tablero de indicadores (cada rol ve solo los de su ámbito) | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Presupuestos | `presupuestos.ver` | Lectura | Ver presupuestos y su simulación de rentabilidad | ✅ | ✅ | — | ✅ | — | ✅ | — |
| Presupuestos | `presupuestos.crear` | Operativa | Crear y editar presupuestos en borrador o enviados | — | ✅ | — | ✅ | — | — | — |
| Presupuestos | `presupuestos.aprobar` | Aprobación | Aprobar o rechazar presupuestos (con margen < 20 % solo el Administrador General) | ✅ | ✅ | — | — | — | — | — |
| Obras | `obras.ver` | Lectura | Ver obras y su panel de cierre | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Obras | `obras.crear` | Operativa | Crear, iniciar y regularizar obras | — | ✅ | — | ✅ | — | — | — |
| Obras | `obras.emergencia` | Operativa | Abrir obras de emergencia o garantía sin presupuesto previo (CU30) | — | — | — | ✅ | — | — | — |
| Obras | `obras.cerrar` | Aprobación | Finalizar una obra que cumple los 6 requisitos de cierre | ✅ | — | — | ✅ | — | — | — |
| Bodega | `bodega.ver` | Lectura | Ver artículos, stock, Cardex y solicitudes de retiro | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Bodega | `articulos.gestionar` | Operativa | Crear, editar y desactivar artículos | — | — | ✅ | — | — | — | — |
| Bodega | `cardex.crear` | Operativa | Registrar salidas a obra y entregar solicitudes de retiro | — | — | ✅ | — | — | — | — |
| Bodega | `cardex.reversar` | Operativa | Reversar un movimiento del Cardex (contra-asiento auditado) | — | — | ✅ | — | — | — | — |
| Bodega | `cardex.reingresar` | Operativa | Reingresar sobrantes y conciliarlos | — | — | ✅ | — | — | — | — |
| Compras | `compras.ver` | Lectura | Ver facturas de compra y notas de crédito | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Compras | `compras.registrar` | Operativa | Registrar facturas (hasta 3 descuentos) y notas de crédito | — | ✅ | ✅ | — | — | — | — |
| Auditoría de terreno | `terreno.ver` | Lectura | Ver las hojas de servicio enviadas desde la app móvil | ✅ | ✅ | — | ✅ | — | ✅ | — |
| Auditoría de terreno | `hojas.auditar` | Operativa | Aprobar o devolver hojas de servicio | — | — | — | ✅ | — | — | — |
| Personal y Flota | `personal.ver` | Lectura | Ver fichas, tarifas, vehículos y vencimientos | ✅ | ✅ | — | — | — | ✅ | ✅ |
| Personal y Flota | `personal.editar` | Operativa | Modificar fichas, tarifas hora-hombre y estado de vehículos | — | — | — | — | — | — | ✅ |
| Clientes y Proveedores | `maestros.ver` | Lectura | Ver el módulo de clientes y proveedores | ✅ | ✅ | — | — | — | ✅ | — |
| Clientes y Proveedores | `clientes.ver` | Lectura | Consultar clientes (para presupuestos y obras) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Clientes y Proveedores | `proveedores.ver` | Lectura | Consultar proveedores (para compras y artículos) | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Clientes y Proveedores | `maestros.gestionar` | Operativa | Crear, editar y desactivar clientes y proveedores | — | ✅ | — | — | — | — | — |
| Auditoría | `auditoria.ver` | Lectura | Ver el Log de Auditoría de todo el sistema | ✅ | ✅ | — | — | — | ✅ | — |
| Costos | `costos.ver` | Lectura | Ver costos de obras, mano de obra y tarifas hora-hombre | ✅ | ✅ | — | ✅ | — | ✅ | — |
| Costos | `costos_compra.ver` | Lectura | Ver costos de compra de artículos y valor del inventario | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Exportación | `exportar` | Lectura | Exportar listados a Excel y PDF | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Accesos y Usuarios | `usuarios.ver` | Lectura | Ver los usuarios con acceso al sistema | ✅ | — | — | — | — | — | — |
| Accesos y Usuarios | `usuarios.crear` | Sistema | Crear accesos y asignar roles y contraseña inicial | ✅ | — | — | — | — | — | — |
| Accesos y Usuarios | `usuarios.editar` | Sistema | Editar usuarios, cambiar roles, restablecer claves y desactivar accesos | ✅ | — | — | — | — | — | — |
| App de terreno | `pwa.usar` | Operativa | Usar la app móvil: hojas de servicio y solicitudes de retiro | — | — | — | — | ✅ | — | — |

## 3. Verificación de segregación de funciones

| | Regla | Resultado |
| :-: | --- | --- |
| ✅ | Solo el Administrador General gestiona usuarios | usuarios.ver, usuarios.crear y usuarios.editar son exclusivos del Administrador General |
| ✅ | Toda acción de administración del sistema es exclusiva del Administrador General | 2 acciones de clase «sistema» |
| ✅ | El Administrador General no ejecuta tareas operativas | Tiene 0 acciones operativas: solo lectura, aprobación y sistema |
| ✅ | El Administrador General conserva la autorización (margen < 20 % y cierre de obras) | Puede aprobar presupuestos y finalizar obras |
| ✅ | Consulta es estrictamente solo lectura | 14 permisos y todos son de lectura |
| ✅ | RRHH controla únicamente Personal y Flota | Solo dashboard.ver, personal.editar, personal.ver |
| ✅ | Solo RRHH modifica el personal y la flota (personal.editar) | Administración (Finanzas) y el Administrador General ya no lo modifican |
| ✅ | El Técnico solo usa la app de terreno | Su único permiso es pwa.usar |
| ✅ | Toda acción está catalogada y solo nombra roles existentes | 31 acciones catalogadas |
| ✅ | Ninguna acción permite borrar (Cardex y entidades críticas inmutables) | No existen acciones de eliminación |

## 4. Observaciones (sin cambios)

Solapamientos que existen hoy, pero que no corresponden a las tres reglas verificadas arriba. Se dejan documentados para decidirlos por separado:

- **Administración crea y aprueba presupuestos** (`presupuestos.crear` y `presupuestos.aprobar`): preparador y aprobador son el mismo rol. Se mitiga porque los de margen < 20 % solo los aprueba el Administrador General.
- **Bodega crea y también reversa o reingresa movimientos del Cardex.** Cada reversa exige motivo y queda auditada, pero no la autoriza otro rol.
- **Supervisor crea obras, las cierra y audita las hojas de sus técnicos.** Es la combinación más amplia fuera de la Gerencia; si se quiere separar, `obras.cerrar` o `hojas.auditar` pasarían a otro rol.
- **Administración y Bodega registran compras** sin una aprobación posterior de otro rol.
- **Administración ve las tarifas y fichas del personal** (`personal.ver`) para costear presupuestos, pero ya no las modifica.

## 5. Reglas de negocio que complementan los permisos

- Un presupuesto con **margen < 20 %** solo lo aprueba el Administrador General, aunque Administración tenga `presupuestos.aprobar` (`domain/rentabilidad.js`).
- El **Técnico** solo ve las obras en las que está asignado y nunca ve costos.
- Los **costos** se ocultan en los servicios a quien no tiene `costos.ver` o `costos_compra.ver`.
- Un acceso no se elimina: se desactiva. No se puede desactivar el propio acceso ni dejar al sistema sin un Administrador General activo.
