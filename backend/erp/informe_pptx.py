"""Presentación ejecutiva en PowerPoint con gráficos nativos (editables en PowerPoint). Recibe el diccionario de `informes.informe_ejecutivo()`."""
from datetime import datetime
from io import BytesIO

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

PROFUNDO = RGBColor(0x0B, 0x2A, 0x3C)
AZUL = RGBColor(0x1F, 0x58, 0x78)
HIELO = RGBColor(0x7D, 0xE3, 0xF4)
DURAZNO = RGBColor(0xF0, 0xA0, 0x30)
TINTA = RGBColor(0x1E, 0x29, 0x3B)
SUAVE = RGBColor(0x64, 0x74, 0x8B)
FONDO = RGBColor(0xF4, 0xF7, 0xFA)
BLANCO = RGBColor(0xFF, 0xFF, 0xFF)
PALETA = [RGBColor(0x1F, 0x58, 0x78), RGBColor(0x2A, 0x9D, 0xB5), RGBColor(0xF0, 0xA0, 0x30), RGBColor(0x5B, 0x8D, 0x5E),
          RGBColor(0x8C, 0x6B, 0xB1), RGBColor(0xD9, 0x5D, 0x4F), RGBColor(0x94, 0xA3, 0xB8)]
TIPO = 'Calibri'


def clp(n):
    return '$' + f'{round(n):,}'.replace(',', '.')


def millones(n):
    return f'${n / 1_000_000:,.1f} M'.replace(',', 'X').replace('.', ',').replace('X', '.')


def _texto(slide, x, y, w, h, texto, tam, color=TINTA, negrita=False, alinea=PP_ALIGN.LEFT):
    caja = slide.shapes.add_textbox(x, y, w, h)
    tf = caja.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = alinea
    r = p.add_run()
    r.text = texto
    r.font.size, r.font.bold, r.font.name = Pt(tam), negrita, TIPO
    r.font.color.rgb = color
    return caja


def _fondo(slide, color):
    f = slide.background.fill
    f.solid()
    f.fore_color.rgb = color


