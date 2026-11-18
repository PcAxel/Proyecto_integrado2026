"""Dashboard tributario y de flujo de caja del mes: ingresos (facturas de venta DTE aceptadas), gastos (facturas de compra menos notas de crédito),
ganancia neta e IVA del mes. Todo se suma en la base de datos con el ORM; el cliente solo elige el mes."""
import calendar
from datetime import date, datetime, time

from django.db.models import Count, FloatField, Sum
from django.utils import timezone

from facturacion.models import FacturaDTE

from .informes import _campo, _en_rango, _num, _tabla

TASA_IVA = 19


def rango_del_mes(mes=None):
    """('YYYY-MM', primer día, último día) del mes pedido (`YYYY-MM`); el mes en curso si no se indica. ValueError si el formato no sirve."""
    if mes:
        y, m = (int(x) for x in str(mes).split('-'))
        date(y, m, 1)
    else:
        hoy = timezone.localdate()
        y, m = hoy.year, hoy.month
    return f'{y}-{m:02d}', date(y, m, 1).isoformat(), date(y, m, calendar.monthrange(y, m)[1]).isoformat()


def instantes_del_mes(y, m):
    """[inicio, fin) del mes en la zona horaria del sistema. Se filtra por rango y no con `__year`/`__month`, que en MySQL sin tablas de zona
    horaria no devuelven nada."""
    zona = timezone.get_current_timezone()
    siguiente = date(y + (m == 12), m % 12 + 1, 1)
    return (timezone.make_aware(datetime.combine(date(y, m, 1), time.min), zona), timezone.make_aware(datetime.combine(siguiente, time.min), zona))


def _sumas(qs):
    a = qs.annotate(_n=_campo('neto', FloatField()), _i=_campo('iva', FloatField())).aggregate(cantidad=Count('id'), neto=Sum('_n'), iva=Sum('_i'))
    return {'cantidad': a['cantidad'], 'neto': round(_num(a['neto'])), 'iva': round(_num(a['iva']))}


def resumen_tributario(mes=None):
    periodo, desde, hasta = rango_del_mes(mes)
    y, m = int(periodo[:4]), int(periodo[5:])

    inicio, fin = instantes_del_mes(y, m)
    v = FacturaDTE.objects.filter(estado_sii=FacturaDTE.EstadoSII.ACEPTADO, emitido_en__gte=inicio, emitido_en__lt=fin).aggregate(
        cantidad=Count('id'), neto=Sum('monto_neto'), iva=Sum('monto_iva'))
    ventas = {'cantidad': v['cantidad'], 'neto': v['neto'] or 0, 'iva': v['iva'] or 0}

    facturas = _sumas(_en_rango(_tabla('facturas'), 'fecha', desde, hasta))
    notas = _sumas(_en_rango(_tabla('notas_credito'), 'fecha', desde, hasta))  # una nota de crédito reduce el gasto y el crédito fiscal
    compras = {'facturas': facturas['cantidad'], 'neto_bruto': facturas['neto'], 'iva_bruto': facturas['iva'],
               'notas_credito': notas, 'neto': facturas['neto'] - notas['neto'], 'iva': facturas['iva'] - notas['iva']}

    saldo = ventas['iva'] - compras['iva']  # IVA débito (ventas) − IVA crédito (compras)
    ganancia = ventas['neto'] - compras['neto']
    return {
        'periodo': periodo, 'tasa_iva': TASA_IVA,
        'ventas': ventas, 'compras': compras,
        'ganancia_neta': ganancia,
        'margen_pct': round(ganancia / ventas['neto'] * 100, 1) if ventas['neto'] else None,
        'iva': {'debito': ventas['iva'], 'credito': compras['iva'], 'saldo': saldo,
                'situacion': 'A_PAGAR' if saldo > 0 else 'A_FAVOR' if saldo < 0 else 'SIN_SALDO'},
    }


# ───────── Libro de IVA: detalle del mes, remanente que se arrastra e historial ─────────
LIMITE_DOCUMENTOS = 1000


def _mes_de(dt):
    return timezone.localtime(dt).strftime('%Y-%m')


def _debito_por_mes():
    """{YYYY-MM: IVA de ventas}: facturas electrónicas aceptadas, agrupadas por el mes local de emisión."""
    out = {}
    for emitido, iva in FacturaDTE.objects.filter(estado_sii=FacturaDTE.EstadoSII.ACEPTADO, emitido_en__isnull=False).values_list('emitido_en', 'monto_iva'):
        out[_mes_de(emitido)] = out.get(_mes_de(emitido), 0) + iva
    return out


def _credito_por_mes():
    """{YYYY-MM: IVA de compras − IVA de notas de crédito}, sumado en la base de datos."""
    from django.db.models.functions import Substr
    out = {}
    for tabla, signo in (('facturas', 1), ('notas_credito', -1)):
        filas = (_tabla(tabla).annotate(_m=Substr(_campo('fecha'), 1, 7), _i=_campo('iva', FloatField()))
                 .values('_m').annotate(iva=Sum('_i')))
        for f in filas:
            if f['_m'] and len(f['_m']) == 7:
                out[f['_m']] = out.get(f['_m'], 0) + signo * round(_num(f['iva']))
    return out


