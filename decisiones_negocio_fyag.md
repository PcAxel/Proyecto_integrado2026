# FYAG ERP: decisiones de negocio y su justificación

Fecha: 9 de noviembre de 2026
Complementa a `auditoria_seguridad_fyag.md`. Aquí se explica **por qué** el sistema se comporta como una empresa real y no solo como un manual de ciberseguridad, y se registra la decisión de arquitectura del módulo de RR. HH.

---

## 1. Contexto

FYAG (Frío y Agroindustria SpA) es una empresa pequeña, sin departamento de TI. La auditoría de seguridad propuso controles pensados para organizaciones con equipos separados (infraestructura, seguridad, operaciones). Aplicarlos tal cual habría dejado a la empresa dependiente de personas que no existen.

Criterio de las decisiones de este documento: **la seguridad no puede paralizar la operación**. Cuando un control técnico choca con una necesidad real de la empresa, se decide de forma explícita, se documenta el riesgo y se compensa con otros controles.

---

## 2. Regla 1: los usuarios nunca se eliminan

**Decisión:** ningún perfil de usuario se borra del sistema. Se desactiva el acceso (`is_active = False`).

**Por qué**
- **Trazabilidad y auditoría.** Casi todo lo que hace el sistema queda ligado a una persona: firmas electrónicas de contratos, finiquitos, marcas de asistencia, aprobaciones, movimientos de bodega. Si la cuenta se borra, esos registros pierden a su autor y dejan de servir como evidencia.
- **Evidencia laboral.** Un contrato o un finiquito firmado debe poder atribuirse a la persona que lo firmó años después. El sistema ya protege esas relaciones con claves foráneas protegidas: una cuenta con documentos no puede desaparecer.
- **Reversibilidad.** Una persona puede volver a la empresa. Reactivar su cuenta es más simple y más seguro que recrearla, y conserva su historial y su 2FA.
- **Error humano.** Un borrado accidental no se puede deshacer. Una desactivación sí.

**Cómo está implementado**
- **No existe endpoint para eliminar usuarios.** Un `DELETE` contra la API responde 404 o 405.
- **El código tampoco lo permite.** `user.delete()` y `queryset.delete()` lanzan un error. El administrador de Django no muestra el botón ni la acción masiva de eliminar.
- **Desactivar** (`POST /api/users/<id>/desactivar/`, solo el Administrador): la cuenta pierde el acceso, se cierran sus sesiones abiertas y se guarda quién la desactivó y cuándo.
- **Reactivar** (`POST /api/users/<id>/reactivar/`): devuelve el acceso con su contraseña, su 2FA y su historial intactos.
- **Salvaguardas:** nadie puede desactivar su propia cuenta y siempre debe quedar al menos un Administrador activo.
- **Interfaz:** en "Accesos y Usuarios" hay una columna de estado y un botón "Desactivar" / "Reactivar" con confirmación. No existe botón de eliminar.

---

## 3. Regla 2: el trabajo diario pertenece a cada área

**Decisión:** cada rol ejecuta lo que corresponde a su área.

| Área | Responsabilidad |
|---|---|
| Finanzas | Aprueba presupuestos, compras, pagos de finiquitos |
| Recursos Humanos | Gestiona personal, contratos, fichas y documentos laborales |
| Operaciones | Obras, bodega, auditoría de hojas de servicio |
| Técnico | Trabajo en terreno desde la app (asistencia, hojas, retiros, evidencia) |
| Administrador | Crea cuentas, asigna roles y supervisa (ver sección 4) |

**Por qué:** separar funciones reduce errores y fraudes. La persona que paga un finiquito no debería ser la que lo calcula. El sistema lo refleja con permisos por rol en el servidor (no solo en la pantalla).

---

## 4. Regla 3: el Administrador es el reemplazo de TI y el salvavidas

**Decisión:** el rol `ADMIN` (el Dueño):
1. **Crea las cuentas de usuario y asigna los roles**, porque no hay departamento de TI.
2. **Mantiene acceso global** en el servidor. Si la persona de Finanzas falta, el Dueño debe poder entrar a aprobar un presupuesto (o resolver cualquier operación) para que la empresa no se paralice.

### Riesgo aceptado: ALTA-01

La auditoría marcó como **ALTA-01** que `RolePermission` conceda acceso total al rol `ADMIN`, porque contradice la segregación de funciones de `src/domain/rbac.js`.

**Estado: Riesgo Aceptado por Regla de Negocio.** El comodín se mantiene y no se aplica la mitigación propuesta.

