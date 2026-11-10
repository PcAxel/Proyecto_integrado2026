"""Integración con DeepSeek (API compatible con OpenAI). Toda la lógica de IA vive aquí; las vistas solo validan y delegan."""
import base64
import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.conf import settings
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError

from .prompts import SYSTEM_PROMPTS, system_prompt, system_prompt_agente, system_prompt_chat  # noqa: F401  (SYSTEM_PROMPTS se expone para pruebas y documentación)

logger = logging.getLogger('ai_agent')


class ServicioIAError(Exception):
    """Error del servicio de IA con el código HTTP que corresponde devolver al cliente."""

    def __init__(self, mensaje, status=502, code='ai_error'):
        super().__init__(mensaje)
        self.mensaje, self.status, self.code = mensaje, status, code


def get_client():
    """Cliente OpenAI apuntando a DeepSeek. La clave sale del entorno del servidor; sin clave el agente no funciona."""
    if not settings.DEEPSEEK_API_KEY:
        raise ServicioIAError('El agente de IA no está configurado en este servidor.', 503, 'ai_not_configured')
    return OpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url=settings.DEEPSEEK_BASE_URL,
                  timeout=settings.AI_TIMEOUT_SEGUNDOS, max_retries=0)  # sin reintento interno: duplicaría la espera


def _contenido_usuario(etiqueta, texto, imagen_b64=None):
    """El texto del usuario va entre etiquetas XML para que el modelo lo trate como dato y no como instrucción."""
    envuelto = f'<{etiqueta}>\n{texto}\n</{etiqueta}>' if texto else ''
    if not imagen_b64:
        return envuelto
    partes = [{'type': 'image_url', 'image_url': {'url': imagen_b64}}]
    if envuelto:
        partes.insert(0, {'type': 'text', 'text': envuelto})
    return partes


def construir_mensajes(rol, tarea, etiqueta, texto, imagen_b64=None):
    """[system (según el ROL del usuario, elegido por el servidor), user (datos)]. El system va SIEMPRE primero."""
    return [
        {'role': 'system', 'content': system_prompt(rol, tarea)},
        {'role': 'user', 'content': _contenido_usuario(etiqueta, texto, imagen_b64)},
    ]


def _completar(usuario, rol, tarea, mensajes, *, json_mode=False, temperature=0.1, max_tokens=None):
    """Llama al modelo y devuelve el texto de la respuesta. Registra uso (sin el contenido, que puede ser sensible)."""
    cliente = get_client()
    try:
        r = cliente.chat.completions.create(
            model=settings.DEEPSEEK_MODEL, messages=mensajes, temperature=temperature, max_tokens=max_tokens or settings.AI_MAX_TOKENS_RESPUESTA,
            **({'response_format': {'type': 'json_object'}} if json_mode else {}),
        )
    except APITimeoutError:
        raise ServicioIAError('El agente tardó demasiado en responder. Inténtalo de nuevo.', 504, 'ai_timeout')
    except RateLimitError:
        raise ServicioIAError('El servicio de IA está saturado. Inténtalo en un minuto.', 503, 'ai_busy')
    except APIConnectionError:
        raise ServicioIAError('No se pudo conectar con el servicio de IA.', 503, 'ai_unreachable')
    except APIStatusError as e:
        logger.warning('ai_error status=%s user=%s tarea=%s', e.status_code, usuario.pk, tarea)
        # 401/402 del proveedor son un problema de configuración nuestro: no se le explican detalles al usuario.
        raise ServicioIAError('El servicio de IA no está disponible por ahora.', 503, 'ai_unavailable')
    uso = getattr(r, 'usage', None)
    logger.info('ai_call user=%s rol=%s tarea=%s tokens=%s', usuario.pk, rol, tarea, getattr(uso, 'total_tokens', None))
    texto_respuesta = (r.choices[0].message.content or '').strip() if r.choices else ''
    if not texto_respuesta:
        logger.warning('ai_empty user=%s tarea=%s json_mode=%s finish=%s', usuario.pk, tarea, json_mode, getattr(r.choices[0], 'finish_reason', None) if r.choices else None)
        raise ServicioIAError('El agente no devolvió una respuesta.', 502, 'ai_empty')
    return texto_respuesta


