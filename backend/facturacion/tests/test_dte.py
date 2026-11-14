"""Facturación electrónica: RBAC por JWT, reglas de la orden, adaptador de proveedor, idempotencia y descarga privada del PDF."""
import tempfile
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import override_settings
from rest_framework_simplejwt.tokens import AccessToken

from accounts.tests.base import RoleTestCase
from erp.models import Registro
from facturacion import servicios_dte
from facturacion.models import FacturaDTE
from facturacion.servicios_dte import DatosFactura, ProveedorDTEBase, ProveedorSimulado, obtener_proveedor


class DTEBase(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        # el almacén se crea al importar: se apunta a una carpeta temporal para no ensuciar el disco real
        for k in ('base_location', 'location'):
            servicios_dte.almacen_dte.__dict__[k] = self.tmp.name
        self.addCleanup(lambda: [servicios_dte.almacen_dte.__dict__.pop(k, None) for k in ('base_location', 'location')])
        p = override_settings(DTE_SIMULADO_RETRASO=0)
        p.enable()
        self.addCleanup(p.disable)
        self.crear_orden('OB-0001')

    def crear_orden(self, rid, estado='FINALIZADA', venta=1_000_000, presupuesto='APROBADO', cliente=True):
        Registro.objects.get_or_create(tabla='clientes', rid='CLI-001', defaults={'datos': {'rut': '76.115.402-8', 'razon_social': 'Packing Cordillera S.A.', 'activo': True}})
        if not cliente:
            Registro.objects.filter(tabla='clientes').delete()
        pid = f'PRE-{rid[-4:]}'
        if presupuesto:
            Registro.objects.create(tabla='presupuestos', rid=pid, datos={'titulo': 'Cámara N°3', 'estado': presupuesto, 'precio_venta_neto': venta, 'cliente_id': 'CLI-001'})
        Registro.objects.create(tabla='obras', rid=rid, datos={'nombre': 'Cámara de frío N°3', 'estado': estado, 'cliente_id': 'CLI-001', 'presupuesto_id': pid if presupuesto else None})

    def emitir(self, rol='FINANZAS', orden='OB-0001'):
        self.as_role(rol)
        return self.client.post(f'/api/facturacion/emitir/{orden}/')


class RBACTests(DTEBase):
    def test_administrador_y_finanzas_pueden_emitir(self):
        for rol, orden in (('ADMIN', 'OB-0001'), ('FINANZAS', 'OB-0002')):
            if orden != 'OB-0001':
                self.crear_orden(orden)
            r = self.emitir(rol, orden)
            self.assertEqual(r.status_code, 200, rol)
            self.assertEqual(r.data['estado_sii'], 'ACEPTADO')

    def test_los_demas_roles_reciben_403_y_no_se_crea_nada(self):
        for rol in ('OPERACIONES', 'TECNICO', 'RRHH'):
            r = self.emitir(rol)
            self.assertEqual(r.status_code, 403, rol)
        self.assertEqual(FacturaDTE.objects.count(), 0)

    def test_todas_las_rutas_estan_protegidas_incluida_la_descarga_y_el_estado(self):
        self.emitir('FINANZAS')
        for rol in ('OPERACIONES', 'TECNICO', 'RRHH'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/facturacion/OB-0001/').status_code, 403, rol)
            self.assertEqual(self.client.get('/api/facturacion/OB-0001/pdf/').status_code, 403, rol)

    def test_sin_jwt_es_401_y_con_jwt_valido_de_un_rol_permitido_pasa(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post('/api/facturacion/emitir/OB-0001/').status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer token.invalido.xyz')
        self.assertEqual(self.client.post('/api/facturacion/emitir/OB-0001/').status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.users['TECNICO'])}")
        self.assertEqual(self.client.post('/api/facturacion/emitir/OB-0001/').status_code, 403)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.users['FINANZAS'])}")
        self.assertEqual(self.client.post('/api/facturacion/emitir/OB-0001/').status_code, 200)

    def test_el_rol_sale_del_servidor_no_de_lo_que_diga_el_cliente(self):
        self.as_role('TECNICO')
        r = self.client.post('/api/facturacion/emitir/OB-0001/', {'role': 'ADMIN', 'monto_neto': 1}, format='json', HTTP_X_ROLE='ADMIN')
        self.assertEqual(r.status_code, 403)

    def test_la_matriz_de_permisos_es_la_fuente(self):
        from erp.permisos_generados import PERMISOS
        self.assertEqual(PERMISOS['facturacion.emitir'], {'ADMIN', 'FINANZAS'})


