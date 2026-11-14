# Mapa de pruebas de FYAG ERP (dónde revisar cada cosa)

Entorno local: app en `http://localhost:5173` · API en `http://localhost:8000`.
Para levantarlos: `npm run dev` (raíz) y `python manage.py runserver` (carpeta `backend`, con el entorno virtual).

## 1. Cuentas locales
| Cuenta | Contraseña | Qué ve |
|---|---|---|
| `admin@fyag.cl` | `Admin-FYAG-2026` | Todo el ERP (Administrador) |
| `finanzas@fyag.cl` | `Finanzas-FYAG-2026` | Presupuestos, compras, facturación |
| `operaciones@fyag.cl` | `Operaciones-FYAG-2026` | Obras, bodega |
| `rrhh@fyag.cl` | `RRHH-FYAG-2026` | Personal, flota, contratos |
| `tecnico@fyag.cl` y los otros 15 técnicos | `Tecnico-FYAG-2026` | Solo la app de terreno (`/app`) |

Los técnicos son `nombre.apellido@fyag.cl` (por ejemplo `cristian.medina@fyag.cl`).

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
| Stickers QR de 1000 productos | **Bodega y Cardex** → pestaña **Etiquetas** | Buscar por SKU, seleccionar, abrir el PDF |
| Datos de demostración | **Presupuestos**, **Obras**, **Personal y Flota**, **Contratos y Finiquitos**, **Clientes y Proveedores** | Navegar |
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
