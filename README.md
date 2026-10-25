# FYAG ERP · Prototipo frontend

Frío y Agroindustria SpA · Proyecto Integrado (TIHV43) · INACAP Chillán · Unidad 3

Prototipo navegable de dos superficies sobre un mismo dominio:

- **Portal ERP de oficina** (`/erp`, escritorio): presupuestos, obras, bodega y Cardex, compras, auditoría de terreno, personal y flota, maestros y log de auditoría.
- **App móvil PWA de terreno** (`/app`, móvil): hoja de servicio en 5 pasos, solicitud de materiales, cola offline.

El backend real (Django REST Framework + MySQL + SimpleJWT) aún no existe: todo el acceso a datos pasa por `src/services/*`, con la forma que tendrá la API.

## Arranque

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 112 pruebas (dominio, servicios, arquitectura)
npm run build      # build de producción + service worker
```

Los datos viven en IndexedDB del navegador (clave `fyag-db-v1`). Para volver al dataset original, borre la base `keyval-store` desde las herramientas del navegador.

## Usuarios demo

El login muestra una tarjeta por perfil. El rol **Técnico** entra a `/app`; el resto a `/erp`. En el ERP, el selector «Demo» de la barra superior cambia de rol sin volver a iniciar sesión.

| Perfil | Rol | Qué se ve distinto |
| --- | --- | --- |
| Carolina Fuentealba | `ADMIN_GENERAL` | Autoriza y supervisa: ve toda la gestión, aprueba presupuestos con margen < 20 %, cierra obras y administra usuarios. No ejecuta tareas operativas |
| Matías Contreras | `ADMINISTRACION` | Presupuestos (aprueba salvo margen < 20 %), compras, clientes y proveedores; ve el personal pero no lo modifica |
| Rodrigo Sepúlveda | `BODEGA` | Artículos, Cardex, compras; no ve presupuestos ni costos de obra |
| Patricio Mella | `SUPERVISOR` | Obras, CU30, auditoría de hojas; no ve el valor del inventario |
| Jorge Quezada | `TECNICO` | Solo la PWA; nunca ve costos |
| Francisca Valdés | `CONSULTA` | Solo lectura |
| Camila Torres | `RRHH` | Solo Dashboard y Personal y Flota: ve y edita fichas, tarifas y flota; sin acceso a obras, bodega ni compras |

## Permisos y segregación de funciones

La matriz completa (rol × permiso) está en **[`docs/matriz-permisos.md`](docs/matriz-permisos.md)**. Se genera desde `PERMISOS` con `npm run docs:permisos` y una prueba falla si el documento no coincide con el código. Reglas que se verifican automáticamente:

- **Administrador General** autoriza y administra accesos, pero no ejecuta tareas operativas (0 permisos operativos).
- **Consulta (Gerencia)** es estrictamente de solo lectura.
- **RRHH** controla únicamente Personal y Flota (`dashboard.ver`, `personal.ver`, `personal.editar`), y `personal.editar` es exclusivo suyo.
- Las listas de `PERMISOS` son explícitas: un rol nuevo no hereda ningún permiso por defecto.

## Accesos y usuarios (solo Gerencia General)

La empresa no tiene área de TI, así que la administración de accesos está en **ERP › Accesos y Usuarios** (`/erp/usuarios`) y la controlan los permisos `usuarios.ver`, `usuarios.crear` y `usuarios.editar`, que **solo tiene `ADMIN_GENERAL`** (una prueba lo exige).

- **Nuevo Acceso:** nombre, RUT (se normaliza y valida), cargo, rol, correo y contraseña inicial (con generador). Al crear, se muestran las credenciales una única vez para entregarlas al usuario, que deberá cambiarla en su primer ingreso.
- **Contraseñas:** se guardan con hash y sal (nunca en texto plano), no salen del servicio y no se escriben en el log de auditoría.
- **Sin eliminación:** los accesos se desactivan. No se puede desactivar el propio acceso, ni cambiar el propio rol, ni dejar al sistema sin un Administrador General activo.
- **Ingreso demo:** la pantalla de login y el selector «Demo» listan a los usuarios activos de esta tabla, así que un acceso nuevo aparece de inmediato. El login por tarjeta no pide contraseña; la validación de credenciales real llegará con SimpleJWT en el backend.
- Un usuario con rol Técnico necesita además su ficha en **Personal y Flota** para recibir obras en la app de terreno.

## Flota y kilometraje

- **ERP › Personal y Flota › Flota:** patente, marca/modelo, técnico asignado, kilometraje actual, estado (Activo / En taller) y vencimientos. Solo RRHH (`personal.editar`) puede enviar un vehículo a taller o reactivarlo; un vehículo en taller no aparece en la app de terreno.
- **PWA › Hoja de servicio › paso 4 «Horas y vehículo»:** el técnico elige la patente (se propone la asignada), registra el kilometraje de salida y de regreso, y el regreso debe ser mayor a la salida (`domain/flota.js`). El vehículo es opcional.
- Al sincronizar la hoja, el odómetro del vehículo avanza al kilometraje de regreso y nunca retrocede (un envío atrasado desde la cola offline no lo altera). Cada cambio queda en el log de auditoría.

## Principios y dónde se cumplen

| | Principio | Cómo se garantiza |
| --- | --- | --- |
| P1 | Cardex inmutable | `cardexService` solo expone `list`, `retrieve`, `create`, `reversar`, `reingresarSobrante`. Las correcciones son contra-asientos. |
| P2 | Sin borrado físico | Ningún servicio tiene `remove`/`delete`; los maestros se desactivan; `db.js` no expone borrado de filas. |
| P3 | Reglas fuera de los componentes | `src/domain/*`: funciones puras con pruebas unitarias; los componentes solo muestran resultados. |
| P4 | Todo cambio se audita | `registrarAuditoria()` en cada escritura: usuario, rol, fecha-hora, entidad, id, acción, valor anterior/nuevo, IP. |
| P5 | RBAC visible | `domain/rbac.js` (`can(rol, accion)`), `RequireRole` en rutas y filtrado de campos de costo en los servicios. Segregación de funciones documentada en [`docs/matriz-permisos.md`](docs/matriz-permisos.md); una prueba exige que toda escritura de un servicio verifique un permiso. |
| P6 | Mobile-first real | Botones de 56 px, teclado numérico propio, sin escritura libre salvo observaciones. |
| P7 | Cero placeholders | La prueba `src/__tests__/arquitectura.test.js` revisa estos principios sobre todo el código fuente. |

## Estructura

```
src/
├─ domain/       reglas de negocio puras (money, cardex, obras, rentabilidad, checklist, geo, rut, hojas, sync, kpis, alertas, exportar…)
├─ services/     capa tipo API (misma forma que DRF) + cola offline (syncQueue.js)
├─ mocks/        seed realista (Región de Ñuble) y db en memoria con persistencia IndexedDB
├─ stores/       auth (JWT simulado, inactividad), sync, ui
├─ components/   ui/ (sistema de diseño) y domain/ (badges, MarginGauge, ChecklistGrid, GpsStamp…)
├─ layouts/      ErpLayout, PwaLayout
├─ features/     erp/* y pwa/*
└─ lib/          GPS, imágenes, exportación Excel/PDF (carga bajo demanda)
```

## Reglas de negocio destacadas

- **Cardex:** stock derivado, sin stock negativo, reversa única por movimiento, reingreso de sobrante tasado al costo original.
- **CU30:** Emergencia y Garantía abren sin presupuesto; la obra queda marcada y debe regularizarse para finalizar.
- **Cierre de obra:** 6 checks (presupuesto, horas, hojas auditadas, sobrantes conciliados, sync de terreno, costos calculables).
- **Costo real:** materiales netos del Cardex + horas × tarifa hora-hombre **congelada** al sincronizar cada hoja.
- **Rentabilidad:** margen sobre venta neta; semáforo rojo < 20 %, ámbar < 30 %; con margen < 20 % solo Gerencia aprueba.
- **Checklist paramétrico:** 5 puntos (presión PSI, amperaje A, fugas, temperatura °C, limpieza) con rangos y tolerancias en `domain/checklist.js`.
- **Offline:** los envíos sin señal se guardan en IndexedDB y se reenvían al reconectar; los reintentos son idempotentes (`client_id`).

## Pasar del mock al backend real

1. Reemplace el cuerpo de cada método de `src/services/*.service.js` por una llamada HTTP (`fetch`/axios) al endpoint DRF equivalente; las firmas y las respuestas no cambian.
2. Mueva a DRF las validaciones que hoy viven en los servicios (permisos, auditoría, idempotencia). El dominio JS puede seguir usándose en el cliente para validar y mostrar.
3. Sustituya `authStore.login` por `POST /api/auth/token/` (SimpleJWT) y envíe el token en cada llamada.
4. Retire `src/mocks/` y `configureHttp()`.

## Supuestos a validar con FYAG

Los rangos del checklist, los stocks mínimos, las tarifas hora-hombre, el umbral de desvío de costos (±5 %) y los datos del seed son valores plausibles, no datos reales de la empresa.