**Por qué se acepta**
- Sin un segundo administrador ni un área de TI, quitar el comodín dejaría a la empresa sin forma de resolver una ausencia.
- El rol lo ocupa una sola persona de confianza: el Dueño.
- La alternativa (un permiso por cada excepción) obliga a anticipar cada emergencia. Las emergencias no se anticipan.

**Controles que lo compensan**
- Todas las cuentas, incluida la del Administrador, exigen contraseña y 2FA (TOTP), con rotación de tokens de renovación y límite de intentos.
- Siempre debe quedar al menos un Administrador activo, y nadie puede desactivarse a sí mismo.
- Los usuarios no se eliminan: toda acción queda atribuida a una persona real.
- Las acciones sensibles quedan en el registro de auditoría.
- El uso del acceso global es excepcional: el trabajo diario sigue siendo de cada área.

**Cuándo revisarlo:** si el rol Administrador pasa a ser ocupado por más de una persona, o si la empresa incorpora un responsable de TI.

**Pendiente de coherencia (decisión del Dueño):** la interfaz (`src/domain/rbac.js`) todavía describe al Administrador como "no ejecuta tareas operativas" y le oculta algunos botones operativos. El servidor ya le permite todo. Si el Dueño debe poder ejecutar esas tareas desde la pantalla, hay que ajustar la matriz del frontend.

---

## 5. Nueva arquitectura de RR. HH.: separar la cuenta de la ficha del trabajador

### 5.1 Decisión

El modelo de usuario (`CustomUser`) queda **estrictamente para el acceso y el rol**: correo, contraseña, 2FA, rol, estado activo. Los datos laborales y previsionales viven en un modelo aparte, **`FichaTrabajador`**, ligado 1 a 1 a la cuenta y ubicado en la app `rrhh`.

### 5.2 Por qué

- **Seguridad.** La cuenta se consulta en cada login y en cada petición. Mezclar en ella el RUT, la AFP o el sistema de salud amplía innecesariamente quién y qué toca esos datos. Separados, el acceso a la ficha se controla con sus propios permisos.
- **Datos personales.** El RUT y la previsión son datos personales y laborales sensibles. Solo RR. HH. y el Administrador los ven. Finanzas, Operaciones y Técnicos no tienen acceso.
- **Flujo real de la empresa.** El Administrador crea la credencial; después RR. HH. (o el Administrador) completa la ficha. Son dos tareas de dos personas distintas, y el modelo lo refleja.
- **Evolución.** Contratos y liquidaciones de sueldo necesitan estos datos (AFP, salud, tipo de contrato, ingreso). Tener la ficha lista deja el terreno preparado sin tocar el login.

### 5.3 Qué contiene la ficha

| Campo | Detalle |
|---|---|
| RUT | Único. Se normaliza (`12345678-5`) y se valida el **dígito verificador con módulo 11**. Acepta con o sin puntos y guion; la K en minúscula se corrige. |
| Previsión (AFP) | Lista cerrada: Capital, Cuprum, Habitat, Modelo, PlanVital, ProVida, Uno, e IPS (sistema antiguo). |
| Sistema de salud | Fonasa o Isapre. Si es Isapre, la isapre es obligatoria (lista cerrada). Si es Fonasa, no lleva isapre. |
| Tipo de contrato | Plazo fijo, Indefinido, Obra o faena. |
| Fecha de ingreso | Obligatoria. |
| Trazabilidad | Quién la modificó por última vez y cuándo. |

### 5.4 Reglas que hace cumplir el sistema

- Una cuenta tiene como máximo una ficha, y un RUT no puede repetirse.
- La ficha no se puede pasar a otra persona.
- No se crea una ficha para una cuenta desactivada.
- La coherencia Fonasa/Isapre la exige también la base de datos, no solo la API.
- **Las fichas no se eliminan** (misma lógica de trazabilidad que los usuarios).

### 5.5 Cómo se usa

- `GET/POST /api/rrhh/fichas/`: listar y crear.
- `GET/PATCH /api/rrhh/fichas/<id>/`: ver y editar.
- `GET /api/rrhh/fichas/opciones/`: las listas cerradas para armar los formularios.
- La tabla de personal (`/api/rrhh/personal/`) indica con `ficha_id` quién ya tiene ficha y quién está pendiente de completarla.

### 5.6 Marco legal (referencia, no asesoría)

