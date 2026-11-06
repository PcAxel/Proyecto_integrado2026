"""Firma electrónica: RR. HH. sube y asigna, el trabajador firma lo suyo, y el servidor fija IP y hora."""
import base64
import io
import shutil
import tempfile
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
import pyotp
from django.core.cache import cache
from django.db import IntegrityError, transaction
from pypdf import PdfReader, PdfWriter
from PIL import Image, ImageDraw

from accounts.models import CustomUser, Role
from accounts.tests.base import RoleTestCase
from rrhh.archivos import almacen_privado
from rrhh.models import DocumentoLaboral



def _pdf(paginas=2):
    from reportlab.pdfgen import canvas
    b = io.BytesIO()
    c = canvas.Canvas(b)
    for i in range(paginas):
        c.drawString(100, 700, f'Contrato de trabajo, página {i + 1}')
        c.showPage()
    c.save()
    return b.getvalue()


PDF = _pdf()


def png(trazo=True, tam=(300, 120), formato='PNG'):
    img = Image.new('RGBA', tam, (0, 0, 0, 0))
    if trazo:
        ImageDraw.Draw(img).line([(10, 100), (80, 20), (150, 90), (280, 30)], fill=(10, 10, 10, 255), width=5)
    b = io.BytesIO()
    (img if formato == 'PNG' else img.convert('RGB')).save(b, formato)
    return b.getvalue()


def data_url(crudo, mime='image/png'):
    return f'data:{mime};base64,' + base64.b64encode(crudo).decode()


