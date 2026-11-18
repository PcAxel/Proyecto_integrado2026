"""Generadores de archivos: toman un `Conjunto` ya extraído y escriben el .xlsx, .docx o .pptx en un directorio privado.

Los archivos NO quedan en una carpeta pública: viven en `settings.REPORTES_IA_DIR/<id de usuario>/<token>.<ext>` y solo se
entregan por una vista autenticada que comprueba que el archivo es de quien lo pide. Los vencidos se borran solos."""
import re
import secrets
import time
from datetime import date, datetime
from pathlib import Path

from django.conf import settings
from django.utils import timezone

FORMATOS = {
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
MAX_FILAS = {'xlsx': 5000, 'docx': 1000, 'pptx': 100}
FILAS_POR_DIAPOSITIVA = 10
TOKEN_RE = re.compile(r'^[0-9a-f]{32}$')


def _clp(v):
    return '$' + f'{int(round(v)):,}'.replace(',', '.') if isinstance(v, (int, float)) else (v or '—')


def _fecha(v):
    try:
        return (v if isinstance(v, date) else datetime.strptime(str(v)[:10], '%Y-%m-%d')).strftime('%d-%m-%Y')
    except ValueError:
        return str(v)


PESOS, NUMERICOS = ('clp', 'clpu'), ('clp', 'clpu', 'num')  # 'clp' se suma en la fila de totales; 'clpu' (costo unitario) es pesos pero no se suma


def _texto(v, tipo):
    """Valor tal como se imprime en Word y PowerPoint."""
    if v is None or v == '':
        return '—'
    if tipo in PESOS:
        return _clp(v)
    if tipo == 'fecha':
        return _fecha(v)
    if tipo == 'num':
        if isinstance(v, float) and v == int(v):
            v = int(v)
        return f'{v:,}'.replace(',', '.') if isinstance(v, (int, float)) else str(v)
    return str(v)


def _subtitulo(c):
    return c.subtitulo or (c.periodo.capitalize() if c.periodo else 'Todos los registros')


def _pie(usuario):
    return f'Generado el {timezone.localtime().strftime("%d-%m-%Y %H:%M")} por {usuario.full_name or usuario.email} · FYAG'


def _filas_a_incluir(conjunto, formato):
    tope = MAX_FILAS[formato]
    return conjunto.filas[:tope], max(0, len(conjunto.filas) - tope)


# ───────────────────────── Excel ─────────────────────────
MARINO, TEAL, CLARO = '0B2A3F', '2E6F73', 'E6EEF1'


def _titulo_hoja(texto):
    return re.sub(r'[\[\]:*?/\\]', ' ', texto)[:31]


def _montos(conjunto):
    """Columnas con montos en pesos (las que se suman en la fila de totales)."""
    return [i for i, (_, _, tipo) in enumerate(conjunto.columnas) if tipo == 'clp']


def _totales(conjunto, filas):
    return {clave: sum(r.get(clave) or 0 for r in filas if isinstance(r.get(clave), (int, float))) for clave, _, tipo in conjunto.columnas if tipo == 'clp'}


def _grafico_xlsx(ws, c, cab, ini, fin, n):
    """Gráfico NATIVO de líneas de Excel sobre las mismas filas de la tabla (cambia si se edita la tabla)."""
    from openpyxl.chart import LineChart, Reference
    from openpyxl.utils import get_column_letter
    g, claves = c.grafico, [k for k, _, _ in c.columnas]
    ch = LineChart()
    ch.title, ch.height, ch.width = g['titulo'], 9.5, 22
    ch.y_axis.title, ch.y_axis.number_format = g.get('eje_y', ''), '#,##0'
    ch.x_axis.number_format = 'dd-mm'
    ch.x_axis.delete = ch.y_axis.delete = False  # sin esto algunos Excel no dibujan los ejes
    ch.legend.position = 'b'
    for s in g['series']:
        col = claves.index(s['columna']) + 1
        ch.add_data(Reference(ws, min_col=col, min_row=cab, max_row=fin), titles_from_data=True)
    ch.set_categories(Reference(ws, min_col=claves.index(g['categoria']) + 1, min_row=ini, max_row=fin))
    for serie, s in zip(ch.series, g['series']):
        serie.graphicalProperties.line.solidFill, serie.graphicalProperties.line.width, serie.smooth = s['color'], 28575, False
        if s.get('punteada'):
            serie.graphicalProperties.line.dashStyle = 'dash'
    ch.display_blanks = 'gap'  # los días sin dato (real o proyectado) quedan en blanco, sin unir con cero
    ws.add_chart(ch, f'{get_column_letter(n + 2)}{cab}')


def _fijar_valores(ruta, valores):
    """openpyxl escribe las fórmulas sin su resultado: Excel las calcula al abrir, pero los visores que no calculan (vista previa de macOS, algunos
    navegadores de archivos) mostrarían $0. Aquí se guarda dentro de cada fórmula el valor ya calculado en Python (Excel lo recalcula igual)."""
    import shutil
    import zipfile
    tmp = f'{ruta}.tmp'
    with zipfile.ZipFile(ruta) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            datos = zin.read(item.filename)
            if item.filename == 'xl/worksheets/sheet1.xml':
                xml = datos.decode('utf-8')
                for celda, valor in valores.items():
                    xml = re.sub(rf'(<c r="{celda}"[^>]*><f>[^<]*</f>)<v\s*/?>(?:</v>)?', rf'\g<1><v>{valor}</v>', xml)
                datos = xml.encode('utf-8')
            zout.writestr(item, datos)
    shutil.move(tmp, ruta)


def _xlsx(ruta, conjunto, usuario):
    """Libro corporativo: membrete, resumen, TABLA NATIVA de Excel (filtros y orden), encabezados en negrita, anchos automáticos,
    fila final con la suma de los montos (SUBTOTAL: respeta los filtros) y configuración de impresión."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.table import Table, TableStyleInfo

    wb = Workbook()
    ws = wb.active
    ws.title = _titulo_hoja(conjunto.titulo)
    ws.sheet_properties.tabColor = MARINO
    wb.properties.creator, wb.properties.title = 'FYAG ERP', conjunto.titulo
    ws['A1'] = 'FYAG · Frío y Agroindustria SpA'
    ws['A1'].font = Font(bold=True, size=11, color=TEAL)
    ws['A2'] = conjunto.titulo
    ws['A2'].font = Font(bold=True, size=16, color=MARINO)
    ws['A3'] = f'{_subtitulo(conjunto)} · {_pie(usuario)}'
    ws['A3'].font = Font(italic=True, size=9, color='666666')
    fila = 5
    for etiqueta, valor, tipo in conjunto.resumen:
        ws.cell(fila, 1, etiqueta).font = Font(bold=True, color=MARINO)
        c = ws.cell(fila, 2, valor)
        c.alignment = Alignment(horizontal='left')
        if isinstance(valor, (int, float)):
            c.number_format = '"$"#,##0' if tipo in PESOS else '#,##0'
        fila += 1
    cab = fila + 1
    n = len(conjunto.columnas)
    borde = Border(top=Side(style='medium', color=MARINO), bottom=Side(style='double', color=MARINO))
    for j, (_, etiqueta, _) in enumerate(conjunto.columnas, 1):
        c = ws.cell(cab, j, etiqueta)
        c.font, c.fill = Font(bold=True, color='FFFFFF'), PatternFill('solid', fgColor=MARINO)
        c.alignment = Alignment(vertical='center', wrap_text=True)
    filas, _ = _filas_a_incluir(conjunto, 'xlsx')
    cache = {}  # celda → valor calculado de cada fórmula de totales
    ini = cab + 1
    for i, r in enumerate(filas, ini):
        for j, (clave, _, tipo) in enumerate(conjunto.columnas, 1):
            v = r.get(clave)
            c = ws.cell(i, j)
            if tipo == 'fecha' and v:
                try:
                    c.value, c.number_format = datetime.strptime(str(v)[:10], '%Y-%m-%d'), 'dd-mm-yyyy'
                except ValueError:
                    c.value = str(v)
            elif tipo in NUMERICOS and isinstance(v, (int, float)):
                c.value, c.number_format = v, '"$"#,##0' if tipo in PESOS else '#,##0'
            else:
                c.value = '' if v is None else str(v)
                # Un texto que empieza por = + - @ lo interpretaría Excel como fórmula: se fuerza a texto (inyección de fórmulas).
                if c.value[:1] in ('=', '+', '-', '@'):
                    c.data_type = 's'
    fin = ini + len(filas) - 1
    totales = _totales(conjunto, filas)
    if filas:
        tabla = Table(displayName='Reporte', ref=f'A{cab}:{get_column_letter(n)}{fin}')
        tabla.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2', showRowStripes=True, showColumnStripes=False)
        ws.add_table(tabla)
        # Fila de totales justo debajo de la tabla. SUBTOTAL(109) suma solo lo visible: si se filtra la tabla, el total acompaña.
        fT = fin + 1
        for j, (clave, _, tipo) in enumerate(conjunto.columnas if conjunto.totales else [], 1):
            c = ws.cell(fT, j)
            c.font, c.fill, c.border = Font(bold=True, color=MARINO), PatternFill('solid', fgColor=CLARO), borde
            if j == 1:
                c.value = 'TOTAL'
            elif tipo == 'clp':
                col = get_column_letter(j)
                c.value, c.number_format = f'=SUBTOTAL(109,{col}{ini}:{col}{fin})', '"$"#,##0'
                cache[f'{col}{fT}'] = round(totales[clave])
    siguiente = fin + (3 if conjunto.totales else 2)
    if conjunto.nota:
        ws.cell(siguiente, 1, conjunto.nota).font = Font(italic=True, size=9, color='666666')
        siguiente += 2
    if conjunto.firmas:  # espacio para firmar: una línea por firma, con su rol debajo
        linea = Side(style='thin', color=MARINO)
        for k, rol in enumerate(conjunto.firmas):
            col = 1 + k * 3 if n >= 3 * len(conjunto.firmas) else 1 + k * 2
            for dc in (0, 1):
                ws.cell(siguiente + 2, col + dc).border = Border(bottom=linea)
            ws.cell(siguiente + 3, col, rol).font = Font(bold=True, color=MARINO)
            ws.cell(siguiente + 4, col, 'Nombre, firma y fecha').font = Font(size=8, color='666666')
    if conjunto.grafico and filas:
        _grafico_xlsx(ws, conjunto, cab, ini, fin, n)
    # Anchos automáticos según el contenido (con tope), incluida la fila de totales.
    for j, (clave, etiqueta, tipo) in enumerate(conjunto.columnas, 1):
        largo = max([len(etiqueta) + 3] + [len(_texto(r.get(clave), tipo)) for r in filas[:300]] + ([len(_texto(totales[clave], 'clp'))] if clave in totales else []))
        if j == 1:  # la columna A también lleva los rótulos del resumen sobre la tabla
            largo = max([largo] + [len(e) + 1 for e, _, _ in conjunto.resumen])
        ws.column_dimensions[get_column_letter(j)].width = min(max(largo + 2, 10), 55)
    ws.freeze_panes = ws.cell(ini, 1)
    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = 'landscape' if n > 5 else 'portrait'
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f'{cab}:{cab}'
    ws.oddFooter.center.text = 'FYAG · Página &P de &N'
    wb.save(ruta)
    if cache:
        _fijar_valores(ruta, cache)


# ───────────────────────── Word ─────────────────────────
def _sombrear(celda, hex_):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    tc = celda._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_)
    tc.append(shd)


def _bordes(tabla, color='9FB3BD'):
    """Bordes explícitos en toda la tabla (no dependen de que el programa conozca el estilo «Table Grid»)."""
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    pr = tabla._tbl.tblPr
    b = OxmlElement('w:tblBorders')
    for lado in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement(f'w:{lado}')
        for k, v in (('val', 'single'), ('sz', '6'), ('space', '0'), ('color', color)):
            e.set(qn(f'w:{k}'), v)
        b.append(e)
    pr.append(b)


def _repetir_cabecera(fila):
    """La fila de encabezados se repite al inicio de cada página."""
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    h = OxmlElement('w:tblHeader')
    h.set(qn('w:val'), 'true')
    fila._tr.get_or_add_trPr().append(h)


def _numero_de_pagina(parrafo):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    run = parrafo.add_run()
    for tipo, texto in (('begin', None), (None, 'PAGE'), ('end', None)):
        if tipo:
            e = OxmlElement('w:fldChar')
            e.set(qn('w:fldCharType'), tipo)
        else:
            e = OxmlElement('w:instrText')
            e.set(qn('xml:space'), 'preserve')
            e.text = texto
        run._r.append(e)


def _docx(ruta, conjunto, usuario):
    """Documento corporativo: membrete, título, resumen y una TABLA REAL con bordes, encabezados sombreados y en negrita (se repiten en cada
    página), filas alternadas, montos alineados a la derecha y una fila final de totales."""
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    doc = Document()
    doc.core_properties.author, doc.core_properties.title = 'FYAG ERP', conjunto.titulo
    normal = doc.styles['Normal']
    normal.font.name, normal.font.size = 'Calibri', Pt(10)
    sec = doc.sections[0]
    if len(conjunto.columnas) > 5:  # tablas anchas: hoja apaisada
        sec.orientation = WD_ORIENT.LANDSCAPE
        sec.page_width, sec.page_height = sec.page_height, sec.page_width
    encabezado = sec.header.paragraphs[0]
    r = encabezado.add_run('FYAG · Frío y Agroindustria SpA')
    r.bold, r.font.size, r.font.color.rgb = True, Pt(10), RGBColor.from_string(TEAL)
    pie = sec.footer.paragraphs[0]
    pie.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pie.add_run('FYAG ERP · Página ').font.size = Pt(8)
    _numero_de_pagina(pie)
    h = doc.add_heading(conjunto.titulo, level=1)
    for run in h.runs:
        run.font.color.rgb, run.font.size = RGBColor.from_string(MARINO), Pt(20)
    sub = doc.add_paragraph()
    run = sub.add_run(f'{_subtitulo(conjunto)} · {_pie(usuario)}')
    run.italic, run.font.size, run.font.color.rgb = True, Pt(9), RGBColor(0x66, 0x66, 0x66)
    for etiqueta, valor, tipo in conjunto.resumen:
        if etiqueta == 'Período':
            continue  # ya está en la línea de arriba
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.add_run(f'{etiqueta}: ').bold = True
        p.add_run(_texto(valor, tipo))
    doc.add_paragraph()

    filas, omitidas = _filas_a_incluir(conjunto, 'docx')
    cols = conjunto.columnas
    t = doc.add_table(rows=1, cols=len(cols), style='Table Grid')  # 'Table Grid' = bordes en todas las celdas
    t.alignment = 1
    _bordes(t)
    tam = Pt(8 if len(cols) > 5 else 10)

    def escribir(celda, texto, *, negrita=False, derecha=False, blanco=False):
        par = celda.paragraphs[0]
        par.clear()  # sin runs vacíos previos: el primer run es el texto
        run = par.add_run(texto)
        run.bold, run.font.size = negrita, tam
        if blanco:
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        if derecha:
            par.alignment = WD_ALIGN_PARAGRAPH.RIGHT

    for celda, (_, etiqueta, tipo) in zip(t.rows[0].cells, cols):
        escribir(celda, etiqueta, negrita=True, blanco=True, derecha=tipo in NUMERICOS)
        _sombrear(celda, MARINO)
    _repetir_cabecera(t.rows[0])
    for i, r in enumerate(filas):
        for celda, (clave, _, tipo) in zip(t.add_row().cells, cols):
            escribir(celda, _texto(r.get(clave), tipo), derecha=tipo in NUMERICOS)
            if i % 2:
                _sombrear(celda, 'F2F6F8')
    totales = _totales(conjunto, filas)
    if filas and conjunto.totales:
        fila_t = t.add_row()
        for j, (celda, (clave, _, tipo)) in enumerate(zip(fila_t.cells, cols)):
            escribir(celda, 'TOTAL' if j == 0 else _texto(totales[clave], 'clp') if clave in totales else '', negrita=True, derecha=tipo in NUMERICOS)
            _sombrear(celda, 'DCE6EA')
    if omitidas:
        doc.add_paragraph(f'… y {omitidas} filas más (descarga el Excel para verlas todas). El total solo suma las filas mostradas.')
    if conjunto.nota:
        n = doc.add_paragraph()
        n.paragraph_format.space_before = Pt(6)
        r = n.add_run(conjunto.nota)
        r.italic, r.font.size, r.font.color.rgb = True, Pt(8), RGBColor(0x66, 0x66, 0x66)
    if conjunto.grafico and filas:
        _grafico_word(doc, conjunto)
    if conjunto.firmas:
        _firmas_word(doc, conjunto.firmas)
    doc.save(ruta)


def _firmas_word(doc, firmas):
    """Bloque de firmas: una columna por firma, con espacio para firmar, la línea y el rol debajo."""
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor
    doc.add_paragraph()
    doc.add_paragraph()
    t = doc.add_table(rows=1, cols=len(firmas))
    for celda, rol in zip(t.rows[0].cells, firmas):
        celda.text = ''
        p = celda.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run('\n\n______________________________\n')
        r = p.add_run(rol)
        r.bold, r.font.color.rgb = True, RGBColor.from_string(MARINO)
        p.add_run('\n')
        r2 = p.add_run('Nombre, firma y fecha')
        r2.font.size, r2.font.color.rgb = Pt(8), RGBColor(0x66, 0x66, 0x66)


def _puntos_grafico(c, maximo=14):
    """Categorías y series del gráfico de barras, reducidas a ~14 puntos para que se lean (se conserva siempre el último)."""
    g, filas = c.grafico, c.filas
    paso = max(1, -(-len(filas) // maximo))
    idx = sorted(set(range(0, len(filas), paso)) | {len(filas) - 1})
    cats = [_fecha(filas[i][g['categoria']])[:5] for i in idx]
    series = [(s['nombre'], [filas[i].get(s['columna']) for i in idx], s['color']) for s in g['series']]
    return cats, series


def _grafico_word(doc, c):
    """Gráfico de BARRAS NATIVO de Word (un objeto de gráfico de Office con su hoja de datos incrustada, editable con «Editar datos»).
    python-docx no trae gráficos: se arma el XML con el generador de python-pptx y se agrega como parte del documento."""
    from docx.opc.constants import RELATIONSHIP_TYPE as RT
    from docx.opc.packuri import PackURI
    from docx.opc.part import Part
    from docx.oxml import parse_xml
    from docx.shared import Emu, Pt
    from lxml import etree
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE

    cats, series = _puntos_grafico(c)
    datos = CategoryChartData()
    datos.categories = cats
    for nombre, valores, _ in series:
        datos.add_series(nombre, valores)
    raiz = etree.fromstring(datos.xml_bytes(XL_CHART_TYPE.COLUMN_CLUSTERED))
    ns = {'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
    for ser, (_, _, color) in zip(raiz.iterfind('.//c:ser', ns), series):  # color de cada serie
        sp = etree.fromstring(f'<c:spPr xmlns:c="{ns["c"]}" xmlns:a="{ns["a"]}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill></c:spPr>')
        ser.find('c:tx', ns).addnext(sp)
    paquete = doc.part.package
    n = 1
    while any(str(p.partname) == f'/word/charts/chart{n}.xml' for p in paquete.iter_parts()):
        n += 1
    hoja = Part(PackURI(f'/word/embeddings/Microsoft_Excel_Sheet{n}.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', datos.xlsx_blob, paquete)
    # La parte del gráfico se crea con el XML final; su relación con la hoja de datos se agrega al terminar.
    pieza = Part(PackURI(f'/word/charts/chart{n}.xml'), 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml', b'', paquete)
    rid_hoja = pieza.relate_to(hoja, RT.PACKAGE)
    ext = etree.fromstring(f'<c:externalData xmlns:c="{ns["c"]}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="{rid_hoja}"><c:autoUpdate val="0"/></c:externalData>')
    ultimo = [e for e in raiz if etree.QName(e).localname in ('chart', 'spPr', 'txPr')][-1]
    ultimo.addnext(ext)  # el orden del esquema: ... chart, spPr, txPr, externalData
    pieza._blob = etree.tostring(raiz, xml_declaration=True, encoding='UTF-8', standalone=True)
    rid = doc.part.relate_to(pieza, RT.CHART)
    titulo = doc.add_paragraph()
    r = titulo.add_run(c.grafico['titulo'])
    r.bold, r.font.size = True, Pt(11)
    p = doc.add_paragraph()
    ancho, alto = Emu(5_900_000), Emu(3_100_000)
    dibujo = parse_xml(
        '<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        f'xmlns:a="{ns["a"]}" xmlns:c="{ns["c"]}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{int(ancho)}" cy="{int(alto)}"/><wp:docPr id="{100 + n}" name="Gráfico {n}"/>'
        f'<a:graphic><a:graphicData uri="{ns["c"]}"><c:chart r:id="{rid}"/></a:graphicData></a:graphic></wp:inline></w:drawing>')
    p.add_run()._r.append(dibujo)


# ───────────────────────── PowerPoint ─────────────────────────
def _grafico_pptx(prs, c):
    """Lámina con un gráfico de BARRAS nativo de PowerPoint (editable con «Editar datos»)."""
    from pptx.chart.data import CategoryChartData
    from pptx.dml.color import RGBColor
    from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
    from pptx.util import Inches, Pt
    s = prs.slides.add_slide(prs.slide_layouts[5])
    s.shapes.title.text = c.grafico['titulo']
    s.shapes.title.text_frame.paragraphs[0].font.size = Pt(26)
    cats, series = _puntos_grafico(c)
    datos = CategoryChartData()
    datos.categories = cats
    for nombre, valores, _ in series:
        datos.add_series(nombre, valores)
    ch = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.7), Inches(1.5), Inches(11.9), Inches(5.5), datos).chart
    ch.has_legend, ch.legend.position, ch.legend.include_in_layout = True, XL_LEGEND_POSITION.BOTTOM, False
    ch.value_axis.has_title = True
    ch.value_axis.axis_title.text_frame.text = c.grafico.get('eje_y', '')
    ch.value_axis.tick_labels.number_format, ch.value_axis.tick_labels.number_format_is_linked = '#,##0', False
    for plot_serie, (_, _, color) in zip(ch.plots[0].series, series):
        plot_serie.format.fill.solid()
        plot_serie.format.fill.fore_color.rgb = RGBColor.from_string(color)


def _pptx(ruta, conjunto, usuario):
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.util import Inches, Pt

    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)  # 16:9
    portada = prs.slides.add_slide(prs.slide_layouts[0])
    portada.shapes.title.text = conjunto.titulo
    portada.placeholders[1].text = '\n'.join([f'{e}: {_texto(v, tipo)}' for e, v, tipo in conjunto.resumen] + [_pie(usuario)])
    portada.shapes.title.text_frame.paragraphs[0].font.size = Pt(34)
    for par in portada.placeholders[1].text_frame.paragraphs:  # el texto de la portada es largo: letra chica y alineado a la izquierda
        par.font.size = Pt(15)
        par.alignment = 1
    if conjunto.grafico and conjunto.filas:
        _grafico_pptx(prs, conjunto)
        prs.save(ruta)  # con gráfico, la lámina de datos diarios sobra: el detalle va en Excel
        return
    filas, omitidas = _filas_a_incluir(conjunto, 'pptx')
    n = len(conjunto.columnas)
    for ini in range(0, max(len(filas), 1), FILAS_POR_DIAPOSITIVA):
        s = prs.slides.add_slide(prs.slide_layouts[5])  # título solo
        s.shapes.title.text = conjunto.titulo
        s.shapes.title.text_frame.paragraphs[0].font.size = Pt(28)
        trozo = filas[ini:ini + FILAS_POR_DIAPOSITIVA]
        tabla = s.shapes.add_table(len(trozo) + 1, n, Inches(0.5), Inches(1.6), Inches(12.3), Inches(0.4) * (len(trozo) + 1)).table
        for j, (_, etiqueta, _) in enumerate(conjunto.columnas):
            celda = tabla.cell(0, j)
            celda.text = etiqueta
        for i, r in enumerate(trozo, 1):
            for j, (clave, _, tipo) in enumerate(conjunto.columnas):
                tabla.cell(i, j).text = _texto(r.get(clave), tipo)
        for fila in tabla.rows:
            for celda in fila.cells:
                for par in celda.text_frame.paragraphs:
                    par.font.size = Pt(11 if n <= 6 else 9)
        if ini + FILAS_POR_DIAPOSITIVA >= len(filas) and omitidas:
            pie = s.shapes.add_textbox(Inches(0.5), Inches(6.8), Inches(12), Inches(0.4))
            pie.text_frame.text = f'… y {omitidas} filas más (descarga el Excel para verlas todas).'
            pie.text_frame.paragraphs[0].font.size = Pt(11)
            pie.text_frame.paragraphs[0].font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    prs.save(ruta)


_GENERADORES = {'xlsx': _xlsx, 'docx': _docx, 'pptx': _pptx}


# ───────────────────────── Almacén privado ─────────────────────────
def _carpeta(usuario):
    d = Path(settings.REPORTES_IA_DIR) / str(usuario.pk)
    d.mkdir(parents=True, exist_ok=True)
    return d


def limpiar_vencidos():
    """Borra los archivos con más de `REPORTES_IA_HORAS` horas. Se ejecuta al generar uno nuevo: no hace falta tarea programada."""
    limite = time.time() - settings.REPORTES_IA_HORAS * 3600
    raiz = Path(settings.REPORTES_IA_DIR)
    for f in raiz.glob('*/*') if raiz.exists() else ():
        try:
            if f.is_file() and f.stat().st_mtime < limite:
                f.unlink()
        except OSError:
            pass


def generar(formato, conjunto, usuario):
    """Escribe el archivo y devuelve {token, formato, nombre, filas}. El token es aleatorio (128 bits) y no adivinable."""
    if formato not in _GENERADORES:
        raise ValueError('Formato no soportado.')
    limpiar_vencidos()
    token = secrets.token_hex(16)
    _GENERADORES[formato](_carpeta(usuario) / f'{token}.{formato}', conjunto, usuario)
    base = re.sub(r'[^a-z0-9]+', '_', conjunto.clave.lower()).strip('_')
    periodo = f'_{conjunto.periodo_slug}' if conjunto.periodo_slug else ''
    return {'token': token, 'formato': formato, 'nombre': f'reporte_{base}{periodo}_{date.today():%Y%m%d}.{formato}', 'filas': len(conjunto.filas)}


def ruta_de(usuario, token, formato):
    """Ruta del archivo SOLO si es de este usuario y existe; None en otro caso. Ni el token ni el formato llegan al sistema de archivos sin validar."""
    if not TOKEN_RE.match(token or '') or formato not in FORMATOS:
        return None
    ruta = _carpeta(usuario) / f'{token}.{formato}'
    return ruta if ruta.is_file() else None
