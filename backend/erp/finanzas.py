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
