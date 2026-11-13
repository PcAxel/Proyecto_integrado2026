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
from ai_agent.reportes.datos import PeriodoInvalido, periodo_de
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
        self.assertEqual(load_workbook(io.BytesIO(b''.join(d.streaming_content))).active['A2'].value, 'Resumen de presupuestos')

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


HOY = __import__('datetime').date(2026, 11, 13)


class PeriodoTests(ReportesBase):
    def setUp(self):
        super().setUp()
        for rid, fecha in (('PRE-0002', '2026-10-05'), ('PRE-0003', '2026-10-31'), ('PRE-0004', '2026-09-30'), ('PRE-0005', '2025-10-10'), ('PRE-0006', None)):
            Registro.objects.create(tabla='presupuestos', rid=rid, datos={'titulo': rid, 'estado': 'APROBADO', 'fecha': fecha, 'precio_venta_neto': 100})

    def ids(self, **kw):
        c = datos.extraer(self.users['FINANZAS'], 'presupuestos', periodo_de(hoy=HOY, **kw))
        return sorted(f['id'] for f in c.filas)

    def test_mes_y_anio_filtran_solo_ese_mes(self):
        self.assertEqual(self.ids(mes=10, anio=2026), ['PRE-0002', 'PRE-0003'])  # incluye el 31; deja fuera el 30 de septiembre y octubre de 2025

    def test_solo_el_mes_asume_el_anio_en_curso_y_acepta_el_nombre(self):
        self.assertEqual(self.ids(mes='octubre'), ['PRE-0002', 'PRE-0003'])
        self.assertEqual(self.ids(mes='10'), ['PRE-0002', 'PRE-0003'])

    def test_solo_el_anio_trae_el_ano_completo(self):
        self.assertEqual(self.ids(anio=2025), ['PRE-0005'])
        self.assertEqual(len(self.ids(anio=2026)), 4)  # el de 2026 sin fecha y el de 2025 quedan fuera; los que no tienen fecha no entran al filtrar

    def test_rango_de_fechas_inclusivo_y_abierto_por_un_lado(self):
        self.assertEqual(self.ids(fecha_inicio='2026-09-30', fecha_fin='2026-10-05'), ['PRE-0002', 'PRE-0004'])
        self.assertEqual(self.ids(fecha_inicio='2026-10-31'), ['PRE-0003'])
        self.assertEqual(self.ids(fecha_fin='2025-12-31'), ['PRE-0005'])

    def test_sin_filtro_trae_todo_incluso_lo_sin_fecha(self):
        c = datos.extraer(self.users['FINANZAS'], 'presupuestos')
        self.assertEqual(len(c.filas), 6)
        self.assertEqual((c.periodo, c.periodo_slug), ('', ''))

    def test_el_periodo_queda_en_el_resumen_y_el_titulo_del_archivo(self):
        c = datos.extraer(self.users['FINANZAS'], 'presupuestos', periodo_de(mes=10, anio=2026, hoy=HOY))
        self.assertEqual(c.resumen[0], ('Período', 'octubre de 2026', 'texto'))
        info = generadores.generar('xlsx', c, self.users['FINANZAS'])
        self.assertIn('_202610_', info['nombre'])

    def test_filtros_invalidos(self):
        for kw in ({'mes': 13}, {'mes': 0, 'anio': 2026}, {'mes': 'brumario'}, {'anio': 1800}, {'anio': 'x'}, {'mes': True}, {'fecha_inicio': '10/10/2026'},
                   {'fecha_inicio': '2026-10-31', 'fecha_fin': '2026-10-01'}, {'mes': 10, 'fecha_inicio': '2026-10-01'}, {'anio': 2026, 'fecha_fin': '2026-10-01'}):
            with self.assertRaises(PeriodoInvalido, msg=str(kw)):
                periodo_de(hoy=HOY, **kw)

    def test_el_filtro_respeta_los_permisos_el_personal_sin_fecha_de_ingreso_no_se_filtra(self):
        with self.assertRaises(PeriodoInvalido):
            datos.extraer(self.users['OPERACIONES'], 'personal', periodo_de(anio=2026, hoy=HOY))  # Operaciones no ve fecha de ingreso

    def test_obras_se_filtran_por_inicio(self):
        Registro.objects.create(tabla='obras', rid='OB-1', datos={'nombre': 'A', 'estado': 'EN_CURSO', 'tipo': 'MANTENCION', 'fecha_inicio': '2026-10-02'})
        Registro.objects.create(tabla='obras', rid='OB-2', datos={'nombre': 'B', 'estado': 'EN_CURSO', 'tipo': 'MANTENCION', 'fecha_inicio': '2026-08-02'})
        c = datos.extraer(self.users['ADMIN'], 'obras', periodo_de(mes=10, anio=2026, hoy=HOY))
        self.assertEqual([f['id'] for f in c.filas], ['OB-1'])