- El Código del Trabajo exige que el contrato individualice a las partes y consigne la fecha de ingreso, entre otras menciones (art. 10).
- La AFP y el sistema de salud determinan a qué instituciones se enteran las cotizaciones previsionales y de salud, que deben figurar en la liquidación de sueldo.
- Los datos personales de las personas trabajadoras están protegidos por la Ley 19.628. Según tengo entendido, una nueva ley de protección de datos personales (Ley 21.719) entra en vigencia a fines de 2026.

**Esto es una referencia para orientar el diseño.** Antes de operar con datos reales de trabajadores, conviene validar los campos, los plazos de conservación y el tratamiento de datos personales con un asesor laboral o abogado.

---

## 6. Qué se hizo (resumen técnico)

**Usuarios (borrado lógico)**
- `accounts/models.py`: campos `deactivated_at` y `deactivated_by`; el borrado de usuarios lanza error.
- `accounts/views.py` y `urls.py`: endpoints de desactivar y reactivar, con corte de sesiones.
- `accounts/admin.py`: sin eliminar en el admin de Django.
- Migración `accounts/0004` (solo agrega columnas).
- Interfaz: columna "Acceso" y botón Desactivar / Reactivar en `UsuariosList.jsx`.
- Pruebas: `accounts/tests/test_desactivacion.py`.

**Ficha del trabajador**
- `rrhh/validadores.py`: normalización y validación del RUT (módulo 11).
- `rrhh/models.py`: `FichaTrabajador`. Migración `rrhh/0004`.
- `rrhh/serializers.py` y `views.py`: serializador, `FichaTrabajadorViewSet` y `ficha_id` en la tabla de personal.
- `rrhh/urls.py` y `admin.py`: ruta `rrhh/fichas/`; sin eliminar en el admin.
- Pruebas: `rrhh/tests/test_ficha.py` (19 pruebas: RUT, permisos por rol, listas cerradas, Fonasa/Isapre, duplicados, no eliminación).

**Seguridad**
- ALTA-01 documentada como riesgo aceptado (se revirtió el cambio que quitaba el comodín del Administrador).
- MEDIA-06 aplicada: tiempo máximo y reintentos controlados en el navegador (`src/services/api.js`) y tope de la IA en el servidor.

---

## 7. Unificación de modelos: una sola fuente de verdad

**Problema.** Los mismos datos vivían en varios lugares: `personal.Trabajador` (RUT, ingreso, cargo, tarifa) y `rrhh.Contrato` (tipo de contrato) repetían lo que ahora guarda `FichaTrabajador`. Dos copias de un dato legal terminan contradiciéndose.

**Decisión.** `FichaTrabajador` es la única fuente de verdad del RUT, la previsión, la salud, la fecha de ingreso y el **tipo de contrato**.

**Qué cambió**
- **`personal.Trabajador` se eliminó.** Quedan solo sus migraciones. Se retiró también su API (`/api/trabajadores/`).
- **Las marcas de asistencia y los vehículos asignados** ahora apuntan a la cuenta de la persona (`CustomUser`), no a `Trabajador`. La asistencia de hoy lista a los técnicos activos por su cuenta.
- **`Contrato` ya no guarda el tipo de contrato.** Lo lee de la ficha (`contrato.tipo_contrato` es de solo lectura). Un contrato exige que la persona tenga ficha, y la regla "plazo fijo requiere fecha de término" se evalúa con el tipo de la ficha.
- Se agregó "Obra o faena" a los tipos de contrato (viene de la ficha).

**Qué pasó con los datos existentes (migraciones `personal/0003-0004`, `asistencia/0002`, `flota/0003`, `rrhh/0005`)**
- Cada persona que era `Trabajador` y no tenía cuenta recibió una **cuenta desactivada** (`legado-<id>@sin-cuenta.fyag.invalid`, sin contraseña utilizable). Así se conservan su nombre, sus marcas de asistencia y sus vehículos, y respeta la regla de que los usuarios nunca se eliminan.
- Las marcas y los vehículos se reasignaron a esas cuentas. Verificado en la base local: 1 marca y 3 vehículos conservados.
- **Se pierde** lo que `Trabajador` guardaba y no tiene destino en la ficha: cargo, tarifa por hora y vencimiento de licencia (ningún módulo del servidor los usaba; el costo hora-hombre del ERP vive en sus propias tablas), y el tipo de contrato que guardaban los contratos ya existentes (hay que completarlo en la ficha de cada persona). Antes de aplicar se tomó un respaldo de la base local.
- La migración no se puede deshacer automáticamente.