class ReglasDeLaOrdenTests(DTEBase):
    def test_orden_inexistente_404(self):
        self.assertEqual(self.emitir(orden='OB-9999').status_code, 404)

    def test_solo_se_factura_una_obra_finalizada(self):
        self.crear_orden('OB-0002', estado='EN_CURSO')
        r = self.emitir(orden='OB-0002')
        self.assertEqual((r.status_code, r.data['code']), (422, 'orden_no_facturable'))

    def test_exige_presupuesto_aprobado_con_venta_positiva(self):
        self.crear_orden('OB-0002', presupuesto=None)
        self.crear_orden('OB-0003', presupuesto='ENVIADO')
        self.crear_orden('OB-0004', venta=0)
        for orden in ('OB-0002', 'OB-0003', 'OB-0004'):
            self.assertEqual(self.emitir(orden=orden).status_code, 422, orden)
        self.assertEqual(FacturaDTE.objects.count(), 0)

    def test_los_montos_salen_del_presupuesto_aprobado_y_no_del_cliente(self):
        self.as_role('FINANZAS')
        r = self.client.post('/api/facturacion/emitir/OB-0001/', {'neto': 5, 'total': 5}, format='json')
        self.assertEqual((r.data['neto'], r.data['iva'], r.data['total']), (1_000_000, 190_000, 1_190_000))
        self.assertEqual((r.data['receptor_rut'], r.data['receptor_razon_social']), ('76.115.402-8', 'Packing Cordillera S.A.'))

    def test_id_con_caracteres_raros_no_llega_a_la_vista(self):
        self.as_role('FINANZAS')
        for malo in ('OB-1;DROP', 'a' * 40, '../etc', 'OB 1'):
            self.assertEqual(self.client.post(f'/api/facturacion/emitir/{malo}/').status_code, 404, malo)