class HerramientaConFiltrosTests(ReportesBase):
    def test_el_esquema_de_la_tool_acepta_los_filtros_de_fecha_como_opcionales(self):
        f = herramientas.herramientas_para(self.users['FINANZAS'])[0]['function']['parameters']
        self.assertEqual(set(f['properties']), {'conjunto', 'formato', 'mes', 'anio', 'fecha_inicio', 'fecha_fin'})
        self.assertEqual(f['required'], ['conjunto', 'formato'])
        self.assertEqual((f['properties']['mes']['minimum'], f['properties']['mes']['maximum']), (1, 12))

    def test_el_prompt_explica_los_filtros_y_trae_la_fecha_de_hoy(self):
        from ai_agent import prompts
        p = prompts.system_prompt_agente('FINANZAS', [], con_reportes=True, hoy=HOY)
        self.assertIn('fecha_inicio', p)
        self.assertIn('Hoy es 2026-11-13', p)

    def test_con_filtro_solo_se_genera_lo_del_periodo(self):
        Registro.objects.create(tabla='presupuestos', rid='PRE-0002', datos={'titulo': 'otro', 'estado': 'APROBADO', 'fecha': '2025-01-05', 'precio_venta_neto': 5})
        fake = self.ia(mensaje(tool_calls=[llamada(crudo=json.dumps({'conjunto': 'presupuestos', 'formato': 'xlsx', 'mes': 9, 'anio': 2026}))]), mensaje('Listo'))
        r = self.pedir('FINANZAS', 'solo de septiembre')
        self.assertEqual(r.data['archivo']['filas'], 1)  # el presupuesto de la fixture es del 2026-09-08
        self.assertIn('202609', r.data['archivo']['nombre'])

    def test_periodo_sin_registros_no_genera_archivo_y_se_lo_dice_al_modelo(self):
        fake = self.ia(mensaje(tool_calls=[llamada(crudo=json.dumps({'conjunto': 'presupuestos', 'formato': 'docx', 'mes': 2, 'anio': 2020}))]), mensaje('No hay datos en ese mes.'))
        r = self.pedir('FINANZAS', 'febrero 2020')
        self.assertNotIn('archivo', r.data)
        tool_msg = next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')
        self.assertIn('No hay registros de presupuestos en febrero de 2020', tool_msg['content'])

    def test_filtro_invalido_del_modelo_vuelve_como_error_y_no_genera_nada(self):
        for args in ({'mes': 13}, {'mes': 10, 'fecha_inicio': '2026-10-01'}, {'fecha_inicio': 'ayer'}, {'anio': '2026; DROP TABLE'}):
            fake = self.ia(mensaje(tool_calls=[llamada(crudo=json.dumps({'conjunto': 'presupuestos', 'formato': 'xlsx', **args}))]), mensaje('Corrijo.'))
            r = self.pedir('FINANZAS')
            self.assertNotIn('archivo', r.data, args)
            tool_msg = next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')
            self.assertIn('Filtro de fecha inválido', tool_msg['content'])


