"""Business intelligence del informe ejecutivo: todas las cifras salen de agregaciones del ORM (Sum, Avg, Count) sobre `erp.Registro`.
El cliente no envía ningún número: el servidor calcula y el PowerPoint solo lo muestra."""
from collections import defaultdict

from django.db.models import Avg, Count, F, FloatField, Sum
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Cast, Substr

from .dominio import rentabilidad_de
from .models import Registro

# Movimientos del Cardex que cargan o devuelven material a una obra (con `obra_id`): su neto, con signo invertido, es el gasto real.
MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']


def _campo(nombre, tipo=None):
    t = KeyTextTransform(nombre, 'datos')
    return Cast(t, tipo) if tipo else t


def _tabla(nombre):
    return Registro.objects.filter(tabla=nombre)


def _en_rango(qs, campo, desde, hasta):
    """Filtra por el día (los primeros 10 caracteres de la fecha ISO, con o sin hora) entre `desde` y `hasta`, ambos inclusive y opcionales."""
    if not (desde or hasta):
        return qs
    qs = qs.annotate(_dia=Substr(_campo(campo), 1, 10))
    if desde:
        qs = qs.filter(_dia__gte=desde)
    if hasta:
        qs = qs.filter(_dia__lte=hasta)
    return qs


def _num(x):
    return float(x or 0)


def stock_por_articulo(hasta=None):
    """{articulo_id: unidades en bodega al cierre de `hasta` (hoy si no se indica)}: suma con signo del Cardex."""
    filas = (_en_rango(_tabla('cardex'), 'fecha', None, hasta)
             .annotate(art=_campo('articulo_id'), cant=_campo('cantidad', FloatField()), sig=_campo('signo', FloatField()))
             .values('art').annotate(stock=Sum(F('cant') * F('sig'))))
    return {f['art']: _num(f['stock']) for f in filas}


def inventario(hasta=None):
    """Dinero inmovilizado en bodega (stock al cierre × último costo) total y por categoría."""
    stock = stock_por_articulo(hasta)
    por_categoria, total, unidades, con_stock = defaultdict(float), 0.0, 0.0, 0
    for a in _tabla('articulos').values('rid', 'datos'):
        d = a['datos']
        if d.get('activo') is False:
            continue
        u = stock.get(a['rid'], 0)
        if u <= 0:
            continue
        valor = u * _num(d.get('costo_unitario'))
        por_categoria[d.get('categoria') or 'Sin categoría'] += valor
        total, unidades, con_stock = total + valor, unidades + u, con_stock + 1
    return {'total': round(total), 'unidades': round(unidades), 'articulos_con_stock': con_stock,
            'por_categoria': sorted(((k, round(v)) for k, v in por_categoria.items()), key=lambda x: -x[1])}


def compras(desde=None, hasta=None):
    """Gasto en facturas de compra del periodo: total, promedio por factura y serie mensual (neto)."""
    f = _en_rango(_tabla('facturas'), 'fecha', desde, hasta).annotate(neto=_campo('neto', FloatField()), fecha=_campo('fecha'))
    resumen = f.aggregate(total=Sum('neto'), promedio=Avg('neto'), cantidad=Count('id'))
    mensual = f.annotate(mes=Substr('fecha', 1, 7)).values('mes').annotate(total=Sum('neto')).order_by('mes')
    serie = [(f"{MESES[int(m['mes'][5:7])]} {m['mes'][2:4]}", round(_num(m['total']))) for m in mensual if m['mes'] and len(m['mes']) == 7]
    return {'total': round(_num(resumen['total'])), 'promedio': round(_num(resumen['promedio'])), 'facturas': resumen['cantidad'], 'mensual': serie[-12:]}


def gasto_real_por_obra(desde=None, hasta=None):
    """{obra_id: costo real de materiales del periodo}: salidas a obra menos reversas y sobrantes reingresados, al costo de cada movimiento."""
    filas = (_en_rango(_tabla('cardex'), 'fecha', desde, hasta)
             .annotate(obra=_campo('obra_id'), cant=_campo('cantidad', FloatField()), sig=_campo('signo', FloatField()), costo=_campo('costo_unitario', FloatField()))
             .exclude(obra=None).values('obra').annotate(gasto=Sum(-F('cant') * F('sig') * F('costo'))))
    return {f['obra']: _num(f['gasto']) for f in filas}


def obras_presupuesto_vs_real(desde=None, hasta=None, limite=8):
    """Por obra con presupuesto: materiales presupuestados vs gasto real de materiales (las cifras comparables), de mayor a menor gasto.
    Con periodo, solo las obras que consumieron material en esas fechas y el gasto es el del periodo."""
    real = gasto_real_por_obra(desde, hasta)
    presupuestos = {p['rid']: p['datos'] for p in _tabla('presupuestos').values('rid', 'datos')}
    filas = []
    for o in _tabla('obras').values('rid', 'datos'):
        p = presupuestos.get(o['datos'].get('presupuesto_id'))
        if not p or ((desde or hasta) and not real.get(o['rid'])):
            continue
        previsto = sum(_num(m.get('cantidad')) * _num(m.get('costo_unitario')) for m in p.get('materiales') or [])
        filas.append({'obra': o['rid'], 'nombre': o['datos'].get('nombre', ''), 'presupuesto': round(previsto), 'real': round(real.get(o['rid'], 0))})
    filas.sort(key=lambda x: -max(x['presupuesto'], x['real']))
    return filas[:limite]


def rentabilidad(desde=None, hasta=None):
    """Presupuestos aprobados en el periodo (por su fecha): venta neta, costo cotizado y margen promedio (ponderado por venta y simple)."""
    articulos = [{'id': a['rid'], **a['datos']} for a in _tabla('articulos').values('rid', 'datos')]
    venta = costo = 0.0
    margenes = []
    n = 0
    for p in _en_rango(_tabla('presupuestos').filter(datos__estado='APROBADO'), 'fecha', desde, hasta).values('rid', 'datos'):
        r = rentabilidad_de(p['datos'], articulos)
        v = _num(p['datos'].get('precio_venta_neto'))
        if v <= 0:
            continue
        n, venta, costo = n + 1, venta + v, costo + r['costo_total']
        margenes.append(r['margen_ganancia'])
    return {'aprobados': n, 'venta': round(venta), 'costo': round(costo), 'utilidad': round(venta - costo),
            'margen_ponderado': round((venta - costo) / venta * 100, 1) if venta else 0, 'margen_promedio': round(sum(margenes) / len(margenes), 1) if margenes else 0}


def obras_por_estado():
    filas = _tabla('obras').annotate(estado=_campo('estado')).values('estado').annotate(n=Count('id'))
    return {f['estado'] or 'SIN_ESTADO': f['n'] for f in filas}


def informe_ejecutivo(desde=None, hasta=None):
    """`desde`/`hasta` (YYYY-MM-DD, opcionales) acotan compras, gasto de obras y presupuestos aprobados al periodo; el inventario es un saldo y
    se calcula al cierre de `hasta`."""
    obras = obras_presupuesto_vs_real(desde, hasta)
    ejecutado = sum(o['real'] for o in obras)
    previsto = sum(o['presupuesto'] for o in obras)
    return {'periodo': {'desde': desde, 'hasta': hasta}, 'compras': compras(desde, hasta), 'inventario': inventario(hasta), 'rentabilidad': rentabilidad(desde, hasta),
            'obras': obras, 'obras_por_estado': obras_por_estado(),
            'ejecucion_materiales': {'presupuesto': previsto, 'real': ejecutado, 'ejecucion_pct': round(ejecutado / previsto * 100, 1) if previsto else 0}}
