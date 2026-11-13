"""Herramientas (Function Calling) que el agente de IA puede invocar. Hoy: generar reportes descargables.

Qué ve y qué puede hacer el modelo:
- Ve una sola herramienta, `generar_reporte`, cuyos conjuntos de datos y formatos son listas cerradas (enum) armadas por el servidor
  según el rol del usuario. No hay SQL, ni nombres de tablas, ni parámetros libres que lleguen a la base.
- Los argumentos que devuelve el modelo se tratan como entrada no confiable: se vuelven a validar aquí y la extracción
  siempre se hace con el usuario autenticado (`request.user`), nunca con un usuario que diga el modelo.
- El resultado que se le devuelve al modelo NO incluye la URL de descarga: la entrega el servidor al cliente aparte, así el modelo no puede inventarla ni alterarla."""
import json
import logging

from django.utils import timezone

from .reportes import datos, generadores, stock

logger = logging.getLogger('ai_agent')

NOMBRE_REPORTE = 'generar_reporte'
NOMBRE_PROYECCION = 'analizar_proyeccion_stock'
NOMBRE_COMPRA = 'generar_borrador_compra_critico'
FORMATOS_COMPRA = ('xlsx', 'docx')
MAX_LARGO_PRODUCTO = 80
MAX_LLAMADAS_POR_TURNO = 1
URL_DESCARGA = '/ai/reportes/{token}/?formato={formato}'


def herramientas_para(usuario):
    """Definición de tools (formato OpenAI/DeepSeek) para este usuario: solo las que su rol puede usar (lista vacía si ninguna)."""
    return [*_tool_reporte(usuario), *_tool_proyeccion(usuario), *_tool_compra(usuario)]


def _tool_proyeccion(usuario):
    if not stock.puede_analizar(usuario):
        return []
    return [{'type': 'function', 'function': {
        'name': NOMBRE_PROYECCION,
        'description': ('Calcula cuánto durará el stock de UN producto según su consumo de los últimos 30 días. El sistema hace TODOS los cálculos y devuelve un texto ya procesado: '
                        'léelo y preséntalo sin cambiar ninguna cifra. Con `formato` además se genera un archivo con el gráfico.'),
        'parameters': {'type': 'object', 'properties': {
            'producto': {'type': 'string', 'maxLength': MAX_LARGO_PRODUCTO, 'description': 'SKU, id o nombre del producto (basta una parte del nombre).'},
            'formato': {'type': 'string', 'enum': list(generadores.FORMATOS), 'description': 'Opcional. Solo si piden un reporte visual o con gráfico: xlsx (Excel), docx (Word), pptx (PowerPoint).'},
        }, 'required': ['producto'], 'additionalProperties': False}}}]


def _tool_compra(usuario):
    if not stock.puede_comprar(usuario):
        return []
    return [{'type': 'function', 'function': {
        'name': NOMBRE_COMPRA,
        'description': ('Prepara el borrador de orden de compra con TODOS los productos en stock crítico. No necesita datos: el sistema elige los productos y calcula las cantidades; '
                        'tú no decides nada. Úsala cuando pidan preparar compras, reponer stock o una orden de compra.'),
        'parameters': {'type': 'object', 'properties': {
            'formato': {'type': 'string', 'enum': list(FORMATOS_COMPRA), 'description': 'Opcional. xlsx (Excel, por defecto) o docx (Word).'},
        }, 'required': [], 'additionalProperties': False}}}]


def _tool_reporte(usuario):
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
                    'mes': {'type': 'integer', 'minimum': 1, 'maximum': 12, 'description': 'Opcional. Mes del filtro (1 = enero … 12 = diciembre). Úsalo cuando pidan «solo de octubre». Sin anio se asume el año en curso.'},
                    'anio': {'type': 'integer', 'minimum': datos.ANIO_MIN, 'maximum': datos.ANIO_MAX, 'description': 'Opcional. Año del filtro. Solo, sirve para pedir un año completo.'},
                    'fecha_inicio': {'type': 'string', 'description': 'Opcional. Inicio de un rango, formato AAAA-MM-DD. No se combina con mes/anio.'},
                    'fecha_fin': {'type': 'string', 'description': 'Opcional. Fin de un rango (inclusive), formato AAAA-MM-DD. No se combina con mes/anio.'},
                },
                'required': ['conjunto', 'formato'],
                'additionalProperties': False,
            },
        },
    }]


def _archivo(info):
    return {'nombre': info['nombre'], 'formato': info['formato'], 'filas': info['filas'], 'url': URL_DESCARGA.format(token=info['token'], formato=info['formato'])}


