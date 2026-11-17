# Reporte de Arquitectura de Roles — FYAG ERP (Apex Systems)

Fecha: 15 de noviembre de 2026 · Alcance: backend Django + frontend React (PWA)

---

## 1. Resumen ejecutivo

### Qué se encontró en la auditoría inicial

- **Cinco roles en el servidor** (`ADMIN`, `FINANZAS`, `OPERACIONES`, `TECNICO`, `RRHH`) en un único campo `role` de `accounts.CustomUser`. No se usan grupos ni permisos de Django.
- **Una matriz de permisos única**, definida en `src/domain/rbac.js` y copiada al servidor por un script (`backend/erp/permisos_generados.py`). Una prueba falla si ambas difieren. Esta base era sólida y se conservó.
- **Dos roles que solo existían en la interfaz** (`BODEGA` y `CONSULTA`): nadie podía iniciar sesión con ellos.
- **Cuatro mecanismos de permiso** en el backend, con reglas distintas para el Administrador.
- **No existía forma de cambiar el rol de un usuario** desde la aplicación; solo desde el panel técnico de Django.
- **Un hueco en el control de stock:** cualquier rol que pudiera registrar compras o aprobar conteos podía crear por la API una salida o una reversa de bodega, aunque la pantalla no se lo ofreciera.
- **La gestión de usuarios y las aprobaciones de negocio estaban en el mismo rol** (el Administrador), sin un perfil técnico separado ni un perfil de auditoría real.

### Cómo se elevó al estándar corporativo

- **Tres roles nuevos en el servidor:** Super Admin (TI y Seguridad), Ejecutivo Comercial y Auditor Externo. Con los cinco existentes cubren los ocho perfiles pedidos.
- **Ningún rol existente perdió permisos.** Los códigos de rol, las tablas, las apps de Django y los datos de demostración siguen igual; la única migración amplía las opciones del campo `role`.
- **Auditor de solo lectura garantizado en el servidor:** toda petición suya que no sea `GET` recibe `403`, en cualquier endpoint presente o futuro.
- **Acciones críticas blindadas en la API:** aprobar presupuestos, emitir factura electrónica, modificar stock y cambiar roles devuelven `403` a quien no tiene el permiso.
- **Stock con permiso por tipo de movimiento:** entrada, salida, reversa, reingreso y ajuste exigen cada uno su propio permiso.
- **Pantallas adaptadas por rol:** menú, inicio, botones y un distintivo «Modo lectura» para el auditor.

### Estado de la verificación

| Comprobación | Resultado |
|---|---|
| `manage.py check` | Sin problemas |
| Migraciones pendientes (`makemigrations --check`) | Ninguna |
| Compilación de todos los módulos Python | Correcta |
| `npm run build` | Correcto (2772 módulos) |
| Pruebas de frontend | 429 pasan, 8 omitidas |
| Suite completa de backend | 533 pasan (incluye roles corporativos y cumplimiento laboral) |
| Matriz frontend ↔ servidor | Sincronizada |

**No verificado:** las pantallas nuevas no se probaron en el navegador con una sesión real, porque el ingreso exige 2FA. Los cambios no están confirmados en git.

---

## 2. Matriz de roles y permisos

La matriz completa, permiso por permiso, se genera sola en `docs/matriz-permisos.md` (`npm run docs:permisos`). Esta tabla la resume.