def chat(usuario, rol, tarea, etiqueta, texto, *, json_mode=False, imagen_b64=None):
    """Tarea estructurada (factura/reporte): un solo mensaje del usuario con formato de salida fijo."""
    return _completar(usuario, rol, tarea, construir_mensajes(rol, tarea, etiqueta, texto, imagen_b64), json_mode=json_mode)


ACCIONES_AGENTE = ('navegar', 'buscar', 'ninguna')
MAX_TERMINO_BUSQUEDA = 80


def interpretar_respuesta_agente(crudo, rutas):
    """Convierte la salida del modelo en una acción segura. Nada de lo que diga el modelo se acepta sin validar:
    la acción debe ser conocida, la ruta debe estar en la lista que el usuario puede abrir y el término se limpia.
    Ante cualquier duda la acción queda en «ninguna» y solo se muestra el texto."""
    permitidas = {r['ruta']: bool(r.get('buscable')) for r in rutas}
    sin_accion = {'accion': 'ninguna', 'ruta': None, 'termino_busqueda': None}
    texto = crudo.strip()
    if texto.startswith('```'):
        texto = texto.strip('`').removeprefix('json').strip()
    try:
        datos = json.loads(texto)
    except ValueError:
        if texto.startswith('{'):  # JSON cortado o roto: no se le muestran llaves al usuario
            return {'respuesta_texto': 'No pude interpretar mi propia respuesta. ¿Me lo preguntas de nuevo?', **sin_accion}
        return {'respuesta_texto': crudo[:settings.AI_MAX_CHARS_RESPUESTA_CHAT], **sin_accion}
    if not isinstance(datos, dict):
        return {'respuesta_texto': crudo[:settings.AI_MAX_CHARS_RESPUESTA_CHAT], **sin_accion}

    respuesta = str(datos.get('respuesta_texto') or '').strip()[:settings.AI_MAX_CHARS_RESPUESTA_CHAT]
    accion, ruta = datos.get('accion'), datos.get('ruta')
    if accion not in ACCIONES_AGENTE or accion == 'ninguna' or ruta not in permitidas:
        return {'respuesta_texto': respuesta or 'Listo.', **sin_accion}
    if accion == 'buscar':
        termino = ''.join(c for c in str(datos.get('termino_busqueda') or '') if c.isprintable()).strip()[:MAX_TERMINO_BUSQUEDA]
        if permitidas[ruta] and termino:
            return {'respuesta_texto': respuesta or f'Busco «{termino}».', 'accion': 'buscar', 'ruta': ruta, 'termino_busqueda': termino}
        accion = 'navegar'  # esa pantalla no filtra por texto (o no hay término): se lleva al usuario sin filtro
    return {'respuesta_texto': respuesta or 'Te llevo a esa pantalla.', 'accion': 'navegar', 'ruta': ruta, 'termino_busqueda': None}


def conversar(usuario, rol, historial, rutas=()):
    """Conversación abierta con capacidad de NAVEGAR y BUSCAR, estrictamente de solo lectura: el modelo no tiene herramientas
    ni acceso a la base de datos; solo propone una acción que la interfaz ejecuta. El system prompt lo elige el servidor según el rol;
    el cliente solo aporta el historial (turnos `user` y `assistant`, nunca `system`). La conversación no se guarda en el servidor."""
    mensajes = [{'role': 'system', 'content': system_prompt_agente(rol, rutas)}, *({'role': m['role'], 'content': m['content']} for m in historial)]
    try:
        crudo = _completar(usuario, rol, 'chat', mensajes, json_mode=True, temperature=0.4, max_tokens=settings.AI_MAX_TOKENS_CHAT)
    except ServicioIAError as e:
        if e.code != 'ai_empty':
            raise
        # El modo JSON estricto de DeepSeek a veces responde vacío (más seguido con historiales largos). Se reintenta una vez sin forzarlo:
        # el prompt igual exige JSON y `interpretar_respuesta_agente` tolera texto plano, así que el usuario no ve el fallo.
        crudo = _completar(usuario, rol, 'chat', mensajes, json_mode=False, temperature=0.4, max_tokens=settings.AI_MAX_TOKENS_CHAT)
    return interpretar_respuesta_agente(crudo, rutas)


