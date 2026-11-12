"""Reportes descargables del agente: Function Calling, extracción filtrada por rol, archivos reales y descarga privada. DeepSeek se simula."""
import io
import json
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

from django.test import override_settings
from docx import Document
from openpyxl import load_workbook
from pptx import Presentation

from accounts.models import CustomUser
from accounts.tests.base import RoleTestCase
from ai_agent import herramientas
from ai_agent.reportes import datos, generadores
from erp.models import Registro


def llamada(conjunto='presupuestos', formato='xlsx', nombre='generar_reporte', crudo=None):
    args = crudo if crudo is not None else json.dumps({'conjunto': conjunto, 'formato': formato})
    return SimpleNamespace(id='call_1', function=SimpleNamespace(name=nombre, arguments=args))


def mensaje(contenido='', tool_calls=None):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=contenido, tool_calls=tool_calls), finish_reason='stop')], usage=SimpleNamespace(total_tokens=10))


class FakeIATools:
    """Responde en orden; guarda cada llamada (incluidos `tools` y los mensajes `tool`)."""

    def __init__(self, *respuestas):
        self.respuestas, self.llamadas = list(respuestas), []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        self.llamadas.append(kw)
        return self.respuestas.pop(0)


class ReportesBase(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        p = override_settings(REPORTES_IA_DIR=self.tmp.name)
        p.enable()
        self.addCleanup(p.disable)
        Registro.objects.create(tabla='clientes', rid='CLI-001', datos={'razon_social': 'Packing Cordillera S.A.', 'activo': True})
        Registro.objects.create(tabla='presupuestos', rid='PRE-0001', datos={
            'titulo': '=HYPERLINK("http://malo")', 'cliente_id': 'CLI-001', 'estado': 'APROBADO', 'fecha': '2026-09-08', 'precio_venta_neto': 1_000_000,
            'materiales': [{'cantidad': 2, 'costo_unitario': 100_000}], 'mano_obra': [{'horas': 10, 'costo_hora_hombre': 10_000}], 'adicionales': [{'monto': 50_000}]})
        Registro.objects.create(tabla='personal', rid='T-01', datos={'nombre': 'Jorge Quezada', 'cargo': 'Técnico', 'activo': True, 'rut': '15.387.421-2', 'costo_hora_hombre': 11_500})

    def ia(self, *respuestas):
        fake = FakeIATools(*respuestas)
        p = patch('ai_agent.services.get_client', return_value=fake)
        p.start()
        self.addCleanup(p.stop)
        return fake

    def pedir(self, rol, texto='Genérame un reporte de presupuestos en Excel'):
        self.as_role(rol)
        return self.client.post('/api/ai/chat/', {'mensajes': [{'role': 'user', 'content': texto}]}, format='json')


class ExtraccionTests(ReportesBase):
    def test_finanzas_ve_costo_y_margen_y_los_calcula(self):
        c = datos.get_resumen_presupuestos(self.users['FINANZAS'])
        self.assertEqual([k for k, _, _ in c.columnas][-2:], ['costo', 'margen'])
        self.assertEqual((c.filas[0]['costo'], c.filas[0]['margen']), (350_000, 650_000))
        self.assertEqual(c.filas[0]['cliente'], 'Packing Cordillera S.A.')

    def test_quien_no_puede_leer_la_tabla_recibe_error_y_no_datos(self):
        for rol in ('RRHH', 'TECNICO'):
            with self.assertRaises(datos.SinPermiso, msg=rol):
                datos.get_resumen_presupuestos(self.users[rol])

    def test_rrhh_ve_el_personal_con_sus_datos_laborales(self):
        c = datos.get_listado_personal(self.users['RRHH'])
        self.assertEqual(c.filas[0]['nombre'], 'Jorge Quezada')
        self.assertIn('rut', [k for k, _, _ in c.columnas])

    def test_operaciones_ve_los_nombres_pero_no_el_rut(self):
        # Misma regla que la pantalla: leen la tabla (para armar equipos) pero los RUT y fecha de ingreso ni siquiera llegan al reporte (el costo hora sí: Operaciones tiene `costos.ver`).
        c = datos.get_listado_personal(self.users['OPERACIONES'])
        self.assertEqual(c.filas[0]['nombre'], 'Jorge Quezada')
        self.assertFalse({'rut', 'fecha_ingreso'} & {k for k, _, _ in c.columnas})
        self.assertNotIn('15.387.421-2', json.dumps(c.filas))

    def test_el_tecnico_no_tiene_herramientas(self):
        self.assertEqual(datos.disponibles(self.users['TECNICO']), [])
        self.assertEqual(herramientas.herramientas_para(self.users['TECNICO']), [])

    def test_cada_rol_solo_ofrece_a_la_ia_lo_que_puede_ver(self):
        self.assertEqual(datos.disponibles(self.users['RRHH']), ['personal', 'flota'])
        self.assertEqual(datos.disponibles(self.users['OPERACIONES']), ['presupuestos', 'personal', 'obras'])
        enum = herramientas.herramientas_para(self.users['RRHH'])[0]['function']['parameters']['properties']['conjunto']['enum']
        self.assertEqual(enum, ['personal', 'flota'])


class GeneradoresTests(ReportesBase):
    def generar(self, formato, rol='FINANZAS'):
        u = self.users[rol]
        info = generadores.generar(formato, datos.get_resumen_presupuestos(u), u)
        return generadores.ruta_de(u, info['token'], formato), info

    def test_xlsx_es_valido_con_cabecera_numeros_y_sin_formulas_inyectadas(self):
        ruta, info = self.generar('xlsx')
        ws = load_workbook(ruta).active
        valores = [[c.value for c in fila] for fila in ws.iter_rows()]
        cabecera = next(i for i, f in enumerate(valores) if f[0] == 'N°')
        fila = valores[cabecera + 1]
        self.assertEqual(fila[0], 'PRE-0001')
        self.assertEqual(ws.cell(cabecera + 2, 6).value, 1_000_000)  # numérico, no texto
        celda = ws.cell(cabecera + 2, 2)
        self.assertEqual(celda.data_type, 's')  # «=HYPERLINK…» queda como texto, no como fórmula
        self.assertTrue(info['nombre'].endswith('.xlsx'))

    def test_docx_y_pptx_son_documentos_validos(self):
        ruta, _ = self.generar('docx')
        d = Document(str(ruta))
        self.assertEqual(d.tables[0].rows[1].cells[0].text, 'PRE-0001')
        self.assertIn('$1.000.000', [c.text for c in d.tables[0].rows[1].cells])
        ruta, _ = self.generar('pptx')
        self.assertGreaterEqual(len(Presentation(str(ruta)).slides), 2)

    def test_pptx_se_reparte_en_diapositivas_y_avisa_lo_omitido(self):
        for i in range(2, 130):
            Registro.objects.create(tabla='presupuestos', rid=f'PRE-{i:04d}', datos={'titulo': f'P{i}', 'estado': 'BORRADOR', 'precio_venta_neto': 1})
        ruta, _ = self.generar('pptx')
        prs = Presentation(str(ruta))
        self.assertEqual(len(prs.slides), 1 + 10)  # portada + 100 filas / 10 por diapositiva
        ultimo = ' '.join(s.text_frame.text for s in prs.slides[-1].shapes if s.has_text_frame)
        self.assertIn('y 29 filas más', ultimo)

    def test_un_usuario_no_alcanza_el_archivo_de_otro_ni_con_token_o_formato_raros(self):
        _, info = self.generar('xlsx', 'FINANZAS')
        otro = self.users['ADMIN']
        self.assertIsNone(generadores.ruta_de(otro, info['token'], 'xlsx'))
        f = self.users['FINANZAS']
        for token, formato in (('../../etc/passwd', 'xlsx'), (info['token'], 'sh'), (info['token'], '../x'), ('', 'xlsx'), (None, 'xlsx')):
            self.assertIsNone(generadores.ruta_de(f, token, formato), (token, formato))

    def test_los_archivos_vencidos_se_borran(self):
        import os, time
        ruta, _ = self.generar('xlsx')
        viejo = time.time() - 48 * 3600
        os.utime(ruta, (viejo, viejo))
        generadores.limpiar_vencidos()
        self.assertFalse(ruta.exists())


class ChatConReportesTests(ReportesBase):
    def test_flujo_completo_la_ia_pide_la_herramienta_django_genera_y_el_chat_entrega_el_enlace(self):
        fake = self.ia(mensaje(tool_calls=[llamada()]),
                       mensaje(json.dumps({'respuesta_texto': 'Aquí tienes tu reporte de presupuestos.', 'accion': 'ninguna', 'ruta': None, 'termino_busqueda': None})))
        r = self.pedir('FINANZAS')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['respuesta'], 'Aquí tienes tu reporte de presupuestos.')
        archivo = r.data['archivo']
        self.assertEqual((archivo['formato'], archivo['filas']), ('xlsx', 1))
        self.assertTrue(archivo['url'].startswith('/ai/reportes/'))
        # el modelo recibió las tools en la 1.ª llamada y NUNCA la URL en el resultado de la herramienta
        self.assertEqual(fake.llamadas[0]['tools'][0]['function']['name'], 'generar_reporte')
        tool_msg = next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')
        self.assertNotIn('/ai/reportes', tool_msg['content'])
        self.assertNotIn('tools', fake.llamadas[1])
        # y el archivo se descarga con la sesión del dueño
        d = self.client.get('/api' + archivo['url'])
        self.assertEqual(d.status_code, 200)
        self.assertIn('attachment', d['Content-Disposition'])
        self.assertEqual(load_workbook(io.BytesIO(b''.join(d.streaming_content))).active['A1'].value, 'Resumen de presupuestos')

    def test_otro_usuario_no_puede_descargar_el_reporte(self):
        self.ia(mensaje(tool_calls=[llamada()]), mensaje('Listo'))
        archivo = self.pedir('FINANZAS').data['archivo']
        self.as_role('ADMIN')
        self.assertEqual(self.client.get('/api' + archivo['url']).status_code, 404)
        self.client.logout()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api' + archivo['url']).status_code, 401)

    def test_si_el_modelo_pide_datos_que_el_rol_no_ve_no_se_genera_nada(self):
        self.ia(mensaje(tool_calls=[llamada('presupuestos', 'xlsx')]), mensaje('No tengo acceso a eso.'))
        r = self.pedir('RRHH')  # RRHH no ve presupuestos: el servidor lo rechaza aunque el modelo lo pida
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('archivo', r.data)
        self.assertEqual(list(__import__('pathlib').Path(self.tmp.name).glob('*/*')), [])

    def test_argumentos_hostiles_del_modelo_se_rechazan(self):
        for crudo in ('{"conjunto": "presupuestos; DROP TABLE x", "formato": "xlsx"}', '{"conjunto": "presupuestos", "formato": "exe"}', 'no es json', '[]', '{"conjunto": {"a": 1}}'):
            self.ia(mensaje(tool_calls=[llamada(crudo=crudo)]), mensaje('No pude.'))
            r = self.pedir('FINANZAS')
            self.assertEqual(r.status_code, 200, crudo)
            self.assertNotIn('archivo', r.data, crudo)

    def test_una_herramienta_inventada_no_se_ejecuta(self):
        self.ia(mensaje(tool_calls=[llamada(nombre='ejecutar_sql')]), mensaje('No puedo.'))
        r = self.pedir('ADMIN')
        self.assertNotIn('archivo', r.data)

    def test_solo_se_ejecuta_una_herramienta_por_turno(self):
        dos = [llamada(), SimpleNamespace(id='call_2', function=SimpleNamespace(name='generar_reporte', arguments='{"conjunto":"obras","formato":"docx"}'))]
        fake = self.ia(mensaje(tool_calls=dos), mensaje('Listo'))
        self.pedir('ADMIN')
        asistente = fake.llamadas[1]['messages'][-2]
        self.assertEqual(len(asistente['tool_calls']), 1)

    def test_si_el_modelo_no_redacta_el_aviso_igual_se_entrega_el_archivo(self):
        self.ia(mensaje(tool_calls=[llamada()]), mensaje(''), mensaje(''))
        r = self.pedir('FINANZAS')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['respuesta'], 'Aquí tienes tu reporte.')
        self.assertIn('archivo', r.data)

    def test_conversacion_normal_sigue_igual_y_no_trae_archivo(self):
        self.ia(mensaje(json.dumps({'respuesta_texto': 'Hola', 'accion': 'ninguna', 'ruta': None, 'termino_busqueda': None})))
        r = self.pedir('FINANZAS', 'Hola')
        self.assertEqual((r.data['respuesta'], r.data.get('archivo')), ('Hola', None))

    def test_el_tecnico_no_recibe_tools_y_conserva_el_modo_json(self):
        fake = self.ia(mensaje(json.dumps({'respuesta_texto': 'Hola', 'accion': 'ninguna', 'ruta': None, 'termino_busqueda': None})))
        self.pedir('TECNICO', 'Genérame un reporte')
        self.assertNotIn('tools', fake.llamadas[0])
        self.assertEqual(fake.llamadas[0]['response_format'], {'type': 'json_object'})
        self.assertNotIn('REPORTES DESCARGABLES', fake.llamadas[0]['messages'][0]['content'])

    def test_descargar_exige_sesion_y_valida_el_formato(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/ai/reportes/' + 'a' * 32 + '/?formato=xlsx').status_code, 401)
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get('/api/ai/reportes/' + 'a' * 32 + '/?formato=py').status_code, 404)
