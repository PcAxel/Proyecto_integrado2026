"""«IA, prepárame el reporte de finanzas»: la IA invoca la herramienta, el servidor arma el PowerPoint con los permisos del usuario y entrega
un archivo que el chat descarga solo, con el aviso fijado por el servidor."""
import io
import json
import zipfile
from datetime import datetime, timezone
from unittest.mock import patch

from django.test import override_settings
from pptx import Presentation
from pptx.enum.chart import XL_CHART_TYPE

from ai_agent import herramientas
from ai_agent.tests.test_preparar_factura import llamada
from ai_agent.tests.test_reportes import ReportesBase, mensaje
from erp.models import Registro
from facturacion.models import FacturaDTE

NOMBRE = 'generar_reporte_financiero'
AVISO = 'Reporte generado y descargado exitosamente.'


class FinanzasIABase(ReportesBase):
    def setUp(self):
        super().setUp()
        Registro.objects.create(tabla='facturas', rid='FC-0001', datos={'numero': '1', 'proveedor_id': 'PRV-001', 'fecha': '2026-11-03', 'neto': 1_000_000, 'iva': 190_000, 'total': 1_190_000, 'items': []})
        Registro.objects.create(tabla='proveedores', rid='PRV-001', datos={'razon_social': 'Frío Sur', 'rut': '77.777.777-7', 'activo': True})
        FacturaDTE.objects.create(orden_id='OB-1', folio_sii=1, estado_sii='ACEPTADO', monto_neto=3_000_000, monto_iva=570_000, monto_total=3_570_000, pdf_archivo='x.pdf',
                                  emitido_en=datetime(2026, 11, 5, 15, 0, tzinfo=timezone.utc))


class ReportePptEndpointTests(FinanzasIABase):
    def test_endpoint_entrega_un_pptx_con_graficos_nativos(self):
        self.as_role('FINANZAS')
        r = self.client.get('/api/finanzas/reporte-ppt/', {'mes': '2026-11'})
        self.assertEqual(r.status_code, 200)
        self.assertIn('presentationml', r['Content-Type'])
        prs = Presentation(io.BytesIO(r.content))
        self.assertEqual(len(prs.slides), 4)
        graficos = [sh.chart for sl in prs.slides for sh in sl.shapes if sh.has_chart]
        self.assertEqual([g.chart_type for g in graficos], [XL_CHART_TYPE.COLUMN_CLUSTERED, XL_CHART_TYPE.COLUMN_CLUSTERED])
        self.assertEqual([s.name for s in graficos[0].series], ['Neto', 'IVA'])
        self.assertEqual(list(graficos[0].series[0].values), [3.0, 1.0])  # ingresos y gastos netos en millones
        textos = ' '.join(sh.text_frame.text for sl in prs.slides for sh in sl.shapes if sh.has_text_frame)
        self.assertIn('noviembre de 2026', textos)

    def test_excel_y_word_con_las_mismas_cifras(self):
        self.as_role('FINANZAS')
        for formato, marca in (('xlsx', 'xl/charts/chart1.xml'), ('docx', 'word/document.xml')):
            r = self.client.get('/api/finanzas/reporte/', {'formato': formato, 'mes': '2026-11'})
            self.assertEqual(r.status_code, 200, formato)
            self.assertIn('spreadsheetml' if formato == 'xlsx' else 'wordprocessingml', r['Content-Type'])
            self.assertIn(marca, zipfile.ZipFile(io.BytesIO(r.content)).namelist(), formato)
        texto = zipfile.ZipFile(io.BytesIO(self.client.get('/api/finanzas/reporte/', {'formato': 'docx', 'mes': '2026-11'}).content)).read('word/document.xml').decode()
        self.assertIn('noviembre de 2026', texto)
        self.assertIn('3.000.000', texto)  # ingresos netos del mes
        self.assertEqual(self.client.get('/api/finanzas/reporte/', {'formato': 'pdf'}).status_code, 400)

    def test_sin_token_o_sin_rol_no_entra(self):
        self.client.credentials()
        self.assertIn(self.client.get('/api/finanzas/reporte/', {'formato': 'xlsx'}).status_code, (401, 403))
        for rol in ('JEFE_BODEGA', 'RRHH', 'OPERACIONES', 'COMERCIAL'):
            self.as_role(rol)
            for formato in ('pptx', 'xlsx', 'docx'):
                self.assertEqual(self.client.get('/api/finanzas/reporte/', {'formato': formato}).status_code, 403, f'{rol} {formato}')

    def test_permisos_y_validacion(self):
        for rol, esperado in (('ADMIN', 200), ('AUDITOR', 200), ('JEFE_BODEGA', 403), ('RRHH', 403), ('OPERACIONES', 403)):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/finanzas/reporte-ppt/', {'mes': '2026-11'}).status_code, esperado, rol)
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get('/api/finanzas/reporte-ppt/', {'mes': '2026-13'}).status_code, 400)


