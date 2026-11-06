"""Datos de demostración de RR. HH. (contratos, finiquitos y un contrato por firmar). Solo los usa `seed_fyag --demo`."""
import io
from datetime import date, timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone
from reportlab.pdfgen import canvas

from accounts.models import CustomUser, Role

from .archivos import sha256
from .calculo import calcular_finiquito
from .models import Contrato, DocumentoLaboral, Finiquito

SUELDOS = {'admin@fyag.cl': 2_800_000, 'finanzas@fyag.cl': 1_600_000, 'operaciones@fyag.cl': 1_500_000,
           'tecnico@fyag.cl': 950_000, 'rrhh@fyag.cl': 1_400_000}
# (correo, nombre, apellido, sueldo, inicio, causal, término, días de vacaciones, aviso previo, pagado)
EX_PERSONAL = [
    ('camila.fuentes@demo.fyag.cl', 'Camila', 'Fuentes', 1_100_000, date(2021, 3, 1), 'NECESIDADES_EMPRESA', date(2026, 9, 30), '8.5', True, True),
    ('matias.ibanez@demo.fyag.cl', 'Matías', 'Ibáñez', 980_000, date(2023, 6, 12), 'RENUNCIA', date(2026, 11, 20), '12', True, False),
    ('daniela.soto@demo.fyag.cl', 'Daniela', 'Soto', 1_250_000, date(2019, 2, 4), 'NECESIDADES_EMPRESA', date(2026, 11, 30), '5', False, False),
]


def _pdf(titulo, lineas):
    b = io.BytesIO()
    c = canvas.Canvas(b)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(60, 780, titulo)
    c.setFont('Helvetica', 11)
    y = 745
    for linea in lineas:
        c.drawString(60, y, linea)
        y -= 18
    c.drawString(60, 90, 'Documento ficticio de demostración · FYAG SpA')
    c.showPage()
    c.save()
    return b.getvalue()


def cargar_demo_rrhh():
    """Idempotente: si ya hay contratos no toca nada. Devuelve cuántos registros creó."""
    if Contrato.objects.exists():
        return 0
    rrhh = CustomUser.objects.get(email='rrhh@fyag.cl')
    finanzas = CustomUser.objects.get(email='finanzas@fyag.cl')
    hoy, creados = timezone.localdate(), 0
    for i, (email, sueldo) in enumerate(SUELDOS.items()):
        Contrato.objects.create(empleado=CustomUser.objects.get(email=email), tipo_contrato='INDEFINIDO', sueldo_base=sueldo,
                                fecha_inicio=date(2022, 1, 10) + timedelta(days=200 * i))
        creados += 1
    for email, nombre, apellido, sueldo, inicio, causal, termino, dias, aviso, pagado in EX_PERSONAL:
        u = CustomUser(email=email, first_name=nombre, last_name=apellido, role=Role.TECNICO, is_active=not pagado)
        u.set_unusable_password()  # persona de la demo: no inicia sesión
        u.save()
        c = Contrato.objects.create(empleado=u, tipo_contrato='INDEFINIDO', sueldo_base=sueldo, fecha_inicio=inicio)
        m = calcular_finiquito(causal=causal, sueldo_base=sueldo, fecha_inicio=inicio, fecha_termino=termino, dias_vacaciones_pendientes=dias,
                               aviso_previo_dado=aviso, valor_uf=settings.VALOR_UF)
        f = Finiquito(contrato=c, causal_despido=causal, fecha_termino=termino, aviso_previo_dado=aviso, dias_vacaciones_pendientes=dias,
                      monto_indemnizacion=m.indemnizacion, monto_total=m.total, creado_por=rrhh)
        if pagado:
            f.comprobante_pago.save('comprobante.pdf', ContentFile(_pdf('Comprobante de transferencia', [f'Beneficiario: {nombre} {apellido}', f'Monto: ${m.total:,}'.replace(',', '.')])), save=False)
            f.estado_pago, f.pagado_por, f.pagado_en = Finiquito.EstadoPago.PAGADO, finanzas, timezone.now()
            c.estado, c.fecha_termino = Contrato.Estado.FINIQUITADO, termino
            c.save()
        f.save()
        creados += 2
    # Un anexo por firmar para el técnico: aparece el aviso en su app.
    pdf = _pdf('Anexo de contrato de trabajo', ['Entre Frío y Agroindustria SpA y Jorge Quezada se acuerda:', '', '1. Modificar la jornada a 40 horas semanales.',
                                                 '2. Mantener las demás cláusulas del contrato.', '', f'Fecha: {hoy:%d-%m-%Y}'])
    d = DocumentoLaboral(trabajador=CustomUser.objects.get(email='tecnico@fyag.cl'), tipo_documento='ANEXO', titulo='Jornada de 40 horas',
                         hash_pdf=sha256(io.BytesIO(pdf)), subido_por=rrhh)
    d.archivo_pdf.save('anexo.pdf', ContentFile(pdf), save=False)
    d.save()
    return creados + 1
