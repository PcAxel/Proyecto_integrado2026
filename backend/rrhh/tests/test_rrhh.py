"""Segregación de funciones RR. HH. / Finanzas: cada rol hace solo lo suyo y el servidor calcula los montos."""
import shutil
import tempfile
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction

from accounts.models import Role
from accounts.tests.base import RoleTestCase
from rrhh.archivos import almacen_privado
from rrhh.calculo import anios_de_servicio, calcular_finiquito
from rrhh.models import Contrato, FichaTrabajador, Finiquito
from rrhh.tests.helpers import crear_ficha

PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'


def pdf(nombre='doc.pdf', contenido=PDF):
    return SimpleUploadedFile(nombre, contenido, content_type='application/pdf')


class CalculoTest(RoleTestCase):
    def test_anios_con_fraccion_mayor_a_seis_meses(self):
        self.assertEqual(anios_de_servicio(date(2020, 1, 1), date(2023, 1, 1)), 3)
        self.assertEqual(anios_de_servicio(date(2020, 1, 1), date(2023, 7, 1)), 3)   # 6 meses exactos: no suma
        self.assertEqual(anios_de_servicio(date(2020, 1, 1), date(2023, 8, 1)), 4)   # 7 meses: suma un año
        self.assertEqual(anios_de_servicio(date(2000, 1, 1), date(2026, 1, 1)), 11)  # tope legal

    def test_solo_necesidades_de_la_empresa_indemniza(self):
        base = dict(sueldo_base=900000, fecha_inicio=date(2022, 1, 1), fecha_termino=date(2025, 1, 1), dias_vacaciones_pendientes=Decimal('10'))
        n = calcular_finiquito(causal='NECESIDADES_EMPRESA', aviso_previo_dado=False, **base)
        self.assertEqual((n.indemnizacion_anios, n.indemnizacion_aviso, n.vacaciones, n.total), (2700000, 900000, 300000, 3900000))
        r = calcular_finiquito(causal='RENUNCIA', **base)
        self.assertEqual((r.indemnizacion, r.total), (0, 300000))  # solo feriado proporcional

    def test_tope_90_uf(self):
        m = calcular_finiquito(causal='NECESIDADES_EMPRESA', sueldo_base=5000000, fecha_inicio=date(2024, 1, 1), fecha_termino=date(2025, 1, 1),
                               dias_vacaciones_pendientes=0, valor_uf=Decimal('40000'))
        self.assertEqual(m.indemnizacion_anios, 3600000)  # 90 UF, no los 5.000.000


