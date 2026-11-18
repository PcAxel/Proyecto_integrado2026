"""PowerPoint de finanzas del mes: Ingresos, Gastos e Impuestos con gráficos nativos (editables en PowerPoint).
Recibe el diccionario de `finanzas.impuestos_del_mes()`: todas las cifras las calculó el servidor."""
from datetime import datetime
from io import BytesIO

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION
from pptx.util import Inches, Pt

from .informe_pptx import AZUL, BLANCO, DURAZNO, FONDO, HIELO, PROFUNDO, SUAVE, _fondo, _pie, _rect, _tarjeta, _texto, _titulo, millones

VERDE = RGBColor(0x5B, 0x8D, 0x5E)
ROJO = RGBColor(0xD9, 0x5D, 0x4F)
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']


def nombre_mes(periodo):
    return f'{MESES[int(periodo[5:7]) - 1]} de {periodo[:4]}'


def _formato_grafico(graf):
    graf.font.size, graf.font.name = Pt(11), 'Calibri'
    graf.has_legend, graf.legend.position, graf.legend.include_in_layout = True, XL_LEGEND_POSITION.BOTTOM, False
    graf.value_axis.has_major_gridlines = True
    graf.value_axis.major_gridlines.format.line.color.rgb = RGBColor(0xDD, 0xE3, 0xEA)
    graf.value_axis.tick_labels.number_format, graf.value_axis.tick_labels.number_format_is_linked = '0.0', False
    pl = graf.plots[0]
    pl.gap_width, pl.has_data_labels = 70, True
    pl.data_labels.number_format, pl.data_labels.number_format_is_linked, pl.data_labels.font.size = '0.0', False, Pt(10)
    pl.data_labels.position = XL_LABEL_POSITION.OUTSIDE_END


