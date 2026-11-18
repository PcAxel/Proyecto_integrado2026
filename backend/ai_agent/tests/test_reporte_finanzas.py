"""«IA, prepárame el reporte de finanzas»: la IA invoca la herramienta, el servidor arma el PowerPoint con los permisos del usuario y entrega
un archivo que el chat descarga solo, con el aviso fijado por el servidor."""
import io
import json
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

NOMBRE = 'generar_reporte_finanzas'
AVISO = 'Aquí tienes el reporte ejecutivo del mes con los gráficos actualizados.'


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

    def test_el_modelo_pide_la_herramienta_y_el_servidor_fija_el_aviso_y_la_descarga(self):
        fake = self.ia(mensaje(tool_calls=[llamada({'mes': '2026-11'}, NOMBRE)]), mensaje('Listo, ahí va tu reporte con cifras inventadas: $999'))
        r = self.pedir('FINANZAS', 'IA, prepárame el reporte de finanzas')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['respuesta'], AVISO)  # el texto lo fija el servidor, no el modelo
        a = r.data['archivo']
        self.assertEqual((a['formato'], a['autodescarga']), ('pptx', True))
        tool = json.loads(next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content'])
        self.assertNotIn('url', json.dumps(tool))  # el modelo nunca ve el enlace
        d = self.client.get('/api' + a['url'])  # y el archivo se baja con la sesión de quien lo pidió
        self.assertEqual(d.status_code, 200)
        self.assertEqual(len(Presentation(io.BytesIO(b''.join(d.streaming_content))).slides), 4)

    def test_otro_usuario_no_puede_bajar_el_archivo(self):
        self.ia(mensaje(tool_calls=[llamada({}, NOMBRE)]), mensaje('ok'))
        url = self.pedir('FINANZAS', 'prepárame el reporte de finanzas').data['archivo']['url']
        self.as_role('ADMIN')
        self.assertEqual(self.client.get('/api' + url).status_code, 404)

    def test_mes_invalido_no_genera_archivo(self):
        self.ia(mensaje(tool_calls=[llamada({'mes': '2026-13'}, NOMBRE)]), mensaje('El mes no es válido.'))
        r = self.pedir('FINANZAS', 'reporte de finanzas')
        self.assertNotIn('archivo', r.data)

    def test_un_rol_sin_permiso_no_puede_invocarla_aunque_el_modelo_la_pida(self):
        self.ia(mensaje(tool_calls=[llamada({}, NOMBRE)]), mensaje('No puedo.'))
        r = self.pedir('OPERACIONES', 'reporte de finanzas')
        self.assertNotIn('archivo', r.data)

    @override_settings(DEEPSEEK_API_KEY='')
    def test_sin_modelo_el_respaldo_local_tambien_lo_entrega(self):
        r = self.pedir('FINANZAS', 'IA, prepárame el reporte de finanzas')
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data['motor'], r.data['respuesta']), ('local', AVISO))
        self.assertTrue(r.data['archivo']['autodescarga'])
        self.as_role('OPERACIONES')
        self.assertNotIn('archivo', self.client.post('/api/ai/chat/', {'mensajes': [{'role': 'user', 'content': 'reporte de finanzas'}]}, format='json').data)