# ───────────────────────── Facturas ─────────────────────────
def _entero(v):
    """Monto → entero en pesos. Acepta 119000, '119.000', '$ 119.000', 119000.0. None si no es un número razonable."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float, Decimal)):
        n = Decimal(str(v))
    elif isinstance(v, str):
        limpio = re.sub(r'[^\d,.-]', '', v).replace('.', '').replace(',', '.')
        try:
            n = Decimal(limpio)
        except InvalidOperation:
            return None
    else:
        return None
    return int(n) if n == n.to_integral() and 0 <= n < 10**12 else None


def _fecha(v):
    if not isinstance(v, str):
        return None
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%d.%m.%Y'):
        try:
            return datetime.strptime(v.strip(), fmt).date()
        except ValueError:
            continue
    return None


def validar_factura(crudo):
    """Convierte la salida del modelo en datos confiables para autocompletar el formulario.

    La salida de un LLM es una SUGERENCIA, no un dato: se tipa, se normaliza y se revisa su coherencia. Lo dudoso queda en
    `advertencias` y el resultado siempre sale con `requiere_revision` para que una persona lo confirme antes de guardar.
    """
    if not isinstance(crudo, dict):
        raise ServicioIAError('El agente no devolvió datos de factura válidos.', 502, 'ai_bad_output')
    adv = []
    proveedor = str(crudo.get('proveedor') or '').strip()[:200] or None
    fecha = _fecha(crudo.get('fecha'))
    neto, iva, total = (_entero(crudo.get(k)) for k in ('monto_neto', 'iva', 'total'))
    if not proveedor:
        adv.append('No se pudo leer el proveedor.')
    if not fecha:
        adv.append('No se pudo leer la fecha.')
    elif fecha > date.today():
        adv.append('La fecha de la factura está en el futuro.')
    if neto is None or total is None:
        adv.append('No se pudieron leer los montos neto y total.')
    if iva is None and neto is not None:
        iva = round(neto * 0.19)
        adv.append('El IVA no venía en el texto: se calculó como 19 % del neto.')
    if None not in (neto, iva, total):
        if abs(neto + iva - total) > 1:
            adv.append(f'Los montos no cuadran: neto {neto} + IVA {iva} ≠ total {total}.')
        if neto and abs(iva - neto * 0.19) > max(2, neto * 0.005):
            adv.append('El IVA no corresponde al 19 % del neto.')
    return {
        'proveedor': proveedor,
        'rut_proveedor': str(crudo.get('rut_proveedor') or '').strip()[:15] or None,
        'numero_factura': str(crudo.get('numero_factura') or '').strip()[:30] or None,
        'fecha': fecha.isoformat() if fecha else None,
        'monto_neto': neto, 'iva': iva, 'total': total,
        'advertencias': adv,
        'requiere_revision': True,
    }


def extraer_factura(usuario, rol, texto, imagen=None):
    imagen_b64 = None
    if imagen is not None:
        tipo = getattr(imagen, 'content_type', None) or 'image/png'
        imagen_b64 = f'data:{tipo};base64,' + base64.b64encode(imagen.read()).decode()
    salida = chat(usuario, rol, 'factura', 'factura_ocr', texto, json_mode=True, imagen_b64=imagen_b64)
    # Algunos modelos envuelven el JSON en ```: se acepta, pero se exige que sea JSON válido.
    limpio = re.sub(r'^```(?:json)?\s*|\s*```$', '', salida.strip())
    try:
        return validar_factura(json.loads(limpio))
    except json.JSONDecodeError:
        raise ServicioIAError('El agente no devolvió un JSON válido. Inténtalo de nuevo o ingresa los datos a mano.', 502, 'ai_bad_output')


# ───────────────────────── Reportes técnicos ─────────────────────────
def redactar_reporte(usuario, rol, notas):
    informe = chat(usuario, rol, 'reporte', 'notas_trabajo', notas)
    informe = re.sub(r'^```\w*\s*|\s*```$', '', informe).strip()
    return {'informe': informe[:3000], 'requiere_revision': True}
