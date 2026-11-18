"""Reporte financiero mensual como `Conjunto` para Excel y Word (el PowerPoint tiene su propio generador con gráficos nativos).
Las cifras son las de `erp.finanzas.impuestos_del_mes`: las calcula el servidor con los permisos del usuario."""
from erp import finanzas
from erp.informe_finanzas_pptx import nombre_mes

from .datos import Conjunto


def conjunto_finanzas(mes=None):
    d = finanzas.impuestos_del_mes(mes)
    iva, v, c = d['iva'], d['ventas'], d['compras']
    a_pagar = iva['situacion'] == 'A_PAGAR'
    resumen = [
        ('Ingresos netos (facturas de venta)', v['neto'], 'clp'), ('Gastos netos (compras − notas de crédito)', c['neto'], 'clp'), ('Ganancia neta', d['ganancia_neta'], 'clp'),
        ('IVA débito (ventas)', iva['debito'], 'clp'), ('IVA crédito (compras)', iva['credito'], 'clp'), ('Remanente del mes anterior', iva['remanente_anterior'], 'clp'),
        ('IVA a pagar' if a_pagar else 'Remanente a favor', iva['a_pagar'] if a_pagar else iva['remanente_siguiente'], 'clp'),
    ]
    filas = [{'mes': h['mes'], 'debito': h['debito'], 'credito': h['credito'], 'rem_ant': h['remanente_anterior'], 'a_pagar': h['a_pagar'], 'rem_fin': h['remanente_final']}
             for h in d['historial']]
    return Conjunto('finanzas_mensual', f'Reporte financiero · {nombre_mes(d["periodo"])}',
                    [('mes', 'Mes', 'texto'), ('debito', 'IVA ventas', 'clp'), ('credito', 'IVA compras', 'clp'), ('rem_ant', 'Remanente anterior', 'clp'),
                     ('a_pagar', 'IVA a pagar', 'clp'), ('rem_fin', 'Remanente final', 'clp')],
                    filas, resumen, periodo=nombre_mes(d['periodo']), periodo_slug=d['periodo'], subtitulo='Ingresos, gastos e impuestos (IVA) del mes · montos en pesos',
                    totales=False, nota='Proyección con los documentos registrados hasta hoy; no reemplaza la declaración F29. Remanente en pesos nominales, sin reajuste.',
                    grafico={'titulo': 'IVA de ventas y de compras por mes', 'categoria': 'mes', 'eje_y': 'pesos',
                             'series': [{'nombre': 'IVA ventas', 'columna': 'debito', 'color': '1F5878'}, {'nombre': 'IVA compras', 'columna': 'credito', 'color': 'F0A030'}]})