**Pantalla de RR. HH.** El módulo "Contratos y Finiquitos" tiene una pestaña nueva **Fichas**: lista a todas las cuentas activas, marca las que están pendientes y permite completar o editar la ficha. Los desplegables (AFP, salud, isapre, tipo de contrato) vienen del servidor (`/api/rrhh/fichas/opciones/`). Solo la ven y la usan RR. HH. y el Administrador (los mismos roles que acceden al módulo); el servidor lo exige igualmente. Al crear un contrato, el tipo se muestra en solo lectura y, si falta la ficha, se ofrece completarla primero.

---

## 8. Flota en tablas relacionales

**Problema.** La flota del ERP vivía como documentos JSON en una tabla genérica (`erp_registro`). Nadie podía crear un vehículo ni registrar una revisión técnica: la pantalla solo mostraba un vencimiento sembrado de antemano y permitía mandar el vehículo a taller. Tampoco quedaba cuándo se hizo cada revisión ni de dónde salía cada kilometraje.

**Decisión.** La flota tiene su propio espacio relacional en el módulo `flota`, con historial. El ERP la lee y la escribe desde ahí (ya no hay una segunda copia).

| Tabla | Qué guarda |
|---|---|
| `Vehiculo` | patente, marca, modelo, año, estado (activo o en taller), técnico asignado, kilometraje actual, activo. El código público (`VH-01`) se asigna solo. |
| `DocumentoVehiculo` | revisión técnica, permiso de circulación y seguro obligatorio: **el día en que se hizo** y **el día en que vence**, número de certificado o póliza, observación y quién lo registró. Cada renovación es un registro nuevo: el historial no se edita. |
| `LecturaOdometro` | cada kilometraje que tuvo el vehículo: de dónde vino (lectura inicial, hoja de servicio o registro manual), quién y cuándo. |

**Reglas**
- El vencimiento vigente de cada documento es el del registro más reciente. Un vehículo no guarda fechas sueltas.
- **El odómetro solo avanza.** Una lectura menor a la actual se rechaza; una igual no agrega nada.
- **Quién ingresa qué:** RR. HH. y el Administrador crean y editan vehículos y registran revisiones y lecturas. Finanzas solo consulta. El técnico no ve vencimientos; su hoja de servicio hace avanzar el kilometraje sola.
- Los vehículos no se eliminan: se mandan a taller o se desactivan. Un vehículo con historial no se puede borrar.
- La patente se valida (formato antiguo `AB-1234` y vigente `ABCD-12`) y no se repite.
- Los técnicos solo ven los vehículos activos y operativos, sin vencimientos ni datos de gestión.

**Interfaz.** En Personal y Flota, pestaña Flota: "Nuevo vehículo", y por fila: historial, registrar revisión o documento, actualizar kilometraje, editar y taller. La tabla muestra la última revisión hecha y los tres vencimientos con su color, y las alertas incluyen ahora el permiso de circulación.

**Migración de datos.** Los vehículos que estaban como JSON pasaron a las tablas conservando su código (`VH-01` a `VH-07`); los que ya estaban en la tabla antigua recibieron los siguientes códigos. Los vencimientos pasaron a documentos (sin el día en que se hicieron, dato que nunca se guardó) y cada kilometraje quedó como lectura inicial. Se probó antes sobre una copia de la base local. No se puede deshacer automáticamente.

---

## 9. Pendientes

1. **Completar fichas existentes:** los contratos que ya existían (por ejemplo los de la base local) quedan sin tipo de contrato hasta que RR. HH. complete la ficha de cada persona.
2. **Cargo, tarifa por hora y vencimiento de licencia:** si se quieren conservar en el servidor, hay que decidir dónde viven (la ficha u otro módulo).
3. **Matriz del frontend:** alinear la descripción y los botones del Administrador con la regla del salvavidas (sección 4).
4. **Resto de la auditoría:** ALTA-02 (validación TLS de Valkey; requiere subir el certificado de Aiven antes), MEDIA-01 a MEDIA-05 (agente de IA), MEDIA-07 y las de severidad baja.
5. **Revisión legal** de los campos y del tratamiento de datos personales (sección 5.6).
6. **Licencia de conducir:** su vencimiento todavía vive en la ficha antigua del ERP (JSON) y no hay dónde registrarlo ni corregirlo. Falta llevarlo a un registro relacional propio, como se hizo con la flota.
7. **Otras tablas del ERP** (personal, obras, bodega…) siguen como documentos JSON; pasarlas a relacional es un proyecto aparte.
