"""Cálculos de stock del agente de IA. TODO se calcula aquí, en Python: el modelo (ligero) nunca suma, promedia ni proyecta, solo lee el texto ya procesado.

- `proyectar`: consumo de los últimos 30 días, promedio diario y días que faltan para llegar a cero, con un texto plano listo para mostrar.
- `compra_critica`: productos con stock <= stock crítico (el stock mínimo del artículo) y cuánto comprar de cada uno.
Todo lee por `snapshot.tabla_para`: mismos permisos y mismos campos que ve el usuario en pantalla."""
import math
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal

from accounts.models import Role
from erp import dominio as dom
from erp import reglas, snapshot, tablas

from .datos import Conjunto, SinPermiso

VENTANA_DIAS = 30          # ventana de consumo
HORIZONTE_MAX = 60         # días que se proyectan hacia adelante como máximo
FACTOR_STOCK_MAXIMO = 4    # stock máximo ideal = 4 × el stock mínimo (el artículo no guarda un máximo propio)
MAX_COINCIDENCIAS = 6
MAX_FILAS_COMPRA = 300


def _norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s or '').lower()) if unicodedata.category(c) != 'Mn').strip()


def _n(x):
    """Número para el texto: entero si lo es, con una coma decimal si no (formato chileno)."""
    x = float(x)
    return f'{int(x):,}'.replace(',', '.') if x == int(x) else f'{x:,.1f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def _dmy(d):
    return d.strftime('%d-%m-%Y')


def _fecha(m):
    try:
        return datetime.fromisoformat(str(m['fecha'])).date()
    except (KeyError, ValueError):
        return None


def _exigir(user):
    if user.role == Role.TECNICO or not (tablas.puede_leer(user, 'cardex') and tablas.puede_leer(user, 'articulos')):
        raise SinPermiso('Tu rol no tiene acceso a los datos de bodega.')


# ───────────────────────── Proyección de un producto ─────────────────────────
@dataclass
class Proyeccion:
    articulo: dict
    stock: Decimal
    consumo: Decimal              # neto de los últimos 30 días
    promedio: Decimal             # consumo diario
    dias: int | None              # días enteros hasta llegar a cero; None si no hay consumo
    agota: date | None
    bajo_minimo_en: int | None    # días hasta quedar bajo el stock mínimo (None si ya está bajo o no hay consumo)
    serie: list = field(default_factory=list)   # [(fecha, stock_real | None, stock_proyectado | None)]
    texto: str = ''


def buscar_articulo(user, texto):
    """('uno', artículo) | ('varios', [artículos]) | ('ninguno', None). Acepta id, SKU o nombre (o parte de él, sin tildes ni mayúsculas)."""
    _exigir(user)
    q = _norm(str(texto)[:80])
    if not q:
        return 'ninguno', None
    activos = [a for a in snapshot.tabla_para(user, 'articulos') if a.get('activo', True)]
    for clave in ('id', 'sku', 'nombre'):  # coincidencia exacta primero
        exactos = [a for a in activos if _norm(a.get(clave)) == q]
        if len(exactos) == 1:
            return 'uno', exactos[0]
    palabras = q.split()
    parciales = [a for a in activos if all(p in _norm(f"{a['sku']} {a['nombre']}") for p in palabras)]
    if len(parciales) == 1:
        return 'uno', parciales[0]
    return ('varios', sorted(parciales, key=lambda a: a['sku'])[:MAX_COINCIDENCIAS]) if parciales else ('ninguno', None)


