"""Herramientas (Function Calling) que el agente de IA puede invocar. Hoy: generar reportes descargables.

Qué ve y qué puede hacer el modelo:
- Ve una sola herramienta, `generar_reporte`, cuyos conjuntos de datos y formatos son listas cerradas (enum) armadas por el servidor
  según el rol del usuario. No hay SQL, ni nombres de tablas, ni parámetros libres que lleguen a la base.
- Los argumentos que devuelve el modelo se tratan como entrada no confiable: se vuelven a validar aquí y la extracción
  siempre se hace con el usuario autenticado (`request.user`), nunca con un usuario que diga el modelo.
- El resultado que se le devuelve al modelo NO incluye la URL de descarga: la entrega el servidor al cliente aparte, así el modelo no puede inventarla ni alterarla."""
import json
import logging

from .reportes import datos, generadores

logger = logging.getLogger('ai_agent')

NOMBRE_REPORTE = 'generar_reporte'
MAX_LLAMADAS_POR_TURNO = 1
URL_DESCARGA = '/ai/reportes/{token}/?formato={formato}'


def herramientas_para(usuario):
    """Definición de tools (formato OpenAI/DeepSeek) para este usuario; lista vacía si su rol no puede generar reportes."""
    conjuntos = datos.disponibles(usuario)
    if not conjuntos:
        return []
    descripcion = '; '.join(datos.CONJUNTOS[k][2] for k in conjuntos)
    return [{
        'type': 'function',
        'function': {
            'name': NOMBRE_REPORTE,
            'description': ('Genera un archivo descargable (Excel, Word o PowerPoint) con datos del ERP que el usuario puede ver. '
                            f'Úsala cuando el usuario pida un reporte, informe, planilla o presentación. Conjuntos disponibles: {descripcion}.'),
            'parameters': {
                'type': 'object',
                'properties': {
                    'conjunto': {'type': 'string', 'enum': conjuntos, 'description': 'Qué datos incluir.'},
                    'formato': {'type': 'string', 'enum': list(generadores.FORMATOS), 'description': 'xlsx = Excel, docx = Word, pptx = PowerPoint.'},
                },
                'required': ['conjunto', 'formato'],
                'additionalProperties': False,
            },
        },
    }]


def ejecutar(usuario, nombre, argumentos_json):
    """Ejecuta UNA llamada del modelo. Devuelve (resultado_para_el_modelo, archivo_para_el_cliente | None). Nunca lanza por datos del modelo."""
    try:
        if nombre != NOMBRE_REPORTE:
            return {'ok': False, 'error': 'Herramienta desconocida.'}, None
        try:
            args = json.loads(argumentos_json or '{}')
        except ValueError:
            return {'ok': False, 'error': 'Argumentos inválidos.'}, None
        conjunto, formato = (args.get('conjunto'), args.get('formato')) if isinstance(args, dict) else (None, None)
        if conjunto not in datos.disponibles(usuario) or formato not in generadores.FORMATOS:
            return {'ok': False, 'error': 'Conjunto o formato no permitido para este usuario.'}, None
        info = generadores.generar(formato, datos.extraer(usuario, conjunto), usuario)
    except datos.SinPermiso:
        return {'ok': False, 'error': 'Este usuario no tiene acceso a esos datos.'}, None
    except Exception:  # un fallo al armar el archivo no debe tumbar el chat
        logger.exception('ai_reporte_error user=%s', usuario.pk)
        return {'ok': False, 'error': 'No se pudo generar el archivo.'}, None
    logger.info('ai_reporte user=%s rol=%s conjunto=%s formato=%s filas=%s', usuario.pk, usuario.role, conjunto, formato, info['filas'])
    archivo = {'nombre': info['nombre'], 'formato': formato, 'filas': info['filas'], 'url': URL_DESCARGA.format(token=info['token'], formato=formato)}
    return {'ok': True, 'filas': info['filas'], 'nota': 'Archivo listo. El enlace de descarga se le muestra al usuario automáticamente: no lo escribas ni lo inventes.'}, archivo
