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
def _xlsx(ruta, conjunto, usuario):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = conjunto.titulo[:31]
    ws['A1'] = conjunto.titulo
    ws['A1'].font = Font(bold=True, size=14, color='0B2A3F')
    ws['A2'] = _pie(usuario)
    ws['A2'].font = Font(italic=True, size=9, color='666666')
    fila = 4
    for etiqueta, valor, tipo in conjunto.resumen:
        ws.cell(fila, 1, etiqueta).font = Font(bold=True)
        ws.cell(fila, 2, valor).number_format = '"$"#,##0' if tipo == 'clp' else '#,##0'
        fila += 1
    fila += 1
    cabecera = fila
    for j, (_, etiqueta, _) in enumerate(conjunto.columnas, 1):
        c = ws.cell(cabecera, j, etiqueta)
        c.font, c.fill = Font(bold=True, color='FFFFFF'), PatternFill('solid', fgColor='0B2A3F')
        c.alignment = Alignment(vertical='center', wrap_text=True)
    filas, _ = _filas_a_incluir(conjunto, 'xlsx')
    for i, r in enumerate(filas, cabecera + 1):
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
    for j, (clave, etiqueta, tipo) in enumerate(conjunto.columnas, 1):
        ancho = max([len(etiqueta)] + [len(_texto(r.get(clave), tipo)) for r in filas[:200]])
        ws.column_dimensions[get_column_letter(j)].width = min(max(ancho + 2, 10), 50)
    ws.freeze_panes = ws.cell(cabecera + 1, 1)
    if filas:
        ws.auto_filter.ref = f'A{cabecera}:{get_column_letter(len(conjunto.columnas))}{cabecera + len(filas)}'
    wb.save(ruta)


# ───────────────────────── Word ─────────────────────────
def _docx(ruta, conjunto, usuario):
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.shared import Pt

    doc = Document()
    sec = doc.sections[0]
    if len(conjunto.columnas) > 5:  # tablas anchas: hoja apaisada
        sec.orientation = WD_ORIENT.LANDSCAPE
        sec.page_width, sec.page_height = sec.page_height, sec.page_width
    doc.add_heading(conjunto.titulo, level=1)
    doc.add_paragraph(_pie(usuario)).runs[0].font.size = Pt(9)
    for etiqueta, valor, tipo in conjunto.resumen:
        p = doc.add_paragraph()
        p.add_run(f'{etiqueta}: ').bold = True
        p.add_run(_texto(valor, tipo))
    filas, omitidas = _filas_a_incluir(conjunto, 'docx')
    t = doc.add_table(rows=1, cols=len(conjunto.columnas), style='Light Grid Accent 1')
    for c, (_, etiqueta, _) in zip(t.rows[0].cells, conjunto.columnas):
        c.text = etiqueta
        c.paragraphs[0].runs[0].bold = True
    for r in filas:
        for c, (clave, _, tipo) in zip(t.add_row().cells, conjunto.columnas):
            c.text = _texto(r.get(clave), tipo)
    for fila in t.rows:
        for c in fila.cells:
            for par in c.paragraphs:
                for run in par.runs:
                    run.font.size = Pt(8 if len(conjunto.columnas) > 5 else 10)
    if omitidas:
        doc.add_paragraph(f'… y {omitidas} filas más (descarga el Excel para verlas todas).')
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
    return {'token': token, 'formato': formato, 'nombre': f'reporte_{base}_{date.today():%Y%m%d}.{formato}', 'filas': len(conjunto.filas)}


def ruta_de(usuario, token, formato):
    """Ruta del archivo SOLO si es de este usuario y existe; None en otro caso. Ni el token ni el formato llegan al sistema de archivos sin validar."""
    if not TOKEN_RE.match(token or '') or formato not in FORMATOS:
        return None
    ruta = _carpeta(usuario) / f'{token}.{formato}'
    return ruta if ruta.is_file() else None
