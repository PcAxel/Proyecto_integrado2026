# Auditoría de Seguridad FYAG ERP

## Resumen ejecutivo

La implementación presenta controles sólidos en JWT, 2FA, rotación de refresh tokens, almacenamiento de credenciales y separación básica de permisos. No se encontraron secretos reales versionados ni consultas SQL dinámicas vulnerables.

Se identificaron riesgos relevantes:

- Un comodín de administración en el RBAC del backend contradice la segregación de funciones definida en el frontend.
- El agente de IA recibe historial y rutas controladas por el cliente.
- La validación de respuestas de IA no utiliza un esquema JSON estricto.
- La configuración de Valkey puede desactivar la validación TLS.
- La arquitectura Vercel → Render no implementa una política explícita de timeout/reintentos.
- Las cabeceras de seguridad del backend son menos completas que las de Vercel.

No se confirmaron vulnerabilidades críticas explotables directamente desde el código revisado.

---

## Vulnerabilidades de severidad alta

### ALTA-01: El backend concede acceso total al rol ADMIN

> **Estado: RIESGO ACEPTADO POR REGLA DE NEGOCIO** (decisión del Dueño, 2026-11-09).
>
> **Justificación:** FYAG no tiene departamento de TI. El rol `ADMIN` (el Dueño) es quien crea las cuentas, asigna los roles y actúa como salvavidas operativo: si la persona de Finanzas falta, el Dueño debe poder entrar a aprobar un presupuesto (o resolver cualquier otra operación) para que la empresa no se paralice. Por eso el comodín de `ADMIN` en `RolePermission` se **mantiene** y no se aplica la mitigación propuesta más abajo.
>
> **Controles que compensan el riesgo:**
>
> - El rol `ADMIN` lo ocupa una sola persona de confianza (el Dueño) y siempre debe quedar al menos un Administrador activo.
> - Todas las cuentas, incluida la de `ADMIN`, exigen contraseña + 2FA (TOTP), con rotación de refresh tokens y límites de intentos.
> - El trabajo operativo diario sigue siendo de cada área (Finanzas aprueba presupuestos, RR. HH. gestiona personal); el acceso global del Administrador es excepcional.
> - Los usuarios nunca se eliminan: se desactivan (`is_active = False`), con registro de quién y cuándo, y se cortan sus sesiones abiertas. Se conserva la trazabilidad.
> - Las acciones sensibles del ERP quedan en el log de auditoría.
>
> **Revisión:** reevaluar si el rol `ADMIN` pasa a ser ocupado por más de una persona o si la empresa incorpora un responsable de TI.

**Descripción original del hallazgo:**

**Archivo afectado:**

- `backend/accounts/permissions.py`
- Todas las vistas que utilizan `RolePermission`, incluyendo:
  - `backend/asistencia/views.py`
  - `backend/bodega/views.py`
  - `backend/obras/views.py`
  - `backend/personal/views.py`
  - `backend/presupuestos/views.py`
  - `backend/flota/views.py`
  - `backend/evidencias/views.py`

`RolePermission.has_permission()` devuelve `True` inmediatamente para `user.role == Role.ADMIN`.

Esto contradice la matriz definida en `src/domain/rbac.js` y `README.md`, donde `ADMIN_GENERAL` puede autorizar y administrar accesos, pero no ejecutar tareas operativas.

Un usuario con rol `ADMIN` podría ejecutar operaciones que el modelo de negocio declara prohibidas, como crear movimientos de bodega, modificar personal o registrar operaciones.

**Mitigación recomendada:**

Eliminar el comodín administrativo y declarar explícitamente los permisos por vista.

```python
# backend/accounts/permissions.py

class RolePermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user

        if not (user and user.is_authenticated):
            return False

        require_terms(user)

        access = getattr(view, 'role_access', {})
        key = 'read' if request.method in SAFE_METHODS else 'write'

        return user.role in access.get(key, ())
```

Si el administrador debe tener acceso excepcional a una operación concreta, debe agregarse explícitamente:

```python
role_access = {
    'read': {Role.ADMIN, Role.FINANZAS},
    'write': {Role.FINANZAS},
}
```

También deben añadirse pruebas backend que verifiquen que `ADMIN` no puede ejecutar operaciones operativas no autorizadas.

---

### ALTA-02: Valkey puede utilizar conexiones TLS sin validar certificados

**Archivo afectado:**

- `backend/config/settings.py`

