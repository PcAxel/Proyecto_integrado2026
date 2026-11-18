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


def _num(x):
    return float(x or 0)


def stock_por_articulo():
    """{articulo_id: unidades en bodega}: suma con signo del Cardex."""
    filas = (_tabla('cardex')
             .annotate(art=_campo('articulo_id'), cant=_campo('cantidad', FloatField()), sig=_campo('signo', FloatField()))
             .values('art').annotate(stock=Sum(F('cant') * F('sig'))))
    return {f['art']: _num(f['stock']) for f in filas}


def inventario():
    """Dinero inmovilizado en bodega (stock × último costo) total y por categoría."""
    stock = stock_por_articulo()
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


def compras():
    """Gasto en facturas de compra: total, promedio por factura y serie mensual (neto)."""
    f = _tabla('facturas').annotate(neto=_campo('neto', FloatField()), fecha=_campo('fecha'))
    resumen = f.aggregate(total=Sum('neto'), promedio=Avg('neto'), cantidad=Count('id'))
    mensual = f.annotate(mes=Substr('fecha', 1, 7)).values('mes').annotate(total=Sum('neto')).order_by('mes')
    serie = [(f"{MESES[int(m['mes'][5:7])]} {m['mes'][2:4]}", round(_num(m['total']))) for m in mensual if m['mes'] and len(m['mes']) == 7]
    return {'total': round(_num(resumen['total'])), 'promedio': round(_num(resumen['promedio'])), 'facturas': resumen['cantidad'], 'mensual': serie[-12:]}


def gasto_real_por_obra():
    """{obra_id: costo real de materiales}: salidas a obra menos reversas y sobrantes reingresados, al costo de cada movimiento."""
    filas = (_tabla('cardex')
             .annotate(obra=_campo('obra_id'), cant=_campo('cantidad', FloatField()), sig=_campo('signo', FloatField()), costo=_campo('costo_unitario', FloatField()))
             .exclude(obra=None).values('obra').annotate(gasto=Sum(-F('cant') * F('sig') * F('costo'))))
    return {f['obra']: _num(f['gasto']) for f in filas}


def obras_presupuesto_vs_real(limite=8):
    """Por obra con presupuesto: materiales presupuestados vs gasto real de materiales (las cifras comparables), de mayor a menor gasto."""
    real = gasto_real_por_obra()
    presupuestos = {p['rid']: p['datos'] for p in _tabla('presupuestos').values('rid', 'datos')}
    filas = []
    for o in _tabla('obras').values('rid', 'datos'):
        p = presupuestos.get(o['datos'].get('presupuesto_id'))
        if not p:
            continue
        previsto = sum(_num(m.get('cantidad')) * _num(m.get('costo_unitario')) for m in p.get('materiales') or [])
        filas.append({'obra': o['rid'], 'nombre': o['datos'].get('nombre', ''), 'presupuesto': round(previsto), 'real': round(real.get(o['rid'], 0))})
    filas.sort(key=lambda x: -max(x['presupuesto'], x['real']))
    return filas[:limite]


def rentabilidad():
    """Presupuestos aprobados: venta neta, costo cotizado y margen promedio (ponderado por venta y simple)."""
    articulos = [{'id': a['rid'], **a['datos']} for a in _tabla('articulos').values('rid', 'datos')]
    venta = costo = 0.0
    margenes = []
    n = 0
    for p in _tabla('presupuestos').filter(datos__estado='APROBADO').values('rid', 'datos'):
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


def informe_ejecutivo():
    obras = obras_presupuesto_vs_real()
    ejecutado = sum(o['real'] for o in obras)
    previsto = sum(o['presupuesto'] for o in obras)
    return {'compras': compras(), 'inventario': inventario(), 'rentabilidad': rentabilidad(), 'obras': obras, 'obras_por_estado': obras_por_estado(),
            'ejecucion_materiales': {'presupuesto': previsto, 'real': ejecutado, 'ejecucion_pct': round(ejecutado / previsto * 100, 1) if previsto else 0}}