def _meses_hasta(primero, ultimo):
    y, m = int(primero[:4]), int(primero[5:])
    fin = (int(ultimo[:4]), int(ultimo[5:]))
    while (y, m) <= fin:
        yield f'{y}-{m:02d}'
        y, m = y + (m == 12), m % 12 + 1


def libro_iva(hasta_mes):
    """Mes a mes: IVA débito, IVA crédito, saldo y remanente de crédito fiscal que se arrastra al mes siguiente (en pesos nominales, sin reajuste).
    El remanente de un mes baja el IVA a pagar del siguiente; si el saldo del mes supera el remanente, la diferencia se paga."""
    debito, credito = _debito_por_mes(), _credito_por_mes()
    todos = [m for m in (*debito, *credito) if m <= hasta_mes]
    if not todos:
        return []
    filas, remanente = [], 0
    for mes in _meses_hasta(min(todos), hasta_mes):
        d, c = debito.get(mes, 0), credito.get(mes, 0)
        neto_mes = d - c - remanente  # >0 se paga; <0 queda remanente
        filas.append({'mes': mes, 'debito': d, 'credito': c, 'saldo': d - c, 'remanente_anterior': remanente,
                      'a_pagar': max(neto_mes, 0), 'remanente_final': max(-neto_mes, 0)})
        remanente = max(-neto_mes, 0)
    return filas


def _nombres(tabla, campo):
    return {r['rid']: (r['datos'].get(campo, ''), r['datos'].get('rut', '')) for r in _tabla(tabla).values('rid', 'datos')}


def impuestos_del_mes(mes=None):
    """Todo lo que Finanzas necesita para preparar el IVA del mes: resumen con remanente, documentos de venta y de compra y el historial."""
    periodo, desde, hasta = rango_del_mes(mes)
    y, m = int(periodo[:4]), int(periodo[5:])
    inicio, fin = instantes_del_mes(y, m)
    libro = libro_iva(periodo)
    actual = next((f for f in libro if f['mes'] == periodo), {'mes': periodo, 'debito': 0, 'credito': 0, 'saldo': 0, 'remanente_anterior': libro[-1]['remanente_final'] if libro else 0,
                                                              'a_pagar': 0, 'remanente_final': libro[-1]['remanente_final'] if libro else 0})

    ventas = [{'folio': f.folio_sii, 'fecha': timezone.localtime(f.emitido_en).date().isoformat(), 'cliente': f.receptor_razon_social, 'rut': f.receptor_rut,
               'obra': f.orden_id, 'neto': f.monto_neto, 'iva': f.monto_iva, 'total': f.monto_total}
              for f in FacturaDTE.objects.filter(estado_sii=FacturaDTE.EstadoSII.ACEPTADO, emitido_en__gte=inicio, emitido_en__lt=fin).order_by('emitido_en')[:LIMITE_DOCUMENTOS]]
    prov = _nombres('proveedores', 'razon_social')
    compras = []
    for r in _en_rango(_tabla('facturas'), 'fecha', desde, hasta).order_by('rid').values('rid', 'datos')[:LIMITE_DOCUMENTOS]:
        d = r['datos']
        nombre, rut = prov.get(d.get('proveedor_id'), (d.get('proveedor_id', ''), ''))
        compras.append({'id': r['rid'], 'numero': d.get('numero', ''), 'fecha': d.get('fecha', ''), 'proveedor': nombre, 'rut': rut,
                        'neto': round(_num(d.get('neto'))), 'iva': round(_num(d.get('iva'))), 'total': round(_num(d.get('total')) or _num(d.get('neto')) + _num(d.get('iva')))})
    compras.sort(key=lambda x: (x['fecha'], x['id']))
    numeros = {r['rid']: r['datos'].get('numero', '') for r in _tabla('facturas').values('rid', 'datos')}
    notas = [{'id': r['rid'], 'numero': r['datos'].get('numero', ''), 'factura': numeros.get(r['datos'].get('factura_id'), ''), 'fecha': r['datos'].get('fecha', ''),
              'motivo': r['datos'].get('motivo', ''), 'neto': round(_num(r['datos'].get('neto'))), 'iva': round(_num(r['datos'].get('iva')))}
             for r in _en_rango(_tabla('notas_credito'), 'fecha', desde, hasta).order_by('rid').values('rid', 'datos')]

    resumen = resumen_tributario(periodo)
    return {'periodo': periodo, 'tasa_iva': TASA_IVA,
            'iva': {'debito': actual['debito'], 'credito': actual['credito'], 'saldo': actual['saldo'], 'remanente_anterior': actual['remanente_anterior'],
                    'a_pagar': actual['a_pagar'], 'remanente_siguiente': actual['remanente_final'],
                    'situacion': 'A_PAGAR' if actual['a_pagar'] > 0 else 'REMANENTE' if actual['remanente_final'] > 0 else 'SIN_SALDO'},
            'ventas': {'documentos': ventas, 'neto': resumen['ventas']['neto'], 'iva': resumen['ventas']['iva']},
            'compras': {'documentos': compras, 'notas_credito': notas, 'neto': resumen['compras']['neto'], 'iva': resumen['compras']['iva']},
            'ganancia_neta': resumen['ganancia_neta'], 'historial': libro[-12:]}