| Rol corporativo | Código en Django | Descripción | Módulos accesibles | Puede | No puede |
|---|---|---|---|---|---|
| **Super Admin** (TI y Seguridad) | `SUPERADMIN` *(nuevo)* | Administra accesos y vigila el sistema. No participa del negocio | Inicio, Log de Auditoría, Accesos y Usuarios, Estado del Sistema | Crear accesos, cambiar roles, desactivar y reactivar cuentas, ver el log de auditoría, ver la salud de servicios e integraciones | Ver presupuestos, obras, bodega, costos o personal; crear o aprobar cualquier registro de negocio |
| **Gerente General** | `ADMIN` | Dirección ejecutiva: autoriza y supervisa | Todos los del ERP salvo Estado del Sistema | Aprobar presupuestos (único que aprueba con margen < 20 %), cerrar obras, aprobar ajustes de inventario, emitir factura electrónica, ver todas las áreas, administrar accesos | Ejecutar tareas operativas: crear presupuestos u obras, mover stock, registrar compras, editar personal |
| **Finanzas y Tributario** (Contador) | `FINANZAS` | Contabilidad y cumplimiento ante el SII | Inicio, Presupuestos, Obras, Bodega, Compras, Terreno, Personal (lectura), Finiquitos por Pagar, Clientes y Proveedores, Auditoría | Emitir factura electrónica y descargar su PDF, registrar compras y notas de crédito, pagar finiquitos, gestionar clientes y proveedores, crear y aprobar presupuestos sobre el margen mínimo | Mover stock (salidas, reversas, reingresos), modificar personal o flota, generar finiquitos, administrar usuarios |
| **Recursos Humanos** | `RRHH` | Gestión de personas y flota | Inicio, Personal y Flota, Contratos y Finiquitos | Editar fichas y tarifas hora-hombre, contratos, documentos laborales, generar finiquitos, gestionar vehículos, ver asistencia | Pagar finiquitos; ver presupuestos, bodega, compras o facturación |
| **Operaciones y Bodega** | `OPERACIONES` | Ejecución de obras e inventario | Inicio, Presupuestos, Obras, Bodega y Cardex, Compras, Auditoría de Terreno | Crear y cerrar obras, abrir emergencias, gestionar artículos, mover stock, registrar conteos y compras, auditar hojas de terreno | Emitir facturas, aprobar presupuestos, aprobar ajustes de inventario, pagar finiquitos, ver personal o auditoría |
| **Ejecutivo Comercial** | `COMERCIAL` *(nuevo)* | Ventas y cartera de clientes | Inicio, Presupuestos, Clientes | Crear, simular y enviar presupuestos; crear y editar clientes; exportar | Aprobar presupuestos, ver o editar proveedores, ver obras, bodega, compras, personal o facturación |
| **Técnico en Terreno** | `TECNICO` | Trabajo en obra desde el celular | Solo la app de terreno (`/app`) | Hojas de servicio, horas, checklist, reloj control, solicitudes de retiro, firma de sus documentos | Entrar al ERP; ver costos u obras que no tiene asignadas |
| **Auditor Externo** | `AUDITOR` *(nuevo)* | Revisión de cumplimiento, solo lectura | Inicio, Presupuestos, Obras, Bodega, Compras, Terreno, Personal, Finiquitos, Clientes y Proveedores, Auditoría | Consultar y exportar; ver estado y PDF de facturas; ver contratos y finiquitos | Cualquier escritura (el servidor rechaza todo lo que no sea `GET`), administrar usuarios, usar el asistente de IA |

### Reglas de segregación verificadas automáticamente

Las comprueba `verificarSegregacion()` en `src/domain/matrizPermisos.js`; si alguien amplía un permiso de forma indebida, una prueba falla.

- Solo el Super Admin y la Gerencia General gestionan usuarios.
- El Super Admin no opera ni aprueba nada del negocio, ni ve costos.
- El Gerente General no ejecuta tareas operativas y conserva la autorización.
- El Ejecutivo Comercial prepara, pero no aprueba.
- Operaciones y Bodega no emite facturas, no paga y no aprueba presupuestos.
- El Auditor Externo solo tiene permisos de lectura.
- Quien genera el finiquito (RR. HH.) no lo paga; quien lo paga (Finanzas) no lo genera.
- Solo RR. HH. modifica personal y flota.
- El Técnico solo usa la app de terreno.
- No existe ninguna acción de borrado.

### Solapamientos que se dejaron como estaban

Se conservaron para no cortar flujos que ya funcionan. Cada uno se corrige cambiando una línea de la matriz.

1. **La Gerencia General también administra usuarios.** Si se le quitaba, una instalación ya desplegada quedaba sin nadie capaz de crear accesos. Con un Super Admin activo, la segregación estricta es quitar `ADMIN_GENERAL` de `usuarios.ver`, `usuarios.crear` y `usuarios.editar` en `rbac.js` y ejecutar `npm run permisos:servidor`.
2. **La Gerencia General puede emitir la factura electrónica**, además de Finanzas.
3. **Finanzas crea y aprueba presupuestos.** Se mitiga porque bajo 20 % de margen solo aprueba Gerencia.
4. **Finanzas y Operaciones siguen pudiendo crear presupuestos**, aunque ya existe el Ejecutivo Comercial.

---

## 3. Detalle técnico de cambios

### Backend — archivos creados

| Archivo | Qué contiene |
|---|---|
| `backend/accounts/authentication.py` | `JWTConAuditorSoloLectura`: autenticación JWT que rechaza con `403 solo_lectura` toda petición no `GET` del Auditor Externo |
| `backend/accounts/migrations/0008_roles_corporativos.py` | Amplía las opciones del campo `role`. No toca datos |
| `backend/erp/tests/test_roles_corporativos.py` | 18 pruebas: Super Admin, Comercial, Auditor, cambio de rol, resumen tributario y acciones críticas |