def _reporte(usuario, args):
    conjunto, formato = args.get('conjunto'), args.get('formato')
    if not isinstance(conjunto, str) or conjunto not in datos.disponibles(usuario) or formato not in generadores.FORMATOS:
        return {'ok': False, 'error': 'Conjunto o formato no permitido para este usuario.'}, None
    # Los filtros de fecha del modelo se validan aquí; el filtro lo aplica el servidor sobre lo que el usuario ya puede ver.
    periodo = datos.periodo_de(args.get('mes'), args.get('anio'), args.get('fecha_inicio'), args.get('fecha_fin'), hoy=timezone.localdate())
    contenido = datos.extraer(usuario, conjunto, periodo)
    if not contenido.filas:
        donde = f' en {periodo.etiqueta}' if periodo else ''
        return {'ok': False, 'error': f'No hay registros de {conjunto}{donde}. No se generó ningún archivo: díselo al usuario y ofrécele otro período.'}, None
    info = generadores.generar(formato, contenido, usuario)
    logger.info('ai_reporte user=%s rol=%s conjunto=%s formato=%s periodo=%s filas=%s', usuario.pk, usuario.role, conjunto, formato, periodo.slug if periodo else '-', info['filas'])
    return {'ok': True, 'filas': info['filas'], 'nota': 'Archivo listo. El enlace de descarga se le muestra al usuario automáticamente: no lo escribas ni lo inventes.'}, _archivo(info)


def _proyeccion(usuario, args):
    producto, formato = args.get('producto'), args.get('formato')
    if not isinstance(producto, str) or not producto.strip() or len(producto) > MAX_LARGO_PRODUCTO:
        return {'ok': False, 'error': 'Indica el SKU o el nombre del producto (máx. 80 caracteres).'}, None
    if formato not in (None, '') and formato not in generadores.FORMATOS:
        return {'ok': False, 'error': 'Formato no permitido.'}, None
    estado, art = stock.buscar_articulo(usuario, producto)
    if estado == 'ninguno':
        return {'ok': False, 'error': f'No encontré un producto activo que coincida con «{producto.strip()[:40]}». Pídele al usuario el SKU o el nombre exacto.'}, None
    if estado == 'varios':
        lista = '; '.join(f"{a['sku']} · {a['nombre']}" for a in art)
        return {'ok': False, 'error': f'Hay varios productos que coinciden: {lista}. Pídele al usuario que indique cuál.'}, None
    p = stock.proyectar(usuario, art, hoy=timezone.localdate())
    resultado, archivo = {'ok': True, 'texto': p.texto, '_calculo': p.texto}, None
    if formato:  # reporte visual: el mismo cálculo, más el gráfico (líneas en Excel; barras en Word y PowerPoint)
        info = generadores.generar(formato, stock.conjunto_proyeccion(p), usuario)
        archivo = _archivo(info)
        resultado['nota'] = 'También se generó un archivo con el gráfico; el botón de descarga se le muestra al usuario solo.'
    logger.info('ai_proyeccion user=%s rol=%s articulo=%s formato=%s', usuario.pk, usuario.role, art['sku'], formato or '-')
    return resultado, archivo


def _compra(usuario, args):
    formato = args.get('formato') or 'xlsx'
    if formato not in FORMATOS_COMPRA:
        return {'ok': False, 'error': 'Formato no permitido: usa xlsx o docx.'}, None
    conjunto, total = stock.compra_critica(usuario, hoy=timezone.localdate())
    if not conjunto.filas:
        texto = 'No hay productos en stock crítico: por ahora no hace falta comprar nada.'
        return {'ok': True, 'texto': texto, '_calculo': texto}, None
    info = generadores.generar(formato, conjunto, usuario)
    resumen = stock.texto_resumen(conjunto)
    if total > len(conjunto.filas):
        resumen += f'\nHay {total} productos críticos; el borrador incluye los primeros {len(conjunto.filas)}.'
    logger.info('ai_compra user=%s rol=%s criticos=%s formato=%s', usuario.pk, usuario.role, total, formato)
    return {'ok': True, 'texto': resumen, '_calculo': resumen, 'nota': 'Borrador listo; el botón de descarga se le muestra al usuario solo. No escribas ni inventes enlaces.'}, _archivo(info)


_MANEJADORES = {NOMBRE_REPORTE: _reporte, NOMBRE_PROYECCION: _proyeccion, NOMBRE_COMPRA: _compra}


def ejecutar(usuario, nombre, argumentos_json):
    """Ejecuta UNA llamada del modelo. Devuelve (resultado_para_el_modelo, archivo_para_el_cliente | None). Nunca lanza por datos del modelo.
    El resultado puede traer `_calculo`: texto ya calculado por el servidor que el chat muestra tal cual (la capa de servicio lo separa antes de hablar con el modelo)."""
    try:
        manejador = _MANEJADORES.get(nombre)
        if manejador is None or nombre not in {t['function']['name'] for t in herramientas_para(usuario)}:
            return {'ok': False, 'error': 'Herramienta desconocida o no permitida.'}, None
        try:
            args = json.loads(argumentos_json or '{}')
        except ValueError:
            return {'ok': False, 'error': 'Argumentos inválidos.'}, None
        return manejador(usuario, args if isinstance(args, dict) else {})
    except datos.PeriodoInvalido as e:
        return {'ok': False, 'error': f'Filtro de fecha inválido: {e}'}, None
    except datos.SinPermiso:
        return {'ok': False, 'error': 'Este usuario no tiene acceso a esos datos.'}, None
    except Exception:  # un fallo al armar el archivo no debe tumbar el chat
        logger.exception('ai_herramienta_error user=%s herramienta=%s', usuario.pk, nombre)
        return {'ok': False, 'error': 'No se pudo completar la acción.'}, None