Cuando `VALKEY_URL` usa `rediss://` pero `VALKEY_CA_CERT` no está configurado, la configuración utiliza:

```python
{'ssl_cert_reqs': None}
```

Esto permite ataques de tipo Man-in-the-Middle contra la caché. La caché contiene límites de login, límites de IA y datos relacionados con la sesión. Un atacante que intercepte la conexión podría manipular throttling o provocar denegaciones de servicio.

**Mitigación recomendada:**

Fallar al arrancar si se utiliza `rediss://` sin validación de certificado.

```python
# backend/config/settings.py

if os.environ['VALKEY_URL'].startswith('rediss://'):
    _ca = os.getenv('VALKEY_CA_CERT')

    if not _ca:
        raise RuntimeError(
            'VALKEY_CA_CERT es obligatorio cuando VALKEY_URL utiliza rediss://'
        )

    _opciones['CONNECTION_POOL_KWARGS'] = {
        'ssl_cert_reqs': 'required',
        'ssl_ca_certs': _ca,
    }
```

También debe validarse que `DEBUG=False` en producción antes de iniciar el proceso.

---

## Vulnerabilidades de severidad media

### MEDIA-01: El agente de IA confía en historial controlado por el cliente

**Archivos afectados:**

- `backend/ai_agent/serializers.py`
- `backend/ai_agent/services.py`
- `backend/ai_agent/prompts.py`

El servidor valida que los mensajes sean `user` o `assistant`, pero el historial completo es suministrado por el navegador. Un cliente puede fabricar mensajes `assistant` que nunca fueron generados por el modelo y utilizarlos para alterar el contexto de la conversación.

Esto no permite escribir directamente en la base de datos porque el agente no tiene herramientas, pero puede producir respuestas manipuladas o acciones de navegación inesperadas.

**Mitigación recomendada:**

No aceptar mensajes `assistant` arbitrarios desde el cliente. Guardar la conversación en servidor, asociada al usuario y a un identificador de sesión, o firmar las respuestas emitidas por el backend.

```python
# backend/ai_agent/serializers.py

class MensajeChatSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=['user'])
    content = serializers.CharField(
        trim_whitespace=True,
        max_length=settings.AI_CHAT_MAX_CHARS_MENSAJE,
    )
```

La alternativa más robusta es persistir y recuperar el historial desde el servidor:

```python
historial = ChatMessage.objects.filter(
    user=request.user,
    conversation_id=conversation_id,
).order_by('created_at')
```

---

### MEDIA-02: La lista de rutas del agente también es controlada por el cliente

**Archivos afectados:**

- `backend/ai_agent/serializers.py`
- `backend/ai_agent/views.py`
- `backend/ai_agent/services.py`

El cliente envía `rutas` y el backend utiliza esa lista para construir el prompt y validar la respuesta del modelo. Aunque la ruta debe cumplir una expresión regular, el servidor no comprueba que la ruta pertenezca realmente al catálogo autorizado para el usuario.

Un cliente podría enviar rutas válidas pero no autorizadas y obtener una instrucción de navegación hacia ellas. Los guards del frontend reducen el impacto, pero la autorización no debe depender del cliente.

**Mitigación recomendada:**

Construir el catálogo de rutas en el backend según el rol autenticado y no aceptar `rutas` desde la petición.

```python
# backend/ai_agent/views.py

def ejecutar(self, user, rol, datos):
    rutas_autorizadas = rutas_para_rol(user.role)

    resultado = conversar(
        user,
        rol,
        datos['mensajes'],
        rutas_autorizadas,
    )

    return {'respuesta': resultado['respuesta_texto'], **resultado}
```

El serializer debería eliminar el campo `rutas` de entrada o ignorarlo completamente.

---

### MEDIA-03: La salida de IA no se valida contra un esquema JSON estricto

**Archivos afectados:**

- `backend/ai_agent/services.py`
- `backend/ai_agent/prompts.py`

El código solicita `response_format={"type": "json_object"}`, pero luego solo ejecuta `json.loads()` y validaciones manuales.

Problemas observados:

- Se permiten claves adicionales.
- No se exige que todas las claves estén presentes.
- Los tipos se convierten implícitamente con `str()`.
- El reporte técnico no se valida estructuralmente.
- La respuesta del modelo se trata como sugerencia, pero no existe un esquema formal reutilizable.

**Mitigación recomendada:**