### Backend — archivos modificados

| Archivo | Qué se agregó |
|---|---|
| `accounts/models.py` | Roles `SUPERADMIN`, `COMERCIAL`, `AUDITOR`; constante `GESTORES_DE_USUARIOS`; `createsuperuser` crea un Super Admin |
| `accounts/permissions.py` | `IsAdminRole` acepta a los dos gestores de accesos |
| `accounts/serializers.py` | `UserUpdateSerializer` (nombre y rol) |
| `accounts/views.py` | `UserDetailView` (`PATCH /api/users/<id>/`): cambio de rol con `403` sobre el rol propio, `409` sobre el último Administrador y cierre de sesiones |
| `accounts/urls.py` | Ruta `users/<id>/` |
| `accounts/bloqueo.py` | Los roles nuevos siguen las reglas de bloqueo de oficina |
| `accounts/management/commands/seed_fyag.py` | Tres cuentas de demostración nuevas |
| `config/settings.py` | La autenticación por defecto pasa a `JWTConAuditorSoloLectura` |
| `erp/tablas.py` | Mapa de roles ampliado; `clientes.gestionar`; quien cotiza lee catálogo y tarifas |
| `erp/escritura.py` | `PERMISO_POR_MOVIMIENTO`: permiso propio por tipo de movimiento de stock; clientes editables con `clientes.gestionar` |
| `erp/permisos_generados.py` | Regenerado desde la matriz del frontend |
| `erp/demo/mundo.py` | `poblar_demo` crea las tres cuentas nuevas después de los técnicos |
| `evidencias/salud.py` | `EstadoSistemaView` (`GET /api/sistema/estado/`) y su permiso `PuedeVerSistema` |
| `evidencias/urls.py` | Ruta `sistema/estado/` |
| `facturacion/views.py` | `facturacion.ver` separa consultar de emitir; `ResumenDTEView` (`GET /api/facturacion/resumen/`) |
| `facturacion/urls.py` | Ruta `facturacion/resumen/` |
| `rrhh/views.py` | El Auditor lee contratos y finiquitos |
| `ai_agent/prompts.py` | Perfiles de conversación para Super Admin y Comercial |
| `ai_agent/management/commands/ai_probar.py` | Acepta los roles nuevos |

### Frontend — archivos creados

| Archivo | Qué contiene |
|---|---|
| `src/features/erp/sistema/SistemaPage.jsx` | Pantalla Estado del Sistema: servicios, integraciones y accesos por rol |
| `src/services/sistema.service.js` | Llamada a `/sistema/estado/` |
| `src/services/__tests__/rolesCorporativos.test.js` | 7 pruebas de menú y permisos de los roles nuevos |

### Frontend — archivos modificados

| Archivo | Qué se agregó |
|---|---|
| `src/domain/rbac.js` | Roles `SUPER_ADMIN` y `COMERCIAL`; permisos `sistema.ver`, `clientes.gestionar`, `facturacion.ver`; etiquetas y descripciones corporativas |
| `src/domain/rolesApi.js` | Traducción de los roles nuevos; `ROLES_ERP` |
| `src/domain/matrizPermisos.js` | Reglas de segregación nuevas y observaciones documentadas |
| `src/domain/ia.js` | Asistente para Super Admin y Comercial; el Auditor no lo tiene |
| `src/app/router.jsx` | `/erp` admite los roles nuevos; ruta `/erp/sistema` |
| `src/layouts/nav.js` | Entrada de menú Estado del Sistema |
| `src/layouts/ErpLayout.jsx` | Distintivo «Modo lectura» para el Auditor |
| `src/components/domain/RolBadge.jsx`, `Avatar.jsx` | Etiquetas y colores de los ocho roles |
| `src/features/erp/usuarios/UsuariosList.jsx` | Botón Editar (nombre y rol), descripción de cada rol, corrección de «Tu cuenta» |
| `src/features/erp/dashboard/DashboardPage.jsx`, `enfoques.js` | Indicadores tributarios (facturado, IVA, DTE con observaciones); inicio propio para Super Admin y Comercial |
| `src/features/erp/maestros/MaestrosPage.jsx`, `MaestroTab.jsx` | Pestañas según permiso; el Comercial gestiona solo clientes |
| `src/features/erp/facturacion/FacturacionPanel.jsx` | Vista de consulta sin botón de emisión |
| `src/services/maestros.service.js`, `usuarios.service.js`, `facturacion.service.js`, `index.js` | Gestión de clientes por permiso, `update`, `resumen`, exportación del servicio nuevo |
| `src/mocks/usuarios.js`, `seed.js` | Usuarios de ejemplo para pruebas de los roles nuevos |
| Pruebas: `matrizPermisos.test.js`, `usuarios.test.js`, `seed.test.js` | Ajustadas a la matriz nueva |

