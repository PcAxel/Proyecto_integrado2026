# Mapa de pruebas de FYAG ERP (dónde revisar cada cosa)

Entorno local: app en `http://localhost:5173` · API en `http://localhost:8000`.
Para levantarlos: `npm run dev` (raíz) y `python manage.py runserver` (carpeta `backend`, con el entorno virtual).

## 1. Cuentas locales (las que existen hoy en tu base local)
| Cuenta | Contraseña | Qué ve |
|---|---|---|
| `admin@fyag.cl` | `Admin-FYAG-2026` | Todo el ERP (Administrador). Ya tiene el autenticador vinculado |
| `finanzas@fyag.cl` | `Finanzas-FYAG-2026` | Presupuestos, compras, facturación |
| `operaciones@fyag.cl` | `Operaciones-FYAG-2026` | Obras, bodega (recepción, retiros, reversas) |
| `rrhh@fyag.cl` | `RRHH-FYAG-2026` | Personal, flota, contratos |
| `superadmin@fyag.cl` | la que fija `seed_fyag` | Super Admin (TI): accesos, log de auditoría y estado del sistema. No ve el negocio |
| `comercial@fyag.cl` | la que fija `seed_fyag` | Ejecutivo Comercial: presupuestos y clientes. No aprueba |
| `ti@apexsystems.cl` | la que fija `seed_fyag` | Jefatura de TI: accesos, Gobernanza IA (bitácora de prompts y políticas del agente) y estado del sistema |
| `auditor@fyag.cl` | la que fija `seed_fyag` | Auditor Externo: todo en solo lectura; el servidor le rechaza cualquier escritura |
| `tecnico@fyag.cl` y los otros 15 técnicos | `Tecnico-FYAG-2026` | Solo la app de terreno (`/app`) |

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
| **Reglas de stock** (crítico / mínimo / máximo) | **Bodega y Cardex** → Artículos → lápiz de un artículo → «Reglas de stock» | Como `operaciones@fyag.cl`: poner crítico mayor que el mínimo bloquea el guardado; en la tabla aparece «crít. N · máx. N» |
| **Ingresar recepción** | **Bodega y Cardex** → botón «Ingresar recepción» (arriba a la derecha) | Documento de respaldo + artículo(s) + cantidad. Deja `ENTRADA_RECEPCION` en el Cardex; avisa si supera el máximo |
| **Retiro con escáner (picking)** | **Bodega y Cardex** → «Solicitudes de retiro» → una solicitud → «Comenzar retiro» | Escanea el QR o escribe el SKU + Enter; la tabla suma contra lo pedido; «Confirmar retiro» se habilita al completar y deja `SALIDA_RETIRO` |
| **Reversar / Devolver** | **Cardex** → botón «Reversar/Devolver» en una salida | Exige nota de justificación; genera `ENTRADA_REVERSA` que suma el stock y apunta al movimiento original |
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