class RRHHApiTest(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.dir = tempfile.mkdtemp()
        p = patch.object(almacen_privado, 'location', self.dir, create=True)
        p.start()
        self.addCleanup(p.stop)
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.emp = self.users[Role.TECNICO]
        crear_ficha(self.emp)  # el tipo de contrato sale de la ficha del trabajador
        self.contrato = Contrato.objects.create(empleado=self.emp, fecha_inicio=date(2022, 1, 1), sueldo_base=900000)

    def datos_finiquito(self, **extra):
        return {'contrato': self.contrato.id, 'causal_despido': 'NECESIDADES_EMPRESA', 'fecha_termino': '2025-01-01',
                'dias_vacaciones_pendientes': '10', 'aviso_previo_dado': False, **extra}

    def crear_finiquito(self):
        self.as_role(Role.RRHH)
        r = self.client.post('/api/rrhh/finiquitos/', self.datos_finiquito(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    # --- contratos ---
    def test_rrhh_y_admin_crud_contratos(self):
        otro = self.users[Role.OPERACIONES]
        crear_ficha(otro)
        for rol in (Role.RRHH, Role.ADMIN):
            self.as_role(rol)
            Contrato.objects.filter(empleado=otro).delete()
            r = self.client.post('/api/rrhh/contratos/', {'empleado': otro.id, 'fecha_inicio': '2025-03-01', 'sueldo_base': 1200000}, format='json')
            self.assertEqual(r.status_code, 201, rol)
            self.assertEqual(self.client.patch(f'/api/rrhh/contratos/{r.data["id"]}/', {'sueldo_base': 1300000}, format='json').status_code, 200)
            self.assertEqual(self.client.delete(f'/api/rrhh/contratos/{r.data["id"]}/').status_code, 204)

    def test_finanzas_solo_lee_contratos(self):
        self.as_role(Role.FINANZAS)
        self.assertEqual(self.client.get('/api/rrhh/contratos/').status_code, 200)
        nuevo = {'empleado': self.users[Role.OPERACIONES].id, 'fecha_inicio': '2025-03-01', 'sueldo_base': 1}
        self.assertEqual(self.client.post('/api/rrhh/contratos/', nuevo, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/rrhh/contratos/{self.contrato.id}/', {'sueldo_base': 5}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/rrhh/contratos/{self.contrato.id}/').status_code, 403)

    def test_otros_roles_sin_acceso(self):
        for rol in (Role.TECNICO, Role.OPERACIONES):
            self.as_role(rol)
            for url in ('contratos', 'documentos', 'finiquitos', 'personal'):
                self.assertEqual(self.client.get(f'/api/rrhh/{url}/').status_code, 403, (rol, url))

    def test_sin_sesion_401(self):
        self.assertEqual(self.client.get('/api/rrhh/contratos/').status_code, 401)

    def test_un_solo_contrato_activo_en_api_y_en_base(self):
        self.as_role(Role.RRHH)
        r = self.client.post('/api/rrhh/contratos/', {'empleado': self.emp.id, 'fecha_inicio': '2025-01-01', 'sueldo_base': 1}, format='json')
        self.assertEqual(r.status_code, 400)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Contrato.objects.create(empleado=self.emp, fecha_inicio=date(2025, 1, 1), sueldo_base=1)

    def test_plazo_fijo_exige_termino(self):
        crear_ficha(self.users[Role.OPERACIONES], 'PLAZO_FIJO')  # el plazo fijo lo define la ficha
        self.as_role(Role.RRHH)
        r = self.client.post('/api/rrhh/contratos/', {'empleado': self.users[Role.OPERACIONES].id, 'fecha_inicio': '2025-01-01', 'sueldo_base': 1}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('fecha_termino', r.data)
        r = self.client.post('/api/rrhh/contratos/', {'empleado': self.users[Role.OPERACIONES].id, 'fecha_inicio': '2025-01-01', 'fecha_termino': '2025-12-31', 'sueldo_base': 1}, format='json')
        self.assertEqual((r.status_code, r.data['tipo_contrato']), (201, 'PLAZO_FIJO'))

    def test_el_contrato_exige_ficha_y_no_guarda_el_tipo(self):
        """Fuente de verdad única: sin ficha no hay contrato, y el tipo se lee de la ficha (enviarlo en el contrato se ignora)."""
        self.as_role(Role.RRHH)
        sin_ficha = self.users[Role.OPERACIONES]
        r = self.client.post('/api/rrhh/contratos/', {'empleado': sin_ficha.id, 'fecha_inicio': '2025-01-01', 'sueldo_base': 1}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('empleado', r.data)
        self.assertNotIn('tipo_contrato', [f.name for f in Contrato._meta.get_fields()])
        crear_ficha(sin_ficha, 'INDEFINIDO')
        r = self.client.post('/api/rrhh/contratos/', {'empleado': sin_ficha.id, 'tipo_contrato': 'PLAZO_FIJO', 'fecha_inicio': '2025-01-01', 'sueldo_base': 1}, format='json')
        self.assertEqual((r.status_code, r.data['tipo_contrato']), (201, 'INDEFINIDO'))
        FichaTrabajador.objects.filter(usuario=sin_ficha).update(tipo_contrato='OBRA_FAENA')
        self.assertEqual(self.client.get(f'/api/rrhh/contratos/{r.data["id"]}/').data['tipo_contrato'], 'OBRA_FAENA')

    def test_estado_del_contrato_no_se_fija_desde_el_cliente(self):
        self.as_role(Role.RRHH)
        self.client.patch(f'/api/rrhh/contratos/{self.contrato.id}/', {'estado': 'FINIQUITADO'}, format='json')
        self.contrato.refresh_from_db()
        self.assertEqual(self.contrato.estado, 'ACTIVO')

    # --- documentos ---
    def test_documento_pdf_valido_y_descarga(self):
        self.as_role(Role.RRHH)
        r = self.client.post('/api/rrhh/documentos/', {'empleado': self.emp.id, 'tipo_documento': 'AMONESTACION', 'archivo_pdf': pdf()}, format='multipart')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertNotIn('archivo_pdf', r.data)  # nunca se expone la ruta
        d = self.client.get(f'/api/rrhh/documentos/{r.data["id"]}/archivo/')
        self.assertEqual(d.status_code, 200)
        self.assertIn('attachment', d['Content-Disposition'])
        self.assertEqual(d['X-Content-Type-Options'], 'nosniff')
        self.as_role(Role.FINANZAS)
        self.assertEqual(self.client.get('/api/rrhh/documentos/').status_code, 403)
        self.assertEqual(self.client.get(f'/api/rrhh/documentos/{r.data["id"]}/archivo/').status_code, 403)

    def test_documento_rechaza_archivos_falsos(self):
        self.as_role(Role.RRHH)
        for archivo in (pdf('virus.pdf', b'MZ\x90\x00 no soy pdf'), pdf('doc.exe'), pdf('grande.pdf', PDF + b'0' * (10 * 1024 * 1024))):
            r = self.client.post('/api/rrhh/documentos/', {'empleado': self.emp.id, 'tipo_documento': 'ANEXO', 'archivo_pdf': archivo}, format='multipart')
            self.assertEqual(r.status_code, 400, archivo.name)

    # --- finiquitos ---
    def test_rrhh_crea_finiquito_y_el_servidor_calcula(self):
        f = self.crear_finiquito()
        self.assertEqual((f['monto_indemnizacion'], f['monto_total'], f['estado_pago']), ('3600000', '3900000', 'PENDIENTE'))

    def test_montos_enviados_por_el_cliente_se_ignoran(self):
        self.as_role(Role.RRHH)
        r = self.client.post('/api/rrhh/finiquitos/', self.datos_finiquito(monto_total=1, monto_indemnizacion=1, estado_pago='PAGADO'), format='json')
        self.assertEqual((r.data['monto_total'], r.data['estado_pago']), ('3900000', 'PENDIENTE'))

    def test_calcular_no_guarda(self):
        self.as_role(Role.RRHH)
        r = self.client.post('/api/rrhh/finiquitos/calcular/', self.datos_finiquito(), format='json')
        self.assertEqual((r.status_code, r.data['monto_total'], r.data['anios_servicio']), (200, 3900000, 3))
        self.assertEqual(Finiquito.objects.count(), 0)

    def test_un_finiquito_por_contrato(self):
        self.crear_finiquito()
        self.assertEqual(self.client.post('/api/rrhh/finiquitos/', self.datos_finiquito(), format='json').status_code, 400)

    def test_rrhh_no_puede_tocar_el_pago(self):
        f = self.crear_finiquito()
        for cuerpo in ({'estado_pago': 'PAGADO'}, {'comprobante_pago': pdf()}):
            r = self.client.patch(f'/api/rrhh/finiquitos/{f["id"]}/', cuerpo, format='multipart')
            self.assertEqual(r.status_code, 403, cuerpo)
        self.assertEqual(Finiquito.objects.get(pk=f['id']).estado_pago, 'PENDIENTE')

    def test_rrhh_corrige_y_se_recalcula(self):
        f = self.crear_finiquito()
        r = self.client.patch(f'/api/rrhh/finiquitos/{f["id"]}/', {'aviso_previo_dado': True}, format='json')
        self.assertEqual(r.data['monto_total'], '3000000')

    def test_finanzas_paga_con_comprobante(self):
        f = self.crear_finiquito()
        self.as_role(Role.FINANZAS)
        url = f'/api/rrhh/finiquitos/{f["id"]}/'
        sin = self.client.patch(url, {'estado_pago': 'PAGADO'}, format='multipart')
        self.assertEqual(sin.status_code, 400)
        self.assertIn('comprobante_pago', sin.data)
        ok = self.client.patch(url, {'estado_pago': 'PAGADO', 'comprobante_pago': pdf('transferencia.pdf')}, format='multipart')
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual((ok.data['estado_pago'], ok.data['tiene_comprobante']), ('PAGADO', True))
        self.assertNotIn('comprobante_pago', ok.data)
        self.contrato.refresh_from_db()
        self.assertEqual((self.contrato.estado, self.contrato.fecha_termino), ('FINIQUITADO', date(2025, 1, 1)))
        self.assertEqual(Finiquito.objects.get(pk=f['id']).pagado_por, self.users[Role.FINANZAS])
        self.assertEqual(self.client.get(f'{url}comprobante/').status_code, 200)

    def test_finanzas_no_edita_el_calculo(self):
        f = self.crear_finiquito()
        self.as_role(Role.FINANZAS)
        for cuerpo in ({'monto_total': 1}, {'causal_despido': 'RENUNCIA'}, {'estado_pago': 'PAGADO', 'monto_total': 1}):
            self.assertEqual(self.client.patch(f'/api/rrhh/finiquitos/{f["id"]}/', cuerpo, format='json').status_code, 403, cuerpo)
        self.assertEqual(self.client.post('/api/rrhh/finiquitos/', self.datos_finiquito(), format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/rrhh/finiquitos/calcular/', self.datos_finiquito(), format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/rrhh/finiquitos/{f["id"]}/').status_code, 403)

    def test_finiquito_pagado_es_inmutable_para_todos(self):
        f = self.crear_finiquito()
        url = f'/api/rrhh/finiquitos/{f["id"]}/'
        self.as_role(Role.FINANZAS)
        self.client.patch(url, {'estado_pago': 'PAGADO', 'comprobante_pago': pdf()}, format='multipart')
        self.assertEqual(self.client.patch(url, {'estado_pago': 'PAGADO', 'comprobante_pago': pdf()}, format='multipart').status_code, 400)
        for rol in (Role.RRHH, Role.ADMIN):
            self.as_role(rol)
            self.assertEqual(self.client.patch(url, {'dias_vacaciones_pendientes': '0'}, format='json').status_code, 400, rol)
        self.assertEqual(self.client.delete(url).status_code, 400)  # admin
        self.assertEqual(self.client.delete(f'/api/rrhh/contratos/{self.contrato.id}/').status_code, 400)

    def test_comprobante_falso_rechazado(self):
        f = self.crear_finiquito()
        self.as_role(Role.FINANZAS)
        r = self.client.patch(f'/api/rrhh/finiquitos/{f["id"]}/', {'estado_pago': 'PAGADO', 'comprobante_pago': pdf('x.pdf', b'<html>')}, format='multipart')
        self.assertEqual(r.status_code, 400)

    def test_base_exige_comprobante_para_pagado(self):
        f = self.crear_finiquito()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Finiquito.objects.filter(pk=f['id']).update(estado_pago='PAGADO')

    def test_finanzas_ve_los_pendientes(self):
        self.crear_finiquito()
        self.as_role(Role.FINANZAS)
        r = self.client.get('/api/rrhh/finiquitos/?estado_pago=PENDIENTE')
        self.assertEqual([x['estado_pago'] for x in r.data], ['PENDIENTE'])
        self.assertEqual(self.client.get('/api/rrhh/finiquitos/?estado_pago=PAGADO').data, [])

    def test_admin_supervisa_todo(self):
        f = self.crear_finiquito()
        self.as_role(Role.ADMIN)
        url = f'/api/rrhh/finiquitos/{f["id"]}/'
        self.assertEqual(self.client.patch(url, {'estado_pago': 'PAGADO', 'comprobante_pago': pdf()}, format='multipart').status_code, 200)

    def test_personal_lista_estado_contractual(self):
        self.as_role(Role.RRHH)
        filas = {p['email']: p for p in self.client.get('/api/rrhh/personal/').data}
        self.assertEqual(filas[self.emp.email]['contrato']['estado'], 'ACTIVO')
        self.assertIsNone(filas[self.users[Role.FINANZAS].email]['contrato'])
        self.as_role(Role.FINANZAS)
        self.assertEqual(self.client.get('/api/rrhh/personal/').status_code, 403)