class FormatoCorporativoTests(ReportesBase):
    def setUp(self):
        super().setUp()
        for i in range(2, 6):
            Registro.objects.create(tabla='presupuestos', rid=f'PRE-{i:04d}', datos={'titulo': f'P{i}', 'estado': 'APROBADO', 'fecha': '2026-10-0%d' % i, 'precio_venta_neto': 100_000 * i,
                                                                                    'materiales': [{'cantidad': 1, 'costo_unitario': 10_000 * i}]})

    def generar(self, formato):
        u = self.users['FINANZAS']
        c = datos.get_resumen_presupuestos(u)
        info = generadores.generar(formato, c, u)
        return c, generadores.ruta_de(u, info['token'], formato)

    def test_excel_tiene_tabla_nativa_encabezados_en_negrita_y_fila_de_totales(self):
        c, ruta = self.generar('xlsx')
        ws = load_workbook(ruta).active
        self.assertEqual(len(ws.tables), 1)
        tabla = next(iter(ws.tables.values()))
        n = len(c.filas)
        cab = int(tabla.ref.split(':')[0][1:])
        self.assertEqual(tabla.ref, f'A{cab}:H{cab + n}')  # 8 columnas con costo y margen
        self.assertTrue(all(ws.cell(cab, j).font.bold for j in range(1, 9)))
        self.assertEqual(ws.cell(cab, 1).fill.fgColor.rgb[-6:], '0B2A3F')
        total = ws.cell(cab + n + 1, 1)
        self.assertEqual(total.value, 'TOTAL')
        self.assertTrue(total.font.bold)
        # la suma de los montos (precio de venta, costo y margen) es una fórmula SUBTOTAL sobre las filas de datos
        self.assertEqual(ws.cell(cab + n + 1, 6).value, f'=SUBTOTAL(109,F{cab + 1}:F{cab + n})')
        self.assertEqual(ws.cell(cab + n + 1, 6).number_format, '"$"#,##0')
        self.assertEqual(ws.freeze_panes, f'A{cab + 1}')

    def test_excel_ajusta_el_ancho_de_las_columnas(self):
        _, ruta = self.generar('xlsx')
        ws = load_workbook(ruta).active
        anchos = {k: d.width for k, d in ws.column_dimensions.items()}
        self.assertGreater(anchos['B'], anchos['A'])  # el título es más largo que el código
        self.assertTrue(all(10 <= w <= 55 for w in anchos.values()))

    def test_excel_sin_columnas_de_monto_igual_lleva_su_fila_total(self):
        u = self.users['ADMIN']
        Registro.objects.create(tabla='obras', rid='OB-1', datos={'nombre': 'A', 'estado': 'EN_CURSO', 'tipo': 'MANTENCION', 'fecha_inicio': '2026-10-02'})
        info = generadores.generar('xlsx', datos.get_listado_obras(u), u)
        ws = load_workbook(generadores.ruta_de(u, info['token'], 'xlsx')).active
        self.assertEqual([ws.cell(r, 1).value for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value == 'TOTAL'], ['TOTAL'])

    def test_word_tiene_tabla_real_con_bordes_encabezado_sombreado_y_total(self):
        from docx.oxml.ns import qn
        c, ruta = self.generar('docx')
        d = Document(str(ruta))
        self.assertEqual(len(d.tables), 1)
        t = d.tables[0]
        self.assertEqual(t.style.name, 'Table Grid')  # bordes en todas las celdas
        cab = t.rows[0]
        self.assertTrue(all(cel.paragraphs[0].runs[0].bold for cel in cab.cells))
        self.assertTrue(all(cel._tc.tcPr.find(qn('w:shd')).get(qn('w:fill')) == '0B2A3F' for cel in cab.cells))
        self.assertIsNotNone(cab._tr.trPr.find(qn('w:tblHeader')))  # el encabezado se repite en cada página
        ultima = t.rows[-1]
        self.assertEqual(ultima.cells[0].text, 'TOTAL')
        venta = sum(f['venta'] for f in c.filas)
        self.assertEqual(ultima.cells[5].text, '$' + f'{venta:,}'.replace(',', '.'))
        self.assertTrue(ultima.cells[5].paragraphs[0].runs[0].bold)
        self.assertEqual(len(t.rows), len(c.filas) + 2)  # encabezado + datos + total

    def test_word_lleva_membrete_y_numero_de_pagina(self):
        _, ruta = self.generar('docx')
        d = Document(str(ruta))
        self.assertIn('Frío y Agroindustria', d.sections[0].header.paragraphs[0].text)
        self.assertIn('PAGE', d.sections[0].footer._element.xml)
