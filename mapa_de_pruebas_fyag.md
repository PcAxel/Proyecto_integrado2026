# Mapa de pruebas de FYAG ERP (dónde revisar cada cosa)

Entorno local: app en `http://localhost:5173` · API en `http://localhost:8000`.
Para levantarlos: `npm run dev` (raíz) y `python manage.py runserver` (carpeta `backend`, con el entorno virtual).

## 1. Cuentas locales (las que existen hoy en tu base local)
| Cuenta | Contraseña | Qué ve |
|---|---|---|
| `admin@fyag.cl` | `Admin-FYAG-2026` | Todo el ERP (Administrador). Ya tiene el autenticador vinculado |
| `finanzas@fyag.cl` | `Finanzas-FYAG-2026` | **Finanzas**: ve estrictamente Presupuestos, Obras, Compras, Aprobación de Compras, Cobranzas, Finiquitos por Pagar y Clientes y Proveedores (más el Inicio). No ve Bodega y Cardex, Auditoría de Terreno, Log de Auditoría ni Personal y Flota, ni siquiera escribiendo la dirección |
| `operaciones@fyag.cl` | `Operaciones-FYAG-2026` | **Jefe de Operaciones**: obras, «Delegar a Terreno», «Auditoría Terreno OK», auditoría de hojas. Ya NO opera la bodega ni ve «Bodega y Cardex» |
| `bodega@fyag.cl` | `Bodega-FYAG-2026` | **Jefe de Bodega**: solo Bodega y Cardex y Compras (recepciones, retiros con escáner, reversas, reglas de stock). No ve obras. Creado en tu base local; en bases nuevas la clave es `Bodega-Apex-2026` |
| `rrhh@fyag.cl` | `RRHH-FYAG-2026` | Personal, flota, contratos |
| `ti@apexsystems.cl` | `TI-Apex-2026` | **Admin TI** (Super Admin): accesos y usuarios, Gobernanza IA, log de auditoría y estado del sistema. No ve el negocio. Primer ingreso: muestra el QR del autenticador |
| `comercial@fyag.cl` | la que fija `seed_fyag` | Ejecutivo Comercial: presupuestos y clientes. No aprueba |
| `auditor@fyag.cl` | la que fija `seed_fyag` | Auditor Externo: todo en solo lectura; el servidor le rechaza cualquier escritura |
| `tecnico@fyag.cl` y los otros 15 técnicos | `Tecnico-FYAG-2026` | Solo la app de terreno (`/app`) |

Etapas de una obra: Creado → Asignado a terreno → En ejecución → Auditoría de terreno OK → Facturado (la factura aceptada la deja en «Facturado») → Pagada (cuando el cliente paga el total).

Los otros técnicos son `nombre.apellido@fyag.cl` (por ejemplo `cristian.medina@fyag.cl`, `luis.parra@fyag.cl`, `hugo.salazar@fyag.cl`).

**Bases nuevas:** al crear una base desde cero con el seeder (datos ficticios), las cuentas base quedan con contraseñas `*-Apex-2026` (por ejemplo `Admin-Apex-2026`) y los técnicos nuevos son `tecnico.demo02@apex.demo` … `tecnico.demo16@apex.demo` con `Tecnico-Apex-2026`. Tu base local actual no cambió.

**Autenticador (2FA):** si una cuenta no lo tiene, el primer ingreso muestra un QR. Sin celular, el código de una cuenta ya vinculada
se obtiene con `python manage.py totp correo@fyag.cl`. Para reiniciar uno: `python manage.py reset_2fa correo@fyag.cl`.

