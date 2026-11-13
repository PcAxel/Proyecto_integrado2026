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


def _texto(v, tipo):
    """Valor tal como se imprime en Word y PowerPoint."""
    if v is None or v == '':
        return '—'
    if tipo == 'clp':
        return _clp(v)
    if tipo == 'fecha':
        return _fecha(v)
    if tipo == 'num':
        return f'{v:,}'.replace(',', '.') if isinstance(v, (int, float)) else str(v)
    return str(v)


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
    ws['A3'] = _pie(usuario)
    ws['A3'].font = Font(italic=True, size=9, color='666666')
    fila = 5
    for etiqueta, valor, tipo in conjunto.resumen:
        ws.cell(fila, 1, etiqueta).font = Font(bold=True, color=MARINO)
        c = ws.cell(fila, 2, valor)
        c.alignment = Alignment(horizontal='left')
        if isinstance(valor, (int, float)):
            c.number_format = '"$"#,##0' if tipo == 'clp' else '#,##0'
        fila += 1
    cab = fila + 1
    n = len(conjunto.columnas)
    borde = Border(top=Side(style='medium', color=MARINO), bottom=Side(style='double', color=MARINO))
    for j, (_, etiqueta, _) in enumerate(conjunto.columnas, 1):
        c = ws.cell(cab, j, etiqueta)
        c.font, c.fill = Font(bold=True, color='FFFFFF'), PatternFill('solid', fgColor=MARINO)
        c.alignment = Alignment(vertical='center', wrap_text=True)
    filas, _ = _filas_a_incluir(conjunto, 'xlsx')
    ini = cab + 1
    for i, r in enumerate(filas, ini):
        for j, (clave, _, tipo) in enumerate(conjunto.columnas, 1):
            v = r.get(clave)
            c = ws.cell(i, j)
            if tipo == 'fecha' and v:
                try:
                    c.value, c.number_format = datetime.strptime(str(v)[:10], '%Y-%m-%d'), 'DD-MM-YYYY'
                except ValueError:
                    c.value = str(v)
            elif tipo in ('clp', 'num') and isinstance(v, (int, float)):
                c.value, c.number_format = v, '"$"#,##0' if tipo == 'clp' else '#,##0'
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
        for j, (clave, _, tipo) in enumerate(conjunto.columnas, 1):
            c = ws.cell(fT, j)
            c.font, c.fill, c.border = Font(bold=True, color=MARINO), PatternFill('solid', fgColor=CLARO), borde
            if j == 1:
                c.value = 'TOTAL'
            elif tipo == 'clp':
                col = get_column_letter(j)
                c.value, c.number_format = f'=SUBTOTAL(109,{col}{ini}:{col}{fin})', '"$"#,##0'
    # Anchos automáticos según el contenido (con tope), incluida la fila de totales.
    for j, (clave, etiqueta, tipo) in enumerate(conjunto.columnas, 1):
        largo = max([len(etiqueta) + 3] + [len(_texto(r.get(clave), tipo)) for r in filas[:300]] + ([len(_texto(totales[clave], 'clp'))] if clave in totales else []))
        ws.column_dimensions[get_column_letter(j)].width = min(max(largo + 2, 10), 55)
    ws.freeze_panes = ws.cell(ini, 1)
    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = 'landscape' if n > 5 else 'portrait'
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f'{cab}:{cab}'
    ws.oddFooter.center.text = 'FYAG · Página &P de &N'
    wb.save(ruta)


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
    run = sub.add_run(f'{conjunto.periodo.capitalize() if conjunto.periodo else "Todos los registros"} · {_pie(usuario)}')
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
        escribir(celda, etiqueta, negrita=True, blanco=True, derecha=tipo in ('clp', 'num'))
        _sombrear(celda, MARINO)
    _repetir_cabecera(t.rows[0])
    for i, r in enumerate(filas):
        for celda, (clave, _, tipo) in zip(t.add_row().cells, cols):
            escribir(celda, _texto(r.get(clave), tipo), derecha=tipo in ('clp', 'num'))
            if i % 2:
                _sombrear(celda, 'F2F6F8')
    totales = _totales(conjunto, filas)
    if filas:
        fila_t = t.add_row()
        for j, (celda, (clave, _, tipo)) in enumerate(zip(fila_t.cells, cols)):
            escribir(celda, 'TOTAL' if j == 0 else _texto(totales[clave], 'clp') if clave in totales else '', negrita=True, derecha=tipo in ('clp', 'num'))
            _sombrear(celda, 'DCE6EA')
    if omitidas:
        doc.add_paragraph(f'… y {omitidas} filas más (descarga el Excel para verlas todas). El total solo suma las filas mostradas.')
    doc.save(ruta)


# ───────────────────────── PowerPoint ─────────────────────────
def _pptx(ruta, conjunto, usuario):
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.util import Inches, Pt

    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)  # 16:9
    portada = prs.slides.add_slide(prs.slide_layouts[0])
    portada.shapes.title.text = conjunto.titulo
    portada.placeholders[1].text = '\n'.join([f'{e}: {_texto(v, tipo)}' for e, v, tipo in conjunto.resumen] + [_pie(usuario)])
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