class FirmaTest(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.dir = tempfile.mkdtemp()
        p = patch.object(almacen_privado, 'location', self.dir, create=True)
        p.start()
        self.addCleanup(p.stop)
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.tec = self.users[Role.TECNICO]
        CustomUser.objects.filter(pk=self.tec.pk).update(is_2fa_enabled=True, otp_secret=pyotp.random_base32())
        self.tec.refresh_from_db()

    def subir(self, trabajador=None, tipo='CONTRATO', contenido=PDF, nombre='contrato.pdf'):
        self.as_role(Role.RRHH)
        return self.client.post('/api/rrhh/documentos-laborales/', {
            'trabajador': (trabajador or self.tec).id, 'tipo_documento': tipo, 'titulo': 'Contrato 2026',
            'archivo_pdf': SimpleUploadedFile(nombre, contenido, content_type='application/pdf')}, format='multipart')

    def codigo(self, usuario=None):
        u = usuario or self.tec
        return pyotp.TOTP(u.otp_secret).now()

    def firmar(self, doc_id, firma=None, codigo=None, reusar_codigo=False, **extra):
        if not reusar_codigo:
            cache.clear()  # cada firma real usa un código distinto; aquí los tests repiten el mismo
        cuerpo = {'firma': firma or data_url(png()), 'codigo_2fa': codigo or self.codigo()}
        return self.client.post(f'/api/rrhh/firmar-documento/{doc_id}/', cuerpo, format='json', **extra)

    # --- RR. HH. ---
    def test_rrhh_sube_y_queda_pendiente(self):
        r = self.subir()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['estado'], r.data['tiene_firma']), ('PENDIENTE', False))
        self.assertEqual(len(r.data['hash_pdf']), 64)
        self.assertNotIn('archivo_pdf', r.data)

    def test_solo_rrhh_y_admin_gestionan(self):
        for rol in (Role.FINANZAS, Role.OPERACIONES, Role.TECNICO):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/rrhh/documentos-laborales/').status_code, 403, rol)
        self.as_role(Role.ADMIN)
        self.assertEqual(self.client.get('/api/rrhh/documentos-laborales/').status_code, 200)

    def test_rechaza_pdf_falso_e_inactivo(self):
        self.assertEqual(self.subir(contenido=b'MZ no soy pdf').status_code, 400)
        self.assertEqual(self.subir(contenido=b'%PDF-1.4 roto').status_code, 400)  # firma correcta pero no se puede leer
        CustomUser.objects.filter(pk=self.tec.pk).update(is_active=False)
        self.assertEqual(self.subir().status_code, 400)

    def test_el_estado_no_se_fija_al_subir(self):
        self.as_role(Role.RRHH)
        r = self.client.post('/api/rrhh/documentos-laborales/', {'trabajador': self.tec.id, 'tipo_documento': 'ANEXO', 'estado': 'FIRMADO',
                             'archivo_pdf': SimpleUploadedFile('a.pdf', PDF)}, format='multipart')
        self.assertEqual(r.data['estado'], 'PENDIENTE')

    # --- trabajador ---
    def test_trabajador_ve_solo_los_suyos_sin_datos_internos(self):
        mio = self.subir().data['id']
        ajeno = self.subir(self.users[Role.OPERACIONES]).data['id']
        self.as_role(Role.TECNICO)
        lista = self.client.get('/api/rrhh/mis-documentos/?estado=PENDIENTE').data
        self.assertEqual([d['id'] for d in lista], [mio])
        self.assertNotIn('hash_pdf', lista[0])
        self.assertNotIn('ip_firma', lista[0])
        self.assertEqual(self.client.get(f'/api/rrhh/mis-documentos/{ajeno}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/rrhh/mis-documentos/{ajeno}/archivo/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/rrhh/mis-documentos/{mio}/archivo/').status_code, 200)

    def test_firma_guarda_evidencia_del_servidor(self):
        doc = self.subir().data['id']
        self.as_role(Role.TECNICO)
        r = self.firmar(doc, REMOTE_ADDR='203.0.113.7', HTTP_USER_AGENT='Mozilla/5.0 Test')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['estado'], 'FIRMADO')
        self.assertNotIn('ip_firma', r.data)
        d = DocumentoLaboral.objects.get(pk=doc)
        self.assertEqual((d.ip_firma, d.agente_firma, d.estado), ('203.0.113.7', 'Mozilla/5.0 Test', 'FIRMADO'))
        self.assertIsNotNone(d.fecha_firma)
        self.assertTrue(d.firma_imagen.name.endswith('.png'))
        # RR. HH. ve la evidencia completa y puede bajar la firma
        self.as_role(Role.RRHH)
        v = self.client.get(f'/api/rrhh/documentos-laborales/{doc}/').data
        self.assertEqual((v['ip_firma'], v['tiene_firma']), ('203.0.113.7', True))
        self.assertEqual(self.client.get(f'/api/rrhh/documentos-laborales/{doc}/firma/').status_code, 200)

    def test_ip_y_fecha_enviadas_por_el_cliente_se_ignoran(self):
        doc = self.subir().data['id']
        self.as_role(Role.TECNICO)
        self.client.post(f'/api/rrhh/firmar-documento/{doc}/', {'firma': data_url(png()), 'codigo_2fa': self.codigo(), 'ip_firma': '1.1.1.1', 'fecha_firma': '2000-01-01T00:00:00Z'},
                         format='json', REMOTE_ADDR='203.0.113.7')
        d = DocumentoLaboral.objects.get(pk=doc)
        self.assertEqual(d.ip_firma, '203.0.113.7')
        self.assertGreater(d.fecha_firma.year, 2000)

    def test_no_firma_documento_ajeno(self):
        ajeno = self.subir(self.users[Role.OPERACIONES]).data['id']
        self.as_role(Role.TECNICO)
        self.assertEqual(self.firmar(ajeno).status_code, 404)
        self.assertEqual(DocumentoLaboral.objects.get(pk=ajeno).estado, 'PENDIENTE')

    def test_rrhh_no_puede_firmar_por_el_trabajador(self):
        doc = self.subir().data['id']  # queda autenticado como RRHH
        self.assertEqual(self.firmar(doc).status_code, 404)

    def test_no_se_firma_dos_veces(self):
        doc = self.subir().data['id']
        self.as_role(Role.TECNICO)
        self.assertEqual(self.firmar(doc).status_code, 200)
        self.assertEqual(self.firmar(doc).status_code, 400)

    def test_firma_invalida_rechazada(self):
        doc = self.subir().data['id']
        self.as_role(Role.TECNICO)
        casos = {
            'en blanco': data_url(png(trazo=False)),
            'no base64': 'data:image/png;base64,@@@@',
            'mime incorrecto': data_url(png(), 'image/svg+xml'),
            'jpeg disfrazado': data_url(png(formato='JPEG')),
            'no es imagen': data_url(b'<script>alert(1)</script>'),
            'demasiado grande': data_url(png(tam=(3000, 3000)) + b'0' * 600_000),
        }
        for nombre, firma in casos.items():
            self.assertEqual(self.firmar(doc, firma).status_code, 400, nombre)
        self.assertEqual(DocumentoLaboral.objects.get(pk=doc).estado, 'PENDIENTE')

    def test_acepta_base64_plano_sin_prefijo(self):
        doc = self.subir().data['id']
        self.as_role(Role.TECNICO)
        self.assertEqual(self.firmar(doc, base64.b64encode(png()).decode()).status_code, 200)

    def test_pdf_alterado_despues_de_subir_bloquea_la_firma(self):
        doc = self.subir().data['id']
        d = DocumentoLaboral.objects.get(pk=doc)
        with open(d.archivo_pdf.path, 'wb') as f:
            f.write(PDF + b'\n% alterado')
        self.as_role(Role.TECNICO)
        self.assertEqual(self.firmar(doc).status_code, 400)
        self.assertEqual(DocumentoLaboral.objects.get(pk=doc).estado, 'PENDIENTE')

    def test_firmado_no_se_elimina_pendiente_si(self):
        a, b = self.subir().data['id'], self.subir().data['id']
        self.as_role(Role.TECNICO)
        self.firmar(a)
        self.as_role(Role.RRHH)
        self.assertEqual(self.client.delete(f'/api/rrhh/documentos-laborales/{a}/').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/rrhh/documentos-laborales/{b}/').status_code, 204)

    def test_sin_sesion_401(self):
        self.client.logout()
        self.assertEqual(self.client.post('/api/rrhh/firmar-documento/1/', {'firma': 'x'}, format='json').status_code, 401)

    def test_base_exige_evidencia_para_firmado(self):
        doc = self.subir().data['id']
        with self.assertRaises(IntegrityError), transaction.atomic():
            DocumentoLaboral.objects.filter(pk=doc).update(estado='FIRMADO')


    # --- identidad y unicidad de la firma ---
    def test_exige_codigo_2fa_valido(self):
        doc = self.subir().data['id']
        self.as_role(Role.TECNICO)
        self.assertEqual(self.client.post(f'/api/rrhh/firmar-documento/{doc}/', {'firma': data_url(png())}, format='json').status_code, 400)
        mal = '000000' if self.codigo() != '000000' else '111111'
        r = self.firmar(doc, codigo=mal)
        self.assertEqual(r.status_code, 400)
        self.assertIn('codigo_2fa', r.data)
        self.assertEqual(DocumentoLaboral.objects.get(pk=doc).estado, 'PENDIENTE')

    def test_codigo_ya_usado_no_sirve_otra_vez(self):
        a, b = self.subir().data['id'], self.subir().data['id']
        self.as_role(Role.TECNICO)
        self.assertEqual(self.firmar(a).status_code, 200)
        r = self.firmar(b, firma=data_url(png(tam=(310, 120))), reusar_codigo=True)
        self.assertEqual(r.status_code, 400)
        self.assertIn('codigo_2fa', r.data)

    def test_sin_2fa_activo_no_puede_firmar(self):
        doc = self.subir().data['id']
        CustomUser.objects.filter(pk=self.tec.pk).update(is_2fa_enabled=False)
        self.tec.refresh_from_db()  # as_role autentica con este mismo objeto
        self.as_role(Role.TECNICO)
        self.assertEqual(self.firmar(doc).status_code, 400)

    def test_la_misma_firma_no_se_reutiliza_en_otro_documento(self):
        a, b = self.subir().data['id'], self.subir().data['id']
        self.as_role(Role.TECNICO)
        trazo = data_url(png())
        self.assertEqual(self.firmar(a, trazo).status_code, 200)
        r = self.firmar(b, trazo)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(DocumentoLaboral.objects.get(pk=b).estado, 'PENDIENTE')
        self.assertEqual(self.firmar(b, data_url(png(tam=(320, 130)))).status_code, 200)  # otro trazo sí

    def test_base_impide_repetir_la_huella_de_firma(self):
        a, b = self.subir().data['id'], self.subir().data['id']
        self.as_role(Role.TECNICO)
        self.firmar(a)
        h = DocumentoLaboral.objects.get(pk=a).hash_firma
        with self.assertRaises(IntegrityError), transaction.atomic():
            DocumentoLaboral.objects.filter(pk=b).update(hash_firma=h)

    # --- PDF firmado ---
    def test_pdf_firmado_agrega_constancia_y_deja_el_original_intacto(self):
        doc = self.subir().data['id']
        d0 = DocumentoLaboral.objects.get(pk=doc)
        original = d0.archivo_pdf.read()
        d0.archivo_pdf.close()
        self.as_role(Role.TECNICO)
        self.assertEqual(self.firmar(doc).status_code, 200)
        d = DocumentoLaboral.objects.get(pk=doc)
        with d.archivo_pdf.open('rb') as f:
            self.assertEqual(f.read(), original)
        with d.archivo_firmado.open('rb') as f:
            bytes_firmado = f.read()
        lector = PdfReader(io.BytesIO(bytes_firmado))
        self.assertEqual(len(lector.pages), 3)  # 2 originales + constancia
        texto = lector.pages[-1].extract_text()
        for esperado in ('Constancia de firma electr', d.hash_pdf, d.hash_firma, d.ip_firma or '', 'doble factor'):
            self.assertIn(esperado, texto)
        import hashlib
        self.assertEqual(hashlib.sha256(bytes_firmado).hexdigest(), d.hash_firmado)
        self.assertEqual(lector.pages[0].extract_text().strip(), PdfReader(io.BytesIO(original)).pages[0].extract_text().strip())

    def test_descarga_del_firmado_por_trabajador_y_rrhh(self):
        doc = self.subir().data['id']
        self.as_role(Role.TECNICO)
        self.assertEqual(self.client.get(f'/api/rrhh/mis-documentos/{doc}/firmado/').status_code, 404)  # aún no existe
        self.firmar(doc)
        r = self.client.get(f'/api/rrhh/mis-documentos/{doc}/firmado/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(b''.join(r.streaming_content).startswith(b'%PDF'))
        self.as_role(Role.RRHH)
        self.assertEqual(self.client.get(f'/api/rrhh/documentos-laborales/{doc}/firmado/').status_code, 200)
        self.as_role(Role.FINANZAS)
        self.assertEqual(self.client.get(f'/api/rrhh/documentos-laborales/{doc}/firmado/').status_code, 403)
        self.as_role(Role.OPERACIONES)
        self.assertEqual(self.client.get(f'/api/rrhh/mis-documentos/{doc}/firmado/').status_code, 404)

    def test_pdf_cifrado_se_rechaza_al_subir(self):
        w = PdfWriter(clone_from=PdfReader(io.BytesIO(PDF)))
        w.encrypt('secreto')
        b = io.BytesIO()
        w.write(b)
        r = self.subir(contenido=b.getvalue())
        self.assertEqual(r.status_code, 400)
        self.assertIn('contraseña', str(r.data))


class IpClienteTest(RoleTestCase):
    def peticion(self, remota='10.0.0.1', xff=None):
        from django.test import RequestFactory
        extra = {'REMOTE_ADDR': remota}
        if xff:
            extra['HTTP_X_FORWARDED_FOR'] = xff
        return RequestFactory().get('/', **extra)

    def test_sin_proxy_ignora_x_forwarded_for(self):
        from config.ip import ip_cliente
        with self.settings(PROXIES_DE_CONFIANZA=0):
            self.assertEqual(ip_cliente(self.peticion(xff='6.6.6.6')), '10.0.0.1')

    def test_con_un_proxy_toma_la_ultima_direccion_no_la_que_escribe_el_cliente(self):
        from config.ip import ip_cliente
        with self.settings(PROXIES_DE_CONFIANZA=1):
            self.assertEqual(ip_cliente(self.peticion(xff='6.6.6.6, 203.0.113.9')), '203.0.113.9')  # 6.6.6.6 la inventó el cliente
            self.assertEqual(ip_cliente(self.peticion(xff='203.0.113.9')), '203.0.113.9')

    def test_dos_proxies(self):
        from config.ip import ip_cliente
        with self.settings(PROXIES_DE_CONFIANZA=2):
            self.assertEqual(ip_cliente(self.peticion(xff='6.6.6.6, 203.0.113.9, 10.9.9.9')), '203.0.113.9')

    def test_cabecera_basura_o_ausente_cae_a_remote_addr(self):
        from config.ip import ip_cliente
        with self.settings(PROXIES_DE_CONFIANZA=1):
            self.assertEqual(ip_cliente(self.peticion(xff='no-es-ip')), '10.0.0.1')
            self.assertEqual(ip_cliente(self.peticion()), '10.0.0.1')