Usar JSON Schema, Pydantic o serializers DRF para validar estrictamente la respuesta antes de devolverla o persistirla.

```python
# backend/ai_agent/services.py

from rest_framework import serializers


class FacturaSalidaSerializer(serializers.Serializer):
    proveedor = serializers.CharField(
        allow_null=True,
        allow_blank=True,
        max_length=200,
    )
    rut_proveedor = serializers.CharField(
        allow_null=True,
        allow_blank=True,
        max_length=15,
    )
    numero_factura = serializers.CharField(
        allow_null=True,
        allow_blank=True,
        max_length=30,
    )
    fecha = serializers.DateField(
        allow_null=True,
        input_formats=['%Y-%m-%d'],
    )
    monto_neto = serializers.IntegerField(
        allow_null=True,
        min_value=0,
    )
    iva = serializers.IntegerField(
        allow_null=True,
        min_value=0,
    )
    total = serializers.IntegerField(
        allow_null=True,
        min_value=0,
    )

    class Meta:
        extra_kwargs = {
            'proveedor': {'required': True},
            'rut_proveedor': {'required': True},
            'numero_factura': {'required': True},
            'fecha': {'required': True},
            'monto_neto': {'required': True},
            'iva': {'required': True},
            'total': {'required': True},
        }
```

La respuesta debe rechazarse si contiene campos desconocidos o tipos inválidos.

---

### MEDIA-04: Prompt Injection mitigado por instrucciones, pero no bloqueado de forma determinista

**Archivos afectados:**

- `backend/ai_agent/prompts.py`
- `backend/ai_agent/services.py`

El system prompt indica que los datos entre etiquetas XML deben tratarse como texto y que se deben ignorar instrucciones incluidas en ellos. Esto es una defensa útil, pero no constituye una garantía técnica contra Prompt Injection.

El modelo sigue procesando contenido controlado por el usuario y el historial puede contener mensajes fabricados. El sistema tampoco aplica una clasificación posterior para verificar que:

- La respuesta respeta el rol.
- La respuesta no revela instrucciones internas.
- La respuesta no contiene órdenes operativas.
- La respuesta no contiene datos sensibles de terceros.

**Mitigación recomendada:**

Mantener el agente sin herramientas, separar datos de instrucciones y validar la respuesta en una segunda capa.

```python
# backend/ai_agent/services.py

def validar_respuesta_agente(respuesta, rol):
    texto = respuesta.get('respuesta_texto', '')

    patrones_prohibidos = (
        'system prompt',
        'instrucciones internas',
        'api key',
        'deepseek_api_key',
        'password',
        'contraseña',
    )

    if any(p in texto.lower() for p in patrones_prohibidos):
        return {
            'respuesta_texto': 'No puedo entregar esa información.',
            'accion': 'ninguna',
            'ruta': None,
            'termino_busqueda': None,
        }

    return respuesta
```

La medida más importante es no entregar al modelo herramientas de escritura, consultas SQL, funciones administrativas ni acceso directo a modelos de Django.

---

### MEDIA-05: Los reportes generados por IA no tienen validación de contenido

**Archivo afectado:**

- `backend/ai_agent/services.py`

`redactar_reporte()` elimina bloques Markdown y limita el tamaño, pero acepta cualquier texto generado por el modelo. No se valida que sea un párrafo técnico, que no incluya precios o que no contenga instrucciones maliciosas.

Aunque el resultado se marca como `requiere_revision=True`, el riesgo aumenta si posteriormente se persiste sin revisión humana.

**Mitigación recomendada:**

Validar longitud, formato, contenido prohibido y exigir confirmación explícita antes de persistir.

```python
# backend/ai_agent/services.py

def validar_reporte(informe):
    informe = informe.strip()[:3000]

    prohibidos = (
        'precio',
        'costo',
        'sueldo',
        'contraseña',
        'api key',
    )

    if any(palabra in informe.lower() for palabra in prohibidos):
        raise ServicioIAError(
            'El reporte generado requiere revisión manual.',
            502,
            'ai_policy_violation',
        )

    if not informe:
        raise ServicioIAError(
            'El agente no devolvió un reporte válido.',
            502,
            'ai_bad_output',
        )

    return informe
```

---

### MEDIA-06: Proxy Vercel → Render sin estrategia explícita de timeout

**Archivos afectados:**

- `vercel.json`
- `src/services/api.js`
- `backend/ai_agent/services.py`