## 2. Qué revisar y dónde
| Función | Dónde | Cómo probarla |
|---|---|---|
| **Facturación electrónica (SII, simulada)** | **Obras** → una obra *Finalizada* (por ejemplo `/erp/obras/OB-0003`) → botón **Facturar** arriba, o la tarjeta «Facturación electrónica (SII)» abajo a la derecha del Resumen | Como Administrador o Finanzas: «Emitir Factura Electrónica (SII)». Pasa a «Procesando en SII...» (2 s) y luego «Aceptado» con «Descargar PDF» |
| Obras que se pueden facturar | `OB-0003`, `OB-0011`, `OB-0012`, `OB-0014`, `OB-0015`, `OB-0017`, `OB-0018`, `OB-0024`… (22 en total) | Deben estar finalizadas y tener presupuesto aprobado |
| **IA que lleva a facturar** | Botón ✨ → «Quiero emitir la factura de la obra OB-0011» | Te lleva a la obra, baja hasta la tarjeta y la resalta; tú pulsas «Emitir». Requiere una clave de DeepSeek válida en `backend/.env` |
| Lector de textos y subtítulos | Ícono de accesibilidad (junto al sol), arriba a la derecha | «Leer la pantalla», o seleccionar texto y pulsar **Escuchar**. Subtítulos abajo |
| Subtítulos en inglés | Mismo menú | Solo Chrome con traductor; descarga un modelo de idioma la primera vez |
| Modo daltonismo | Mismo menú → «Visión» | Activar y mirar **Presupuestos** y **Bodega y Cardex** (✅ / ⚠️ y bordes) |
| Apariencia (día/noche, paletas, letra) | Ícono del sol, arriba a la derecha | Barra Día↔Noche, 2 paletas claras y 2 oscuras, tamaño de letra |
| Asistente de IA | Botón ✨ abajo a la derecha | Frases en `guia_prompts_ia_fyag.md` (reportes, proyección de stock, compras) |
| **Reglas de stock** (crítico / mínimo / máximo) | **Bodega y Cardex** → Artículos → lápiz de un artículo → «Reglas de stock» | Como `bodega@fyag.cl`: poner crítico mayor que el mínimo bloquea el guardado; en la tabla aparece «crít. N · máx. N» |
| **Ingresar recepción** (`bodega@fyag.cl`) | **Bodega y Cardex** → botón «Ingresar recepción» (arriba a la derecha) | Documento de respaldo + artículo(s) + cantidad. Deja `ENTRADA_RECEPCION` en el Cardex; avisa si supera el máximo |
| **Retiro con escáner (picking)** (`bodega@fyag.cl`) | **Bodega y Cardex** → «Solicitudes de retiro» → una solicitud → «Comenzar retiro» | Escanea el QR o escribe el SKU + Enter: aparece una **confirmación** con el producto y su stock real («Confirmar Retiro» verde / «Cancelar / Equivocación» rojo); recién al confirmar se suma a la tabla. «Confirmar retiro» (final) se habilita al completar y deja `SALIDA_RETIRO` |
| **Reversar / Devolver** (`bodega@fyag.cl`) | **Cardex** → botón «Reversar/Devolver» en una salida | Exige nota de justificación; genera `ENTRADA_REVERSA` que suma el stock y apunta al movimiento original |
| **Recuperar contraseña por correo** (todos) | Pantalla de login → «¿Olvidaste tu contraseña?» (código de 6 dígitos), o la página del servidor `/api/auth/reset/` (enlace por correo) | Ambas necesitan el servicio de correo: variable `RESEND_API_KEY` en Render y un remitente de dominio verificado en Resend (`DEFAULT_FROM_EMAIL`). Se prueba en Estado del Sistema → Correo → «Probar» |
| **Dar contraseña a un usuario nuevo / restablecerla** (`ti@apexsystems.cl`) | **Accesos y Usuarios** → «Nuevo acceso» (campo «Contraseña inicial», o déjalo vacío y el sistema genera una) o, en un usuario existente, el botón «Contraseña» | Al crear o restablecer, la contraseña se muestra **una sola vez** en pantalla (con «Copiar»), aunque el correo no llegue. «Restablecer» cierra las sesiones de esa persona y quita su bloqueo. Solo TI puede restablecer |
| **Probar el correo del sistema** (`ti@apexsystems.cl`) | **Estado del Sistema** → Integraciones → «Correo de accesos» → «Probar» | Envía un correo real y, si falla, dice el motivo exacto (clave de Brevo, remitente sin verificar, IP no autorizada…) |
| **Aprobar una obra nueva** (`finanzas@fyag.cl`) | Operaciones crea la obra (Obras → Nueva) → Finanzas recibe el aviso en la campanita y la tarea «Aprobar obra» en sus pendientes → abre la obra → «Aprobar obra» o «Rechazar» (con motivo) | Mientras está «Por aprobar» Operaciones no puede iniciarla ni delegarla a terreno. Las obras de emergencia/garantía quedan exentas y las antiguas se consideran aprobadas |
| **Delegar a Terreno** (`operaciones@fyag.cl`) | **Obras** → una obra no finalizada → botón «Delegar a Terreno» | Elige técnicos: la obra queda «Asignado a terreno» y en curso (los técnicos la ven en su app) |
| **Auditoría Terreno OK** (`operaciones@fyag.cl`) | La misma obra → botón verde «Auditoría Terreno OK» | Solo si cumple los 6 requisitos de cierre (si no, dice cuál falta). La obra pasa a Finalizada y **Finanzas recibe un aviso** |
| **Campanita de avisos** (`finanzas@fyag.cl`) | Ícono de campana arriba a la derecha | Muestra «Auditoría de Terreno completada… Lista para facturar»; al abrirla se marca como leída y al pulsar el aviso baja hasta «Emitir Factura» |
| **Buscador asíncrono y campos obligatorios** (`bodega@fyag.cl`, `finanzas@fyag.cl`) | **Bodega → Artículos → Nuevo artículo**, **Clientes y Proveedores → Nuevo proveedor**, el formulario de documentos de RR. HH. (empleado), los formularios de Obras (nueva obra, regularizar presupuesto) y Presupuestos (cliente y materiales), y los de Compras (factura, nota de crédito) y Bodega (salida, escaneo, recepción, conteo, solicitud de compra, filtros del Cardex). En la factura, los artículos se acotan al proveedor elegido | «Proveedor habitual» se busca escribiendo (consulta el servidor, máx. 20 resultados, nunca baja la lista completa). Los campos obligatorios llevan un asterisco rojo `*` y los que pueden quedar vacíos dicen «(Opcional)» |
| **Solicitud de compra** (`bodega@fyag.cl`) | **Bodega y Cardex** → pestaña «Solicitudes de compra» → «Nueva solicitud» | El artículo se busca **escribiendo** el SKU o parte del nombre (filtra al instante, también con teclado ↑ ↓ Enter); «Escanear un repuesto» completa la línea con el producto exacto del QR; o «Cargar los que están bajo el mínimo». Finanzas recibe un aviso en la campanita |
| **Aprobación de Compras** (`finanzas@fyag.cl`) | Menú **Finanzas → Aprobación de Compras** | Abre una solicitud → «Aprobar y emitir órdenes»: se emite **una orden de compra por proveedor** al último costo; o «Rechazar» con motivo (le llega a Bodega) |
| **Cobranzas** (`finanzas@fyag.cl`) | Menú **Finanzas → Cobranzas** | «Registrar pago» (fecha, monto, método): admite abonos; al cubrir el total la factura pasa a **PAGADA** y la obra a la etapa «Pagada». Requiere una factura emitida (ver Facturación) |
| **Simulador de rentabilidad / Riesgo de Rentabilidad** | **Presupuestos** → un presupuesto con margen < 20 % (por ejemplo `PRE-0053`) | Alerta roja «Riesgo de Rentabilidad», desglose de costos y precio sugerido. Finanzas ve que requiere a Gerencia; con `admin@fyag.cl` el botón «Aprobar presupuesto» pide una casilla extra de confirmación |
| Stickers QR de 1000 productos | **Bodega y Cardex** → pestaña **Etiquetas** | Buscar por SKU, seleccionar, abrir el PDF |
| Datos de demostración (online) | Variables en Render: `APEX_SEED_DEMO=1` y `FYAG_SEED_PASSWORD` | Deploy; luego quitar `APEX_SEED_DEMO` |
| Datos de demostración (local) | **Presupuestos**, **Obras**, **Personal y Flota**, **Contratos y Finiquitos**, **Clientes y Proveedores** | Navegar |
| Usuarios y bloqueo de cuentas | **Accesos y Usuarios** (Administrador) | Ver los 16 técnicos; botón **Desbloquear** en cuentas bloqueadas |
| Bloqueo por intentos | `/login` (cerrar sesión antes) | Oficina: 5 fallos → esperas 5/15/30/60 s y bloqueo. Técnico: solo esperas crecientes, nunca se bloquea |
| Recuperar contraseña | `/login` → «¿Olvidaste tu contraseña?» | En local el código sale en la terminal del servidor, no llega por correo |

## 3. Diferencias que confunden
- **Facturas de compra vs factura electrónica:** *Compras* registra las facturas que **nos emiten los proveedores**. La facturación electrónica (SII)
  es la factura que **FYAG emite al cliente** por una obra terminada, y vive dentro de la obra.
- **Local vs online:** la base online (Aiven) no tiene los datos de demostración hasta que se corra `poblar_demo` allá. Local sí los tiene.
- **Qué está solo en tu equipo:** al momento de escribir esto, el lector con subtítulos, el modo daltonismo y la facturación electrónica no tienen commit.

## 4. Archivos de ayuda del proyecto
- `guia_prompts_ia_fyag.md` — prompts del asistente de IA por rol.
- `docs/matriz-permisos.md` — qué puede hacer cada rol.
- `auditoria_seguridad_fyag.md` y `decisiones_negocio_fyag.md` — seguridad y reglas de negocio.