def _rect(slide, x, y, w, h, color, forma=MSO_SHAPE.RECTANGLE):
    s = slide.shapes.add_shape(forma, x, y, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    s.line.fill.background()
    s.shadow.inherit = False
    return s


def _titulo(slide, ancho, titulo, subtitulo):
    _rect(slide, 0, 0, ancho, Inches(0.12), AZUL)
    _texto(slide, Inches(0.6), Inches(0.4), ancho - Inches(1.2), Inches(0.7), titulo, 28, PROFUNDO, True)
    _texto(slide, Inches(0.6), Inches(1.05), ancho - Inches(1.2), Inches(0.4), subtitulo, 14, SUAVE)


def _pie(slide, ancho, alto, pagina, generado):
    _texto(slide, Inches(0.6), alto - Inches(0.5), Inches(8), Inches(0.3), f'FYAG · Informe ejecutivo · {generado}', 10, SUAVE)
    _texto(slide, ancho - Inches(1.6), alto - Inches(0.5), Inches(1), Inches(0.3), str(pagina), 10, SUAVE, alinea=PP_ALIGN.RIGHT)


def _tarjeta(slide, x, y, w, h, etiqueta, valor, nota, acento=AZUL):
    _rect(slide, x, y, w, h, BLANCO, MSO_SHAPE.ROUNDED_RECTANGLE).adjustments[0] = 0.06
    _rect(slide, x, y + Inches(0.18), Inches(0.07), h - Inches(0.36), acento)
    _texto(slide, x + Inches(0.25), y + Inches(0.15), w - Inches(0.4), Inches(0.3), etiqueta.upper(), 11, SUAVE, True)
    _texto(slide, x + Inches(0.25), y + Inches(0.5), w - Inches(0.4), Inches(0.7), valor, 28, PROFUNDO, True)
    _texto(slide, x + Inches(0.25), y + h - Inches(0.55), w - Inches(0.4), Inches(0.45), nota, 11, SUAVE)


def _leyenda_y_formato(chart, tam=11):
    chart.font.size, chart.font.name = Pt(tam), TIPO
    chart.font.color.rgb = TINTA


def _fmt(dia):
    return f'{dia[8:10]}-{dia[5:7]}-{dia[:4]}'


def etiqueta_periodo(periodo):
    desde, hasta = (periodo or {}).get('desde'), (periodo or {}).get('hasta')
    if desde and hasta:
        return f'Periodo del {_fmt(desde)} al {_fmt(hasta)}'
    if desde:
        return f'Periodo desde el {_fmt(desde)}'
    if hasta:
        return f'Periodo hasta el {_fmt(hasta)}'
    return 'Todo el historial'


def generar_pptx(d, generado_por='', ahora=None):
    ahora = ahora or datetime.now()
    fecha = ahora.strftime('%d-%m-%Y')
    periodo = etiqueta_periodo(d.get('periodo'))
    acotado = bool((d.get('periodo') or {}).get('desde') or (d.get('periodo') or {}).get('hasta'))
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    W, H = prs.slide_width, prs.slide_height
    vacio = prs.slide_layouts[6]

    # 1 · Portada
    s = prs.slides.add_slide(vacio)
    _fondo(s, PROFUNDO)
    _rect(s, 0, 0, Inches(0.35), H, HIELO)
    _texto(s, Inches(1.0), Inches(2.3), Inches(10), Inches(1.2), 'FYAG', 66, BLANCO, True)
    _texto(s, Inches(1.0), Inches(3.5), Inches(11), Inches(0.8), 'Informe ejecutivo de gestión', 34, HIELO)
    _texto(s, Inches(1.0), Inches(4.3), Inches(11), Inches(0.5), f'{periodo} · cifras calculadas desde el ERP', 16, RGBColor(0xB8, 0xCC, 0xD8))
    _texto(s, Inches(1.0), H - Inches(1.2), Inches(11), Inches(0.4), f'Emitido el {fecha}' + (f' · {generado_por}' if generado_por else ''), 13, RGBColor(0xB8, 0xCC, 0xD8))
    _texto(s, Inches(1.0), H - Inches(0.8), Inches(11), Inches(0.4), 'Frío y Agroindustria SpA', 13, RGBColor(0x8F, 0xA8, 0xB8))

    # 2 · Resumen ejecutivo
    c, inv, r, ej = d['compras'], d['inventario'], d['rentabilidad'], d['ejecucion_materiales']
    s = prs.slides.add_slide(vacio)
    _fondo(s, FONDO)
    _titulo(s, W, 'Resumen ejecutivo', f'{periodo} · cifras calculadas desde los registros del ERP')
    ancho, alto, x0, y0, sep = Inches(3.9), Inches(1.9), Inches(0.6), Inches(1.75), Inches(0.25)
    tarjetas = [
        ('Gasto en compras', millones(c['total']), f"{c['facturas']} facturas · neto", AZUL),
        ('Promedio por factura', millones(c['promedio']), 'Gasto neto promedio por factura de compra', AZUL),
        ('Dinero inmovilizado en bodega', millones(inv['total']), f"{inv['articulos_con_stock']} artículos · {inv['unidades']:,} unidades".replace(',', '.'), DURAZNO),
        ('Venta aprobada', millones(r['venta']), f"{r['aprobados']} presupuestos aprobados", AZUL),
        ('Margen ponderado', f"{r['margen_ponderado']:.1f}%".replace('.', ','), f"Utilidad cotizada {millones(r['utilidad'])} · margen simple {r['margen_promedio']:.1f}%".replace('.', ','), RGBColor(0x5B, 0x8D, 0x5E)),
        ('Materiales ejecutados', f"{ej['ejecucion_pct']:.1f}%".replace('.', ','), f"{millones(ej['real'])} de {millones(ej['presupuesto'])} presupuestados (obras del gráfico)", AZUL),
    ]
    for i, (et, val, nota, acento) in enumerate(tarjetas):
        _tarjeta(s, x0 + (ancho + sep) * (i % 3), y0 + (alto + sep) * (i // 3), ancho, alto, et, val, nota, acento)
    _pie(s, W, H, 2, fecha)

    # 3 · Barras: presupuesto vs real por obra
    s = prs.slides.add_slide(vacio)
    _fondo(s, FONDO)
    _titulo(s, W, 'Presupuesto vs. gasto real por obra', (f'{periodo}: obras con consumo de material en el periodo; presupuesto total de materiales vs gasto del periodo (millones de CLP)' if acotado
                                else 'Materiales presupuestados frente al costo real de lo retirado de bodega (millones de CLP)'))
    obras = d['obras']
    if obras:
        datos = CategoryChartData()
        datos.categories = [o['obra'] for o in obras]
        datos.add_series('Presupuesto', [round(o['presupuesto'] / 1_000_000, 2) for o in obras])
        datos.add_series('Gasto real', [round(o['real'] / 1_000_000, 2) for o in obras])
        graf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.6), Inches(1.6), Inches(8.6), Inches(5.1), datos).chart
        _leyenda_y_formato(graf)
        graf.has_legend, graf.legend.position, graf.legend.include_in_layout = True, XL_LEGEND_POSITION.BOTTOM, False
        graf.value_axis.has_major_gridlines = True
        graf.value_axis.major_gridlines.format.line.color.rgb = RGBColor(0xDD, 0xE3, 0xEA)
        graf.value_axis.tick_labels.number_format, graf.value_axis.tick_labels.number_format_is_linked = '0.0', False
        graf.plots[0].gap_width, graf.plots[0].overlap = 60, -10
        for serie, color in zip(graf.series, (AZUL, DURAZNO)):
            serie.format.fill.solid()
            serie.format.fill.fore_color.rgb = color
        pl = graf.plots[0]
        pl.has_data_labels = True
        pl.data_labels.number_format, pl.data_labels.number_format_is_linked, pl.data_labels.font.size = '0.0', False, Pt(9)
        pl.data_labels.position = XL_LABEL_POSITION.OUTSIDE_END
        _texto(s, Inches(9.5), Inches(1.7), Inches(3.3), Inches(0.4), 'Obras del gráfico', 14, PROFUNDO, True)
        caja = s.shapes.add_textbox(Inches(9.5), Inches(2.15), Inches(3.3), Inches(4.4))
        caja.text_frame.word_wrap = True
        for i, o in enumerate(obras):
            p = caja.text_frame.paragraphs[0] if i == 0 else caja.text_frame.add_paragraph()
            p.space_after = Pt(6)
            a = p.add_run()
            a.text = f"{o['obra']}  "
            a.font.bold, a.font.size, a.font.name, a.font.color.rgb = True, Pt(11), TIPO, AZUL
            b = p.add_run()
            b.text = (o['nombre'][:46] + '…') if len(o['nombre']) > 47 else o['nombre']
            b.font.size, b.font.name, b.font.color.rgb = Pt(11), TIPO, TINTA
    else:
        _texto(s, Inches(0.6), Inches(3), Inches(12), Inches(1), 'Aún no hay obras con presupuesto para comparar.', 20, SUAVE)
    _pie(s, W, H, 3, fecha)

    # 4 · Circular: valor del inventario por categoría
    s = prs.slides.add_slide(vacio)
    _fondo(s, FONDO)
    _titulo(s, W, 'Dinero inmovilizado en bodega por categoría', f"Valor del stock a su último costo{' al cierre de ' + _fmt(d['periodo']['hasta']) if (d.get('periodo') or {}).get('hasta') else ''} · total {millones(inv['total'])}")
    cats = inv['por_categoria']
    if cats:
        principales, resto = cats[:6], sum(v for _, v in cats[6:])
        filas = principales + ([('Otras categorías', resto)] if resto else [])
        datos = CategoryChartData()
        datos.categories = [k for k, _ in filas]
        datos.add_series('Valor del inventario', [round(v / 1_000_000, 2) for _, v in filas])
        graf = s.shapes.add_chart(XL_CHART_TYPE.PIE, Inches(0.6), Inches(1.6), Inches(7.4), Inches(5.1), datos).chart
        _leyenda_y_formato(graf)
        graf.has_legend, graf.legend.position, graf.legend.include_in_layout = True, XL_LEGEND_POSITION.RIGHT, False
        pl = graf.plots[0]
        pl.has_data_labels = True
        pl.data_labels.show_percentage, pl.data_labels.show_value = True, False
        pl.data_labels.number_format, pl.data_labels.number_format_is_linked, pl.data_labels.font.size = '0%', False, Pt(11)
        pl.data_labels.font.color.rgb, pl.data_labels.font.bold = BLANCO, True
        for i in range(len(filas)):
            pt = pl.series[0].points[i]
            pt.format.fill.solid()
            pt.format.fill.fore_color.rgb = PALETA[i % len(PALETA)]
        _texto(s, Inches(8.4), Inches(1.7), Inches(4.4), Inches(0.4), 'Detalle (millones de CLP)', 14, PROFUNDO, True)
        caja = s.shapes.add_textbox(Inches(8.4), Inches(2.2), Inches(4.4), Inches(4.4))
        caja.text_frame.word_wrap = True
        for i, (k, v) in enumerate(filas):
            p = caja.text_frame.paragraphs[0] if i == 0 else caja.text_frame.add_paragraph()
            p.space_after = Pt(8)
            a = p.add_run()
            a.text = '■ '
            a.font.size, a.font.color.rgb = Pt(12), PALETA[i % len(PALETA)]
            b = p.add_run()
            b.text = f'{k}: {millones(v)}'
            b.font.size, b.font.name, b.font.color.rgb = Pt(12), TIPO, TINTA
    else:
        _texto(s, Inches(0.6), Inches(3), Inches(12), Inches(1), 'No hay stock valorizado en bodega.', 20, SUAVE)
    _pie(s, W, H, 4, fecha)

    salida = BytesIO()
    prs.save(salida)
    return salida.getvalue()