### Otros

| Archivo | Qué cambió |
|---|---|
| `scripts/generar-permisos-servidor.mjs` | Traduce los roles nuevos al servidor |
| `docs/matriz-permisos.md` | Regenerado |
| `mapa_de_pruebas_fyag.md` | Agrega las tres cuentas nuevas |

### Endpoints nuevos

| Método y ruta | Quién | Para qué |
|---|---|---|
| `PATCH /api/users/<id>/` | Super Admin, Gerencia | Cambiar nombre o rol |
| `GET /api/sistema/estado/` | Super Admin | Salud de servicios, integraciones configuradas, resumen de accesos |
| `GET /api/facturacion/resumen/` | Gerencia, Finanzas, Auditor | Neto, IVA y total facturados, del mes y acumulados |

---

## 4. Credenciales de prueba (demo)

Las crea `python manage.py seed_fyag` (carpeta `backend`, con `DJANGO_DEBUG=True`). Son las que están escritas en `backend/accounts/management/commands/seed_fyag.py`.

| Rol | Correo | Contraseña | Entra a |
|---|---|---|---|
| Super Admin (TI) | `superadmin@fyag.cl` | `SuperAdmin-Apex-2026` | `/erp` |
| Gerente General | `admin@fyag.cl` | `Admin-Apex-2026` | `/erp` |
| Finanzas y Tributario | `finanzas@fyag.cl` | `Finanzas-Apex-2026` | `/erp` |
| Recursos Humanos | `rrhh@fyag.cl` | `RRHH-Apex-2026` | `/erp` |
| Operaciones y Bodega | `operaciones@fyag.cl` | `Operaciones-Apex-2026` | `/erp` |
| Ejecutivo Comercial | `comercial@fyag.cl` | `Comercial-Apex-2026` | `/erp` |
| Técnico en Terreno | `tecnico@fyag.cl` | `Tecnico-Apex-2026` | `/app` |
| Auditor Externo | `auditor@fyag.cl` | `Auditor-Apex-2026` | `/erp` |
| Jefatura de TI y Ciberseguridad | `ti@apexsystems.cl` | `TI-Apex-2026` | `/erp` |

A tener en cuenta:

- **Primer ingreso:** cada cuenta debe vincular una app autenticadora (2FA) antes de entrar.
- **`seed_fyag` restablece estas contraseñas cada vez que se ejecuta.** Si tu base local ya tenía otras (el `mapa_de_pruebas_fyag.md` lista las terminadas en `-FYAG-2026`), las cuentas antiguas conservan las suyas hasta que vuelvas a ejecutar el comando.
- **`poblar_demo`** (el que usa el despliegue con `APEX_SEED_DEMO=1`) también crea las tres cuentas nuevas, pero con la contraseña de `FYAG_SEED_PASSWORD` o una generada al azar que aparece en el log.
- **Solo para demostración.** `seed_fyag` se niega a ejecutarse con `DEBUG=False` salvo que se fuerce; estas contraseñas no deben existir en producción.

---

## 5. Justificación de cumplimiento

### Gerencia General

- Conserva la decisión final: es el único rol que aprueba un presupuesto con margen bajo 20 %, y el servidor lo hace cumplir aunque otro rol tenga el permiso de aprobar.
- Ve todas las áreas sin ejecutar tareas operativas, de modo que quien autoriza no es quien prepara.
- Su inicio prioriza venta aprobada, margen ponderado, costo real de obras y facturación del mes.

### Contabilidad y SII

- La emisión de la factura electrónica está limitada a Finanzas y Gerencia, con una factura por obra, folio único y bloqueo contra doble emisión.
- El desglose neto, IVA (19 %) y total se calcula y guarda en el servidor al emitir; no cambia aunque después se edite el cliente o el presupuesto.
- Finanzas ve en su inicio lo facturado en el mes, el IVA débito y los documentos rechazados o en proceso.
- Operaciones, RR. HH., Comercial y el Super Admin reciben `403` al intentar emitir.

### Recursos Humanos

- Es el único rol que modifica fichas, tarifas hora-hombre, contratos y flota.
- El finiquito está segregado: RR. HH. lo genera y Finanzas lo paga, y el servidor rechaza que uno haga lo del otro.
- Los documentos laborales solo los firma su titular, con código 2FA.
- Los datos personales (RUT, fecha de ingreso) no viajan al navegador de quien no tiene el permiso; el Comercial recibe la tarifa para cotizar, pero no esos datos.