class HerramientaIATests(FinanzasIABase):
    def test_solo_los_roles_con_facturacion_reciben_la_herramienta(self):
        nombres = lambda rol: [t['function']['name'] for t in herramientas.herramientas_para(self.users[rol])]
        for rol in ('ADMIN', 'FINANZAS', 'AUDITOR'):
            self.assertIn(NOMBRE, nombres(rol), rol)
        for rol in ('JEFE_BODEGA', 'OPERACIONES', 'RRHH', 'TECNICO', 'COMERCIAL'):
            self.assertNotIn(NOMBRE, nombres(rol), rol)

    def test_el_modelo_pide_la_herramienta_y_el_navegador_recibe_la_ruta_del_endpoint(self):
        fake = self.ia(mensaje(tool_calls=[llamada({'mes': '2026-11', 'formato': 'xlsx'}, NOMBRE)]), mensaje('Listo, con cifras inventadas: $999 y http://malo'))
        r = self.pedir('FINANZAS', 'IA, prepárame el reporte de finanzas en Excel')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['respuesta'], AVISO)  # el texto lo fija el servidor, no el modelo
        a = r.data['archivo']
        self.assertEqual((a['formato'], a['autodescarga'], a['url']), ('xlsx', True, '/finanzas/reporte/?formato=xlsx&mes=2026-11'))
        tool = json.loads(next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content'])
        self.assertNotIn('finanzas/reporte', json.dumps(tool))  # el modelo nunca ve la ruta ni ningún token
        d = self.client.get('/api' + a['url'])  # el navegador la pide con la sesión de la persona
        self.assertEqual(d.status_code, 200)
        self.assertIn('xl/charts/chart1.xml', zipfile.ZipFile(io.BytesIO(d.content)).namelist())

    def test_formato_por_defecto_es_powerpoint(self):
        self.ia(mensaje(tool_calls=[llamada({}, NOMBRE)]), mensaje('ok'))
        a = self.pedir('FINANZAS', 'prepárame el reporte de finanzas').data['archivo']
        self.assertEqual(a['formato'], 'pptx')
        self.assertEqual(len(Presentation(io.BytesIO(self.client.get('/api' + a['url']).content)).slides), 4)

    def test_argumentos_invalidos_no_generan_descarga(self):
        for args in ({'mes': '2026-13'}, {'formato': 'pdf'}, {'mes': "2026-11&formato=../x"}):
            self.ia(mensaje(tool_calls=[llamada(args, NOMBRE)]), mensaje('No se pudo.'))
            self.assertNotIn('archivo', self.pedir('FINANZAS', 'reporte de finanzas').data, args)

    def test_un_rol_sin_permiso_no_puede_invocarla_aunque_el_modelo_la_pida(self):
        self.ia(mensaje(tool_calls=[llamada({}, NOMBRE)]), mensaje('No puedo.'))
        r = self.pedir('OPERACIONES', 'reporte de finanzas')
        self.assertNotIn('archivo', r.data)

    @override_settings(DEEPSEEK_API_KEY='')
    def test_sin_modelo_el_respaldo_local_tambien_lo_entrega_en_el_formato_pedido(self):
        casos = (('IA, prepárame el reporte de finanzas', 'pptx'), ('reporte de finanzas en excel', 'xlsx'), ('prepárame el informe financiero en word', 'docx'))
        for texto, formato in casos:
            r = self.pedir('FINANZAS', texto)
            self.assertEqual((r.data['motor'], r.data['respuesta'], r.data['archivo']['formato']), ('local', AVISO, formato), texto)
        self.assertNotIn('archivo', self.pedir('OPERACIONES', 'reporte de finanzas').data)