def generar_pptx_finanzas(d, generado_por='', ahora=None):
    ahora = ahora or datetime.now()
    fecha = ahora.strftime('%d-%m-%Y')
    mes = nombre_mes(d['periodo'])
    iva, v, c = d['iva'], d['ventas'], d['compras']
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    W, H = prs.slide_width, prs.slide_height
    vacio = prs.slide_layouts[6]

    # 1 · Portada
    s = prs.slides.add_slide(vacio)
    _fondo(s, PROFUNDO)
    _rect(s, 0, 0, Inches(0.35), H, HIELO)
    _texto(s, Inches(1.0), Inches(2.3), Inches(10), Inches(1.2), 'FYAG', 66, BLANCO, True)
    _texto(s, Inches(1.0), Inches(3.5), Inches(11), Inches(0.8), 'Reporte ejecutivo de finanzas', 34, HIELO)
    _texto(s, Inches(1.0), Inches(4.3), Inches(11), Inches(0.5), f'Ingresos, gastos e impuestos · {mes}', 16, RGBColor(0xB8, 0xCC, 0xD8))
    _texto(s, Inches(1.0), H - Inches(1.2), Inches(11), Inches(0.4), f'Emitido el {fecha}' + (f' · {generado_por}' if generado_por else ''), 13, RGBColor(0xB8, 0xCC, 0xD8))
    _texto(s, Inches(1.0), H - Inches(0.8), Inches(11), Inches(0.4), 'Frío y Agroindustria SpA', 13, RGBColor(0x8F, 0xA8, 0xB8))

    # 2 · Resumen
    s = prs.slides.add_slide(vacio)
    _fondo(s, FONDO)
    _titulo(s, W, f'Resumen de {mes}', 'Montos netos, calculados por el sistema con las facturas registradas')
    a_pagar = iva['situacion'] == 'A_PAGAR'
    resultado_iva = iva['a_pagar'] if a_pagar else iva['remanente_siguiente']
    ganancia = d['ganancia_neta']
    tarjetas = [
        ('Ingresos netos', millones(v['neto']), f"{len(v['documentos'])} facturas de venta", AZUL),
        ('Gastos netos', millones(c['neto']), f"{len(c['documentos'])} facturas de compra − {len(c['notas_credito'])} nota(s) de crédito", DURAZNO),
        ('Ganancia neta', millones(ganancia), 'Ingresos netos − gastos netos', VERDE if ganancia >= 0 else ROJO),
        ('IVA débito (ventas)', millones(iva['debito']), 'Impuesto cobrado a clientes', AZUL),
        ('IVA crédito (compras)', millones(iva['credito']), f"Remanente anterior: {millones(iva['remanente_anterior'])}", AZUL),
        ('IVA a pagar' if a_pagar else 'Remanente a favor', millones(resultado_iva), 'Se paga en el F29 del mes siguiente' if a_pagar else 'Se arrastra al mes siguiente', ROJO if a_pagar else VERDE),
    ]
    ancho, alto, x0, y0, sep = Inches(3.9), Inches(1.9), Inches(0.6), Inches(1.75), Inches(0.25)
    for i, (et, val, nota, acento) in enumerate(tarjetas):
        _tarjeta(s, x0 + (ancho + sep) * (i % 3), y0 + (alto + sep) * (i // 3), ancho, alto, et, val, nota, acento)
    _pie(s, W, H, 2, fecha)

    # 3 · Barras: Ingresos vs Gastos vs Impuestos del mes
    s = prs.slides.add_slide(vacio)
    _fondo(s, FONDO)
    _titulo(s, W, 'Ingresos, gastos e impuestos del mes', f'{mes} · millones de CLP')
    datos = CategoryChartData()
    datos.categories = ['Ingresos (ventas)', 'Gastos (compras)']
    datos.add_series('Neto', [round(v['neto'] / 1_000_000, 2), round(c['neto'] / 1_000_000, 2)])
    datos.add_series('IVA', [round(iva['debito'] / 1_000_000, 2), round(iva['credito'] / 1_000_000, 2)])
    graf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.6), Inches(1.6), Inches(8.2), Inches(5.1), datos).chart
    _formato_grafico(graf)
    for serie, color in zip(graf.series, (AZUL, DURAZNO)):
        serie.format.fill.solid()
        serie.format.fill.fore_color.rgb = color
    _texto(s, Inches(9.2), Inches(1.7), Inches(3.6), Inches(0.4), 'Cómo se lee', 14, PROFUNDO, True)
    lectura = [f'Ganancia neta: {millones(ganancia)}.',
               f"IVA ventas {millones(iva['debito'])} − IVA compras {millones(iva['credito'])} − remanente anterior {millones(iva['remanente_anterior'])}.",
               ('IVA a pagar: ' if a_pagar else 'Remanente a favor: ') + millones(resultado_iva) + '.',
               'Proyección con lo registrado hoy; no reemplaza el F29.']
    caja = s.shapes.add_textbox(Inches(9.2), Inches(2.2), Inches(3.6), Inches(4.2))
    caja.text_frame.word_wrap = True
    for i, linea in enumerate(lectura):
        p = caja.text_frame.paragraphs[0] if i == 0 else caja.text_frame.add_paragraph()
        p.space_after = Pt(10)
        r = p.add_run()
        r.text = linea
        r.font.size, r.font.name = Pt(13), 'Calibri'
        r.font.color.rgb = SUAVE if i == len(lectura) - 1 else PROFUNDO
    _pie(s, W, H, 3, fecha)

    # 4 · Evolución del IVA mes a mes
    s = prs.slides.add_slide(vacio)
    _fondo(s, FONDO)
    historial = d['historial'][-6:]
    _titulo(s, W, 'Evolución del IVA', 'IVA de ventas, IVA de compras y remanente que se arrastra · últimos meses · millones de CLP')
    if historial:
        datos = CategoryChartData()
        datos.categories = [f"{MESES[int(h['mes'][5:7]) - 1][:3]} {h['mes'][2:4]}" for h in historial]
        datos.add_series('IVA ventas', [round(h['debito'] / 1_000_000, 2) for h in historial])
        datos.add_series('IVA compras', [round(h['credito'] / 1_000_000, 2) for h in historial])
        datos.add_series('Remanente final', [round(h['remanente_final'] / 1_000_000, 2) for h in historial])
        graf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.6), Inches(1.6), Inches(12.1), Inches(5.1), datos).chart
        _formato_grafico(graf)
        for serie, color in zip(graf.series, (AZUL, DURAZNO, VERDE)):
            serie.format.fill.solid()
            serie.format.fill.fore_color.rgb = color
    else:
        _texto(s, Inches(0.6), Inches(3), Inches(12), Inches(1), 'Aún no hay movimientos de IVA registrados.', 20, SUAVE)
    _pie(s, W, H, 4, fecha)

    salida = BytesIO()
    prs.save(salida)
    return salida.getvalue()