### Operaciones y Bodega

- Controla obras, inventario, conteos y recepción de compras, sin acceso a facturación, pagos ni aprobación de presupuestos.
- El Cardex es un libro inmutable: un error se corrige con un contra-asiento, nunca se edita ni se borra.
- Cada tipo de movimiento exige su permiso, así que registrar una compra no habilita a sacar ni a reversar stock.
- El ajuste por conteo lo aprueba otro rol distinto de quien contó.

### Auditoría de sistemas

- **Trazabilidad:** el log de auditoría registra quién hizo qué y cuándo, con valor anterior y nuevo, y no admite edición ni borrado. El servidor sella el autor.
- **Administración de accesos separada del negocio:** el Super Admin gestiona usuarios y roles, pero no ve ni toca datos comerciales o financieros.
- **Control del cambio de rol:** nadie cambia su propio rol, el cambio cierra las sesiones abiertas y queda en el registro del servidor.
- **Usuarios que no se eliminan:** se desactivan, y su historial se conserva.
- **Auditor externo real:** lee todo lo necesario para una revisión y no puede alterar nada, garantizado en el servidor y no solo en la pantalla.
- **Una sola fuente de permisos:** la matriz se define una vez y el servidor aplica una copia generada; una prueba impide que se desincronicen.
- **Sin exposición de secretos:** la pantalla Estado del Sistema indica si cada integración está configurada, nunca su clave.

---

## 6. Lo que queda fuera de este trabajo

Varias funciones de la lista de roles no tienen módulo en el sistema, así que no hay permiso que asignarles todavía:

- Órdenes de compra a proveedores y su aprobación por monto.
- Boletas, notas de débito y guías de despacho electrónicas (hoy solo existe la factura, con proveedor simulado).
- Libro de compras y ventas, y conciliación de pagos.
- Flujo de caja.
- Permisos laborales y estado de disponibilidad del personal.
- Edición de claves de integraciones desde la aplicación (se configuran como variables de entorno del servidor).

Además, siguen activos cinco endpoints antiguos que el frontend ya no usa (`/api/presupuestos/`, `/api/obras/`, `/api/articulos/`, `/api/cardex/`, `/api/asistencia/*`). No se tocaron; sus reglas de rol son más simples que la matriz y conviene decidir si se retiran.

---

## 7. Submódulo de Cumplimiento Laboral (art. 159 N°4) y People Analytics con IA

Pantalla nueva **Cumplimiento y Rotación** (`/erp/cumplimiento`), dentro del grupo de RR. HH. La ven Recursos Humanos, la Gerencia General y el Auditor Externo (permiso `cumplimiento.ver`); solo RR. HH. renueva o crea contratos.

### Qué vigila

| Situación | Nivel | Qué hace el sistema |
|---|---|---|
| Plazo fijo que vence en 30 días o menos | `RIESGO_BAJO` | Aviso para decidir con tiempo |
| Plazo fijo en 1ª renovación que vence en 15 días o menos | `RIESGO_ALTO` | Alerta crítica con la advertencia legal textual |
| Plazo pactado de más de un año | `RIESGO_ALTO` | Alerta |
| Plazo vencido y la persona sigue con contrato activo, o 2 renovaciones | `PASO_AUTOMATICO_INDEFINIDO` | Pide regularizar hoy |
| Recontratar a un ex trabajador: sería su 3er contrato a plazo, o llegaría a 12 meses en 15 | `RIESGO_ALTO` | Bloquea la creación (409) y muestra los días exactos de espera |
| Las dos condiciones anteriores a la vez (presunción legal) | `PASO_AUTOMATICO_INDEFINIDO` | Igual que arriba |

La regla de recontratación es más prudente que la ley: avisa con **una** de las dos condiciones, mientras que la presunción legal exige **las dos**. RR. HH. puede crear el contrato de todos modos confirmando la advertencia. Es una ayuda para planificar, no un dictamen legal.

### Backend

| Archivo | Qué contiene |
|---|---|
| `rrhh/migrations/0006_historial_contratos.py` | Tres campos nuevos en `Contrato`, retrocompatibles: `tipo`, `numero_renovacion` (0 por defecto) y `motivo_termino` |
| `rrhh/models.py` | El contrato terminado conserva el tipo con que terminó aunque la ficha cambie después |
| `rrhh/cumplimiento.py` *(nuevo)* | Funciones puras: tiempo trabajado (total y en 15 meses), lagunas, alertas del contrato vigente, evaluación de recontratación con días de espera, y métricas de rotación |
| `rrhh/analitica.py` *(nuevo)* | Arma el historial desde la base, el panel, y el informe de rotación (IA o motor analítico) |
| `rrhh/views.py`, `urls.py`, `permissions.py` | Endpoints y permiso `PuedeVerCumplimiento` |
| `rrhh/serializers.py` | Al pagar el finiquito se guarda el motivo de término y el tipo de contrato |
| `rrhh/demo.py`, `erp/demo/mundo.py`, `seed_fyag.py` | Casos de demostración |
| `rrhh/tests/test_cumplimiento.py` *(nuevo)* | 25 pruebas |