def proyectar(user, articulo, hoy=None):
    """Consumo, promedio y días restantes de UN artículo, calculados con el cardex de los últimos 30 días."""
    _exigir(user)
    hoy = hoy or date.today()
    movs = [m for m in snapshot.tabla_para(user, 'cardex') if m['articulo_id'] == articulo['id']]
    stock = reglas.stock(movs, articulo['id'])
    por_id = {m['id']: m for m in movs}
    desde = hoy - timedelta(days=VENTANA_DIAS)
    consumo = Decimal(0)
    for m in movs:
        f = _fecha(m)
        if f is None or f < desde or f > hoy:
            continue
        c = reglas.num(m['cantidad'])
        if m['tipo'] == reglas.SALIDA:
            consumo += c
        elif m['tipo'] == reglas.REINGRESO:
            consumo -= c  # lo que vuelve de una obra no se consumió
        elif m['tipo'] == reglas.REVERSA and por_id.get(m.get('reversa_de'), {}).get('tipo') == reglas.SALIDA:
            consumo -= c  # una salida reversada tampoco
    consumo = max(consumo, Decimal(0))
    promedio = consumo / VENTANA_DIAS
    minimo = reglas.num(articulo.get('stock_minimo') or 0)
    dias = agota = bajo = None
    if promedio > 0:
        dias = max(int(stock / promedio), 0) if stock > 0 else 0
        agota = hoy + timedelta(days=dias)
        if stock > minimo:
            bajo = int((stock - minimo) / promedio)
    # Serie diaria: stock real de los últimos 30 días (hacia atrás desde el stock actual) y la proyección lineal hacia adelante.
    fechas = {id(m): _fecha(m) for m in movs}
    serie = []
    for i in range(VENTANA_DIAS, -1, -1):
        d = hoy - timedelta(days=i)
        despues = sum(m['signo'] * reglas.num(m['cantidad']) for m in movs if fechas[id(m)] and fechas[id(m)] > d)
        serie.append([d, float(stock - despues), float(stock) if i == 0 else None])
    if promedio > 0 and stock > 0:
        for k in range(1, min(dias + 1, HORIZONTE_MAX) + 1):
            serie.append([hoy + timedelta(days=k), None, float(max(stock - promedio * k, 0))])
    u = articulo.get('unidad', 'un')
    lineas = [f"Producto: {articulo['nombre']} (SKU {articulo['sku']}).",
              f'Stock actual: {_n(stock)} {u}. Stock mínimo: {_n(minimo)} {u}.',
              f'Consumo de los últimos {VENTANA_DIAS} días: {_n(consumo)} {u}. Consumo diario promedio: {_n(promedio)} {u}.']
    if stock <= 0:
        lineas.append('El producto ya está sin stock.')
    elif dias is None:
        lineas.append(f'No hubo consumo en los últimos {VENTANA_DIAS} días, por lo que no se proyecta un agotamiento.')
    else:
        lineas.append(f'Se agotará en {dias} día{"" if dias == 1 else "s"} (aprox. el {_dmy(agota)}).')
        if stock <= minimo:
            lineas.append('Ya está en o bajo el stock mínimo: conviene reponer.')
        elif bajo is not None:
            lineas.append(f'Quedará bajo el stock mínimo en {bajo} día{"" if bajo == 1 else "s"}.')
    return Proyeccion(articulo, stock, consumo, promedio, dias, agota, bajo, [tuple(s) for s in serie], '\n'.join(lineas))


def conjunto_proyeccion(p: Proyeccion):
    """El mismo cálculo como `Conjunto` para Excel/Word/PowerPoint: resumen, tabla diaria y gráfico (líneas en Excel, barras en Word y PowerPoint)."""
    a = p.articulo
    resumen = [('Producto', f"{a['nombre']} ({a['sku']})", 'texto'), ('Stock actual', float(p.stock), 'num'), ('Stock mínimo', float(reglas.num(a.get('stock_minimo') or 0)), 'num'),
               (f'Consumo últimos {VENTANA_DIAS} días', float(p.consumo), 'num'), ('Consumo diario promedio', f'{_n(p.promedio)}', 'texto'),
               ('Días hasta agotarse', 'Sin consumo' if p.dias is None else str(p.dias), 'texto'), ('Fecha estimada de agotamiento', _dmy(p.agota) if p.agota else '—', 'texto')]
    filas = [{'fecha': d.isoformat(), 'real': r, 'proy': pr} for d, r, pr in p.serie]
    return Conjunto('proyeccion_stock', f"Proyección de stock · {a['sku']}",
                    [('fecha', 'Fecha', 'fecha'), ('real', 'Stock real', 'num'), ('proy', 'Stock proyectado', 'num')], filas, resumen,
                    subtitulo='Consumo y proyección calculados por el sistema a partir del cardex', totales=False,
                    nota='La proyección es lineal: supone que el consumo diario promedio de los últimos 30 días se mantiene.',
                    grafico={'titulo': f"Stock de {a['sku']}: real y proyectado", 'categoria': 'fecha', 'eje_y': a.get('unidad', 'unidades'),
                             'series': [{'nombre': 'Stock real', 'columna': 'real', 'color': '0B2A3F'}, {'nombre': 'Stock proyectado', 'columna': 'proy', 'color': 'C6601F', 'punteada': True}]})