La aplicación usa rewrites de Vercel hacia Render. El backend define timeout para DeepSeek, pero el cliente `fetch()` no tiene `AbortController`, timeout propio ni reintentos controlados para errores 502/503.

Un cold start de Render, una llamada lenta a DeepSeek o una caída temporal puede terminar en 502/503 de Vercel sin una política uniforme de recuperación.

**Mitigación recomendada:**

Configurar timeout de cliente, reintentos limitados y backoff únicamente para operaciones idempotentes.

```javascript
// src/services/api.js

const REQUEST_TIMEOUT_MS = 35_000

async function fetchConTimeout(url, opciones = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...opciones,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}
```

En backend:

```python
# backend/config/settings.py

AI_TIMEOUT_SEGUNDOS = int(os.getenv('AI_TIMEOUT_SEGUNDOS', '25'))

if AI_TIMEOUT_SEGUNDOS >= 30:
    raise RuntimeError(
        'AI_TIMEOUT_SEGUNDOS debe ser inferior al timeout del proxy'
    )
```

Para operaciones de escritura no se deben aplicar reintentos automáticos salvo que exista idempotencia garantizada.

---

### MEDIA-07: Las variables críticas de producción no se validan de forma estricta

**Archivos afectados:**

- `backend/config/settings.py`
- `deploy/.env.prod.example`

La aplicación obliga a definir `DJANGO_SECRET_KEY`, pero permite iniciar con configuraciones inseguras en ciertos escenarios:

- `DEBUG=True` puede desactivar cookies seguras y HSTS.
- `DATABASE_URL` puede conectarse sin SSL cuando `DEBUG=True`.
- `REFRESH_COOKIE_SAMESITE` acepta valores arbitrarios.
- `DEEPSEEK_BASE_URL` es configurable sin una lista de destinos permitidos.
- `MONGO_URI` tiene un valor local por defecto.

**Mitigación recomendada:**

Validar configuración en producción y rechazar valores inseguros.

```python
# backend/config/settings.py

if not DEBUG:
    if os.getenv('DJANGO_DEBUG', '').lower() == 'true':
        raise RuntimeError('DJANGO_DEBUG no puede estar activo en producción')

    if REFRESH_COOKIE_SAMESITE not in {'Lax', 'Strict', 'None'}:
        raise RuntimeError('REFRESH_COOKIE_SAMESITE inválido')

    if not CORS_ALLOWED_ORIGINS:
        raise RuntimeError('CORS_ALLOWED_ORIGINS es obligatorio')

    if DEEPSEEK_BASE_URL not in {
        'https://api.deepseek.com',
    }:
        raise RuntimeError('DEEPSEEK_BASE_URL no permitido')
```

---

## Vulnerabilidades de severidad baja

### BAJA-01: Cabecera CSP permite `unsafe-inline` para estilos

**Archivo afectado:**

- `vercel.json`

La política contiene:

```text
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
```

Esto no permite ejecutar JavaScript inline porque `script-src` permanece restringido, pero reduce la protección contra inyección de estilos y facilita ciertos ataques XSS secundarios.

**Mitigación recomendada:**

Eliminar `unsafe-inline` y utilizar hojas de estilo externas o nonces.

```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
}
```

---

### BAJA-02: Las cabeceras del backend no igualan las de Vercel

**Archivos afectados:**

- `vercel.json`
- `deploy/Caddyfile`
- `backend/config/settings.py`

Vercel configura HSTS, `X-Frame-Options`, `Permissions-Policy` y CSP. Sin embargo, las peticiones directas al backend o a Caddy no reciben el mismo conjunto de cabeceras.

Además, Caddy utiliza:

```text
Strict-Transport-Security "max-age=31536000"
```

sin `includeSubDomains` ni `preload`.

**Mitigación recomendada:**

Aplicar una política equivalente en Caddy y Django.

```text
# deploy/Caddyfile

header {
    -Server
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    Referrer-Policy strict-origin-when-cross-origin
    Permissions-Policy "geolocation=(self), camera=(self), microphone=(), payment=()"
}
```

---

### BAJA-03: El endpoint de salud revela qué servicios están fallando

**Archivo afectado:**

- `backend/evidencias/salud.py`

El endpoint público devuelve:

```json
{
  "estado": "fallo",
  "postgresql": "fallo",
  "valkey": "ok",
  "mongodb": "fallo"
}
```