Los días trabajados acumulados y el estado (`VIGENTE`, `FINALIZADO`, `ALERTA_INDEFINIDO`) se calculan al consultar, no se guardan: así nunca quedan desactualizados.

| Método y ruta | Para qué |
|---|---|
| `GET /api/rrhh/cumplimiento/` | KPIs de rotación, semáforo, alertas y personas |
| `GET /api/rrhh/cumplimiento/historial/<id>/` | Línea de tiempo de una persona |
| `GET /api/rrhh/cumplimiento/evaluar/?rut=…` | ¿Se puede recontratar a plazo fijo? Días de espera y fecha segura |
| `POST /api/rrhh/contratos/<id>/renovar/` | Renueva; la 2ª renovación exige aceptar el paso a indefinido |
| `GET /api/rrhh/ia-reporte-rotacion/` | Informe Ejecutivo de Rotación y Riesgo Laboral en Markdown |

### Informe con IA

- Con `DEEPSEEK_API_KEY` configurada lo redacta DeepSeek a partir de las métricas calculadas por el servidor.
- **Sin clave, o si el proveedor falla, lo genera el motor analítico del sistema**, con las mismas cinco secciones. La respuesta indica cuál se usó.
- **Privacidad:** a la IA no viajan nombres, RUT ni correos. Cada persona va como un código (`TRAB-12`) y el servidor repone el nombre al recibir el texto.
- El costo de reemplazo es una estimación declarada: 1,5 sueldos base por baja.

### Frontend

| Archivo | Qué contiene |
|---|---|
| `src/features/erp/rrhh/CumplimientoPage.jsx` *(nuevo)* | Ocho tarjetas de KPI, semáforo de plazo fijo, altas y bajas por mes, casos que requieren decisión, tabla de personas, panel lateral con la línea de tiempo y el contador de días para recontratar, y el botón «Generar Reporte de Rotación con IA» con descarga e impresión |
| `src/domain/informe.js` *(nuevo)* | Dibuja el Markdown del informe (con tablas) sin interpretar HTML |
| `src/features/erp/rrhh/ModuloRRHH.jsx` | Alerta roja al crear un contrato en riesgo; acceso a la pantalla nueva |
| `src/services/rrhh.service.js`, `router.jsx`, `nav.js`, `rbac.js` | Servicios, ruta, menú y permiso |

### Datos de demostración

Los crea `cargar_demo_cumplimiento()` (desde `seed_fyag --demo` y `poblar_demo`), una sola vez y con fechas relativas al día en que se ejecuta:

- **Renovación Demo:** plazo fijo en 1ª renovación que vence en 9 días (alerta roja).
- **Recontratación Demo:** ex trabajador con dos contratos a plazo en 14 meses (muestra los días de espera).
- **Cuatro bajas** repartidas en el último año, con distintos motivos, para que la rotación y el informe tengan cifras desde el primer clic.

### Limitación conocida

«Área con mayor fuga» agrupa por el cargo de la ficha de personal del ERP; las personas de demostración no tienen esa ficha y aparecen agrupadas por su rol.

---

## 8. Módulo de TI: Gobernanza de IA y Agente Copiloto con cursor visual

El asistente pasó de conversar a **operar la interfaz a la vista de la persona**, dentro de lo que su rol permite, y cada consulta queda registrada para el área de TI.

### Rol de TI

El rol de TI y Ciberseguridad es el `SUPERADMIN` que ya existía (Super Admin · TI y Seguridad). **No se creó un rol duplicado:** se consolidó ese, se le sumó la gobernanza de la IA y se agregó la cuenta de demostración `ti@apexsystems.cl`. Su menú: Inicio, Log de Auditoría, Accesos y Usuarios, Gobernanza IA y Estado del Sistema.

| Permiso | Quién | Qué permite |
|---|---|---|
| `gobernanza_ia.ver` | TI y Gerencia General | Ver la trazabilidad de prompts y las políticas del agente |
| `gobernanza_ia.gestionar` | Solo TI | Cambiar lo que el agente puede hacer para cada rol |

### Los tres controles (no dependen del modelo)