class EmisionTests(DTEBase):
    def test_emitir_deja_aceptado_con_folio_y_pdf_y_el_primer_folio_es_9999(self):
        r = self.emitir()
        self.assertEqual(r.status_code, 200)
        f = FacturaDTE.objects.get()
        self.assertEqual((f.estado_sii, f.folio_sii, f.pdf_url), ('ACEPTADO', 9999, '/api/facturacion/OB-0001/pdf/'))
        self.assertTrue(f.pdf_archivo.endswith('.pdf'))
        self.assertIsNotNone(f.emitido_en)
        self.assertEqual(r.data['folio_sii'], 9999)
        self.assertNotIn('xml_timbre', r.data)

    def test_los_folios_siguientes_avanzan(self):
        self.crear_orden('OB-0002')
        self.emitir()
        self.assertEqual(self.emitir(orden='OB-0002').data['folio_sii'], 10000)

    def test_no_se_emite_dos_veces(self):
        self.emitir()
        r = self.emitir()
        self.assertEqual((r.status_code, r.data['code']), (409, 'ya_emitida'))
        self.assertEqual(FacturaDTE.objects.count(), 1)

    def test_una_emision_en_proceso_bloquea_otra_pero_una_caida_se_puede_reintentar(self):
        from datetime import timedelta

        from django.utils import timezone
        FacturaDTE.objects.create(orden_id='OB-0001', estado_sii='PROCESANDO')
        r = self.emitir()
        self.assertEqual((r.status_code, r.data['code']), (409, 'en_proceso'))
        FacturaDTE.objects.update(actualizado_en=timezone.now() - timedelta(minutes=5))
        self.assertEqual(self.emitir().status_code, 200)

    def test_si_el_proveedor_falla_queda_rechazada_y_se_puede_reintentar(self):
        with patch.object(ProveedorSimulado, 'emitir', return_value={'exito': False, 'error': 'Certificado vencido'}):
            r = self.emitir()
        self.assertEqual((r.status_code, r.data['code'], r.data['estado_sii']), (502, 'rechazada', 'RECHAZADO'))
        self.assertIn('Certificado vencido', r.data['detail'])
        self.assertEqual(self.emitir().status_code, 200)  # el reintento funciona
        self.assertEqual(FacturaDTE.objects.get().estado_sii, 'ACEPTADO')

    def test_una_excepcion_del_proveedor_no_deja_la_orden_en_procesando(self):
        with patch.object(ProveedorSimulado, 'emitir', side_effect=ConnectionError('sin red')):
            r = self.emitir()
        self.assertEqual(r.status_code, 502)
        self.assertEqual(FacturaDTE.objects.get().estado_sii, 'RECHAZADO')

    def test_queda_auditado_quien_emitio(self):
        self.emitir('FINANZAS')
        a = [x.datos for x in Registro.objects.filter(tabla='auditoria')]
        self.assertEqual(len(a), 1)
        self.assertEqual((a[0]['entidad'], a[0]['accion'], a[0]['entidad_id'], a[0]['nuevo']['folio']), ('FacturaDTE', 'EMITIR', 'OB-0001', 9999))
        self.assertEqual(a[0]['usuario_id'], f"U-{self.users['FINANZAS'].pk:03d}")

    def test_no_se_puede_dejar_aceptada_sin_folio_ni_pdf_ni_repetir_folio(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            FacturaDTE.objects.create(orden_id='X-1', estado_sii='ACEPTADO')
        FacturaDTE.objects.create(orden_id='X-2', estado_sii='ACEPTADO', folio_sii=5, pdf_archivo='a.pdf')
        with self.assertRaises(IntegrityError), transaction.atomic():
            FacturaDTE.objects.create(orden_id='X-3', estado_sii='ACEPTADO', folio_sii=5, pdf_archivo='b.pdf')


class EstadoYPdfTests(DTEBase):
    def test_estado_antes_de_emitir_muestra_lo_que_se_facturaria(self):
        self.as_role('FINANZAS')
        r = self.client.get('/api/facturacion/OB-0001/')
        self.assertEqual((r.status_code, r.data['estado_sii'], r.data['emitible'], r.data['total']), (200, 'NO_EMITIDO', True, 1_190_000))

    def test_estado_de_una_orden_que_no_se_puede_facturar_dice_por_que(self):
        self.crear_orden('OB-0002', estado='EN_CURSO')
        self.as_role('FINANZAS')
        r = self.client.get('/api/facturacion/OB-0002/')
        self.assertEqual((r.data['emitible'], r.data['estado_sii']), (False, 'NO_EMITIDO'))
        self.assertIn('finalizada', r.data['motivo'])
        self.assertEqual(self.client.get('/api/facturacion/OB-9999/').status_code, 404)

    def test_estado_despues_de_emitir_ya_no_es_emitible(self):
        self.emitir()
        r = self.client.get('/api/facturacion/OB-0001/')
        self.assertEqual((r.data['estado_sii'], r.data['emitible'], r.data['folio_sii']), ('ACEPTADO', False, 9999))

    def test_descarga_del_pdf_es_un_pdf_real_privado_y_con_el_nombre_del_folio(self):
        self.emitir()
        r = self.client.get('/api/facturacion/OB-0001/pdf/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('factura-9999.pdf', r['Content-Disposition'])
        self.assertEqual(r['Cache-Control'], 'private, no-store')
        contenido = b''.join(r.streaming_content)
        self.assertTrue(contenido.startswith(b'%PDF-'))

    def test_si_el_archivo_ya_no_esta_en_disco_se_regenera(self):
        import os
        self.emitir()
        f = FacturaDTE.objects.get()
        os.remove(os.path.join(self.tmp.name, f.pdf_archivo))
        r = self.client.get('/api/facturacion/OB-0001/pdf/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(b''.join(r.streaming_content).startswith(b'%PDF-'))

    def test_sin_factura_aceptada_no_hay_pdf(self):
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get('/api/facturacion/OB-0001/pdf/').status_code, 404)


class AdaptadorTests(DTEBase):
    def datos(self, folio=9999):
        from datetime import date
        return DatosFactura('OB-0001', '76.115.402-8', 'Packing Cordillera S.A.', 'Cámara', 1000, 190, 1190, '/api/facturacion/OB-0001/pdf/', folio, date(2026, 11, 13))

    def test_el_proveedor_base_es_abstracto(self):
        with self.assertRaises(TypeError):
            ProveedorDTEBase()

    def test_el_simulado_cumple_el_contrato(self):
        r = ProveedorSimulado().emitir(self.datos())
        self.assertEqual((r['exito'], r['folio_sii'], r['pdf_url']), (True, 9999, '/api/facturacion/OB-0001/pdf/'))
        self.assertTrue(r['pdf_archivo'].endswith('.pdf'))

    def test_el_simulado_espera_dos_segundos_por_defecto_para_emular_la_red(self):
        from django.conf import settings
        self.assertEqual(settings.DTE_SIMULADO_RETRASO, 0)  # (aquí lo apaga la prueba)
        with override_settings(DTE_SIMULADO_RETRASO=2), patch('facturacion.servicios_dte.time.sleep') as dormir:
            ProveedorSimulado().emitir(self.datos())
        dormir.assert_called_once_with(2)

    def test_el_pdf_dice_que_es_simulado_y_tiene_los_datos(self):
        pdf = servicios_dte.generar_pdf_dte(self.datos(), 9999)
        self.assertTrue(pdf.startswith(b'%PDF-'))
        from io import BytesIO

        from pypdf import PdfReader
        texto = PdfReader(BytesIO(pdf)).pages[0].extract_text()
        for esperado in ('FACTURA ELECTRÓNICA', '9999', 'Packing Cordillera S.A.', '$1.190', 'SIMULADO'):
            self.assertIn(esperado, texto)

    def test_el_proveedor_se_elige_por_configuracion_y_uno_desconocido_se_rechaza(self):
        self.assertIsInstance(obtener_proveedor(), ProveedorSimulado)
        with override_settings(DTE_PROVEEDOR='inexistente'), self.assertRaises(RuntimeError):
            obtener_proveedor()