No expone credenciales, hosts ni mensajes internos, pero permite obtener información operacional del backend.

**Mitigación recomendada:**

Exponer una respuesta pública mínima y reservar el detalle para monitorización autenticada.

```python
# backend/evidencias/salud.py

class SaludView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        todo_ok = comprobar_servicios()

        return Response(
            {'estado': 'ok' if todo_ok else 'fallo'},
            status=status.HTTP_200_OK if todo_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
```

---

## Controles revisados sin vulnerabilidad confirmada

### JWT y sesiones

La implementación actual presenta buenas prácticas:

- El access token vive únicamente en memoria.
- El refresh token se almacena en cookie `HttpOnly`.
- La cookie utiliza `Secure` cuando `DEBUG=False`.
- Los refresh tokens se rotan.
- Los tokens anteriores se incluyen en blacklist.
- El frontend reintenta una petición después de renovar el access token.
- Las renovaciones simultáneas comparten una única promesa.
- `localStorage.removeItem('fyag-auth')` elimina tokens de versiones anteriores.
- El backend no acepta la cookie como autenticación de la API; exige `Authorization: Bearer`.

Archivos relevantes:

- `src/stores/authStore.js`
- `src/services/api.js`
- `backend/accounts/views.py`
- `backend/config/settings.py`

No se confirmó exposición de JWT en `localStorage`.

### CORS y CSRF

La configuración no utiliza `CORS_ALLOW_ALL_ORIGINS` y las credenciales se habilitan solo para orígenes definidos por entorno.

El endpoint de refresh exige la cabecera personalizada `X-FYAG-Client`, lo que dificulta formularios CSRF simples.

Recomendación residual: añadir CSRF real para endpoints basados en cookie o mantener estrictamente la arquitectura de same-site y validar que ningún origen no confiable llegue a `CORS_ALLOWED_ORIGINS`.

### Inyección SQL

No se encontraron consultas SQL dinámicas construidas con entrada del usuario.

El único uso directo de `cursor.execute()` está en:

- `backend/evidencias/salud.py`

Las consultas son literales fijas:

```sql
SELECT 1
SHOW server_version
SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()
select sqlite_version()
SELECT VERSION()
```

El resto del código utiliza el ORM de Django con filtros parametrizados.

### Exposición de secretos

No se observaron claves reales de DeepSeek, contraseñas de base de datos ni `DATABASE_URL` versionadas.

El archivo `.gitignore` excluye:

```text
.env
.env.*
```

Los archivos encontrados son plantillas:

- `backend/.env.example`
- `deploy/.env.prod.example`

Debe verificarse adicionalmente la historia completa de Git y los secretos configurados en Vercel, Render, Docker y CI/CD.

### RBAC de IA

El rol de IA se obtiene desde `request.user.role`, no desde el cuerpo de la petición.

Los endpoints de IA utilizan:

```python
permission_classes = [SoloRoles]
```

Y restringen:

- Facturas: `ADMIN` y `FINANZAS`.
- Reportes: `OPERACIONES` y `TECNICO`.
- Chat: roles definidos en `ROLES_CON_CHAT`.

Esto es correcto, aunque debe corregirse el problema de historial y rutas controladas por el cliente.

---

## Prioridad de remediación

1. ~~Eliminar el comodín `ADMIN` de `RolePermission` y alinear backend con la matriz de segregación.~~ **Riesgo aceptado por regla de negocio** (ver ALTA-01).
2. Exigir validación TLS obligatoria para Valkey.
3. Derivar las rutas del agente desde permisos del backend.
4. Dejar de aceptar mensajes `assistant` arbitrarios desde el navegador.
5. Validar las respuestas de IA con serializers o JSON Schema.
6. Añadir timeout y estrategia controlada para las peticiones frontend.
7. Validar configuración de producción al arrancar.
8. Homogeneizar cabeceras de seguridad entre Vercel, Caddy y Django.
9. Reducir la información expuesta por `/api/salud/`.

## Conclusión

El repositorio tiene una base de seguridad superior a la de una implementación JWT convencional: incorpora 2FA, cookies HttpOnly, rotación de refresh tokens, throttling, validación de roles y separación de servicios.

Los riesgos más importantes se encuentran en la consistencia del RBAC backend y en asumir que las instrucciones de un LLM constituyen una barrera de seguridad suficiente. La IA debe permanecer sin herramientas y sus entradas, contexto y salidas deben validarse en el servidor con controles deterministas.