Un modelo puede equivocarse o dejarse convencer; estas reglas se ejecutan en el servidor antes y después de consultarlo (`ai_agent/gobernanza.py`).

1. **Ámbito por rol.** Antes de llamar a la IA se revisa si el mensaje toca un tema que el rol no tiene en la matriz de permisos. Si es así se rechaza con cortesía citando la política de seguridad interna, **sin llamar al modelo**, y queda como `BLOQUEADO_POR_ROL`. Si además pide exportar datos o el tema es sensible, el riesgo es `ALTO`.
2. **Aclaración.** Una orden incompleta («Crea una orden», «Busca al trabajador», «Revisa el presupuesto») no se adivina: el agente pregunta y ofrece hasta cuatro respuestas rápidas propias del área de la persona. Queda como `REQUIERE_ACLARACION`.
3. **Acciones de interfaz.** El agente solo propone; el servidor arma la lista `ui_actions` con lo que valida contra las pantallas de la persona, los objetivos y formularios conocidos, su permiso y la política de TI. El cliente vuelve a validar cada acción antes de ejecutarla.

### Matriz de derechos y deberes del agente

Los temas salen de la matriz de permisos; no hay una lista aparte que mantener.

| Rol | Puede tratar | Rechaza y registra |
|---|---|---|
| Gerente General | Todo el negocio: remuneraciones, presupuestos y márgenes, facturación, clientes, inventario, auditoría | — (visión transversal) |
| Finanzas y Tributario | Facturación (DTE, IVA, SII), presupuestos y márgenes, clientes, inventario, finiquitos, auditoría | Rotación de personal, credenciales y accesos |
| Recursos Humanos | Remuneraciones y contratos, fichas, rotación y alertas de plazo fijo (art. 159 N°4) | Presupuestos y márgenes, facturación, clientes, inventario, accesos, auditoría |
| Operaciones y Bodega | Inventario y stock, presupuestos, clientes | Remuneraciones, fichas, rotación, facturación electrónica, accesos, auditoría |
| Ejecutivo Comercial | Presupuestos y márgenes, clientes | Remuneraciones, fichas, facturación, inventario, accesos, auditoría |
| TI (Super Admin) | Accesos y usuarios, log de auditoría, estado del sistema, gobernanza de IA | Todo dato de negocio: remuneraciones, márgenes, facturación, clientes, inventario |
| Técnico en Terreno | Su trabajo técnico y los materiales | Todo lo demás |
| Auditor Externo | No tiene asistente (su cuenta solo hace lecturas) | — |

Además, TI enciende o apaga por rol, desde el panel: el asistente completo, navegar, buscar y filtrar, resaltar, completar formularios, reportes y cálculos, y el máximo de acciones automáticas por respuesta (0 a 8).

### Protocolo `ui_actions`

`POST /api/ai/chat/` conserva sus campos de siempre y agrega `ui_actions`, `opciones` (respuestas rápidas), `estado_seguridad` y `motor`.

| Acción | Qué hace el cursor del agente | Límite |
|---|---|---|
| `NAVIGATE` | Va hasta el ítem del menú, hace clic con efecto de onda y cambia de pantalla | Solo pantallas del menú de la persona |
| `SEARCH_OR_FILTER` | Señala el buscador, escribe el texto letra por letra y aplica el filtro | Solo pantallas que admiten búsqueda |
| `HIGHLIGHT_ELEMENT` | Va hasta un indicador, alerta o panel y lo ilumina | Solo objetivos de una lista cerrada del servidor |
| `FILL_FORM` | Abre el formulario y completa sus campos uno a uno | Solo formularios conocidos y con permiso; **nunca pulsa el botón final** |

- **Humano en el circuito:** al terminar de completar un formulario, el cursor deja resaltado el botón de confirmación y avisa «Revisa y confirma tú». El agente no guarda nada.
- **Cancelación:** cualquier clic o la tecla Escape corta la animación.
- **Accesibilidad:** con «reducir movimiento», o en teléfono sin menú lateral, se llega al mismo resultado sin animación.
- **Objetivos:** los elementos llevan `data-agent-target` (`menu-bodega`, `search-input`, `kpi-rotacion`, `btn-nuevo-cliente`…) y los campos `data-agent-field`; el cursor calcula su posición con `getBoundingClientRect()`.
- Hoy el único formulario habilitado es **Nuevo cliente**. Agregar otro es declarar sus campos y su permiso en `FORMULARIOS` (servidor y cliente) y marcar sus campos.

### Bitácora de prompts (`AIPromptAuditLog`)