# ───────────────────────── Compra de productos críticos ─────────────────────────
def compra_critica(user, hoy=None):
    """Productos con stock <= stock crítico y cuánto comprar de cada uno (rellenar hasta FACTOR_STOCK_MAXIMO × el mínimo). Devuelve (Conjunto, total_críticos)."""
    _exigir(user)
    if not tablas.tiene(user, ['compras.ver']):
        raise SinPermiso('Tu rol no gestiona compras.')
    hoy = hoy or date.today()
    movs = snapshot.tabla_para(user, 'cardex')
    stock = {}
    for m in movs:
        stock[m['articulo_id']] = stock.get(m['articulo_id'], Decimal(0)) + m['signo'] * reglas.num(m['cantidad'])
    try:
        proveedores = {p['id']: p['razon_social'] for p in snapshot.tabla_para(user, 'proveedores')}
    except KeyError:
        proveedores = {}
    arts = [a for a in snapshot.tabla_para(user, 'articulos') if a.get('activo', True) and a.get('stock_minimo')]
    con_costo = bool(arts) and all('costo_unitario' in a for a in arts)  # sin permiso de costos el campo ni siquiera llega
    filas = []
    for a in arts:
        s, critico = stock.get(a['id'], Decimal(0)), reglas.num(a['stock_minimo'])
        if s > critico:
            continue
        cantidad = max(math.ceil(critico * FACTOR_STOCK_MAXIMO - s), 1)
        fila = {'proveedor': proveedores.get(a.get('proveedor_id'), a.get('proveedor_id') or '—'), 'sku': a['sku'], 'nombre': a['nombre'], 'unidad': a.get('unidad', 'un'),
                'stock': float(s), 'minimo': float(critico), 'cantidad': cantidad}
        if con_costo:
            fila.update(costo=a['costo_unitario'], subtotal=a['costo_unitario'] * cantidad)
        filas.append(fila)
    filas.sort(key=lambda f: (f['proveedor'], f['sku']))
    total_criticos, filas = len(filas), filas[:MAX_FILAS_COMPRA]
    columnas = [('proveedor', 'Proveedor', 'texto'), ('sku', 'SKU', 'texto'), ('nombre', 'Descripción', 'texto'), ('unidad', 'Unidad', 'texto'), ('stock', 'Stock actual', 'num'),
                ('minimo', 'Stock crítico', 'num'), ('cantidad', 'Cantidad a comprar', 'num')]
    resumen = [('Documento', 'Borrador de orden de compra (no es una orden emitida)', 'texto'), ('Fecha', _dmy(hoy), 'texto'), ('Productos críticos', len(filas), 'num'),
               ('Proveedores', len({f['proveedor'] for f in filas}), 'num')]
    if con_costo:
        columnas += [('costo', 'Costo unitario', 'clpu'), ('subtotal', 'Subtotal', 'clp')]
        neto = sum(f['subtotal'] for f in filas)
        d = dom.desglosar_total(neto)
        resumen += [('Neto', d['neto'], 'clp'), ('IVA (19 %)', d['iva'], 'clp'), ('Total', d['total'], 'clp')]
    return Conjunto('orden_compra', 'Orden de Compra - FYAG', columnas, filas, resumen, subtitulo='BORRADOR · generado automáticamente a partir del stock crítico', totales=con_costo,
                    firmas=['Solicitado por', 'Aprobado por'],
                    nota=f'Cantidades calculadas por el sistema: se repone hasta {FACTOR_STOCK_MAXIMO} veces el stock crítico de cada artículo.'), total_criticos


def puede_analizar(user):
    try:
        _exigir(user)
        return True
    except SinPermiso:
        return False


def puede_comprar(user):
    return puede_analizar(user) and tablas.tiene(user, ['compras.ver'])


def texto_resumen(c):
    """El resumen de un `Conjunto` como texto plano (para mostrarlo tal cual en el chat)."""
    from .generadores import _texto
    return '\n'.join(f'{e}: {_texto(v, tipo)}' for e, v, tipo in c.resumen if e != 'Documento')