Una fila por mensaje, escrita solo por el servidor: usuario, rol activo en ese momento, fecha, pantalla de origen, prompt, respuesta, acciones de interfaz autorizadas, tokens estimados, latencia, estado de seguridad (`PERMITIDO`, `BLOQUEADO_POR_ROL`, `REQUIERE_ACLARACION`), nivel de riesgo (`BAJO`, `MEDIO`, `ALTO`), motivo y motor que respondió.

- **Inmutable:** el modelo rechaza editar o borrar una fila, también en bloque, y la API solo admite `GET`.
- Los tokens son una estimación (≈ 4 caracteres por token).
- `acciones_ui_ejecutadas` guarda las acciones que el servidor **autorizó**; si la persona cancela la animación, el navegador no lo informa.

### Motor local de respaldo

Sin `DEEPSEEK_API_KEY`, el agente sigue operando la interfaz con un motor determinista: entiende «llévame a…», «busca X en Y», «muéstrame dónde está…» y «registra el cliente…». Los controles de ámbito y aclaración valen igual. Con una clave configurada pero rechazada o con el proveedor caído, el chat devuelve el mismo error de siempre: ese comportamiento no se cambió.

### Archivos

| Backend | Qué contiene |
|---|---|
| `ai_agent/models.py`, `migrations/0001_gobernanza_ia.py` *(nuevos)* | `AIPromptAuditLog` y `AIPoliticaRol` |
| `ai_agent/gobernanza.py` *(nuevo)* | Ámbito por rol, aclaraciones, construcción de `ui_actions`, prompt dinámico, motor local y registro en bitácora |
| `ai_agent/demo.py` *(nuevo)* | Bitácora inicial de demostración |
| `ai_agent/views.py`, `urls.py`, `permissions.py`, `serializers.py`, `services.py` | El chat pasa por la gobernanza; endpoints del panel; campo `origen` |
| `ai_agent/tests/test_gobernanza.py` *(nuevo)* | 21 pruebas |

| Frontend | Qué contiene |
|---|---|
| `src/lib/guiaCursor.js` | `ejecutarPlan`: el cursor «Apex AI» con halo y etiqueta flotante, y las cuatro acciones (se extendió el cursor guía que ya existía) |
| `src/features/ia/agente.js` | `planDeAcciones`: segunda validación en el cliente |
| `src/features/ia/AsistenteIA.jsx` | Respuestas rápidas, aviso de consulta bloqueada y constancia de lo que hizo el agente |
| `src/features/erp/sistema/GobernanzaIAPage.jsx` *(nuevo)* | Trazabilidad en vivo (se actualiza cada 10 s) con filtros y alertas en rojo, detalle de cada prompt, y derechos y deberes del agente por rol |
| `ErpLayout.jsx`, `Card.jsx`, `MaestroTab.jsx`, `FiltroBusqueda.jsx`, `DashboardPage.jsx`, `CumplimientoPage.jsx`, `SistemaPage.jsx` | Atributos `data-agent-target` y `data-agent-field` |
| `src/features/ia/__tests__/copiloto.test.js` *(nuevo)* | 6 pruebas |

| Método y ruta | Quién | Para qué |
|---|---|---|
| `GET /api/ai/gobernanza/bitacora/` | TI, Gerencia | Trazabilidad con filtros por usuario, rol, estado, riesgo y fechas |
| `GET /api/ai/gobernanza/politicas/` | TI, Gerencia | Derechos y deberes del agente por rol |
| `PATCH /api/ai/gobernanza/politicas/<ROL>/` | Solo TI | Cambiar interruptores y límite de acciones |

### Datos de demostración

`seed_fyag --demo` y `poblar_demo` cargan doce consultas de ejemplo repartidas en los últimos tres días: navegación, búsqueda, resaltado, un formulario completado, una aclaración y **dos alertas rojas** (Operaciones y Bodega pidiendo los sueldos de la Gerencia, y un técnico intentando exportar la base de clientes). Se cargan una sola vez.

### Límites conocidos

- El control de ámbito reconoce los temas por palabras clave: puede rechazar una pregunta general que nombre un tema ajeno (por ejemplo, un técnico preguntando qué es el IVA) y dejar pasar una redacción rebuscada, que entonces depende de las instrucciones del modelo.
- El filtro que escribe el cursor se aplica en la URL de la lista (`?buscar=`); el cursor señala el buscador superior, pero no abre su ventana.
- El camino con IA real se probó contra DeepSeek con datos de demostración (navegar y buscar, resaltar, completar el formulario de cliente, pedir aclaración, rechazar una consulta de sueldos redactada sin palabras clave, y el informe de rotación). No se probó en el navegador con la IA real: ahí se usó el motor local.
