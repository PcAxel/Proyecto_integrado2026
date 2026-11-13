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


# ───────────────────────── Proyección de stock y compra crítica ─────────────────────────
from datetime import timedelta

from ai_agent.reportes import stock as stock_mod

HOY2 = HOY


def _dia(n):
    return (HOY2 - timedelta(days=n)).isoformat() + 'T10:00:00'


class StockBase(ReportesBase):
    def articulo(self, rid='ART-900', sku='TST-001', nombre='Válvula de prueba', minimo=20, costo=1000, activo=True, proveedor=None):
        Registro.objects.create(tabla='articulos', rid=rid, datos={'sku': sku, 'nombre': nombre, 'categoria': 'X', 'unidad': 'un', 'costo_unitario': costo, 'stock_minimo': minimo,
                                                                   'proveedor_id': proveedor, 'activo': activo})

    def mov(self, rid, articulo, tipo, cantidad, dias_atras, **extra):
        signo = -1 if tipo == 'SALIDA_OBRA' else 1
        Registro.objects.create(tabla='cardex', rid=rid, datos={'tipo': tipo, 'fecha': _dia(dias_atras), 'articulo_id': articulo, 'cantidad': cantidad, 'costo_unitario': 1000,
                                                                'signo': signo, 'obra_id': 'OB-1' if signo < 0 else None, 'usuario_id': 'U-001', 'referencia': 'x',
                                                                'reversa_de': None, 'salida_origen_id': None, **extra})


class ProyeccionTests(StockBase):
    def setUp(self):
        super().setUp()
        self.articulo()
        self.mov('MOV-1', 'ART-900', 'ENTRADA_COMPRA', 250, 45)
        for i, dias in enumerate((28, 20, 12, 5, 1), 1):  # 5 salidas de 30 = 150 en los últimos 30 días
            self.mov(f'MOV-{i + 1}', 'ART-900', 'SALIDA_OBRA', 30, dias)
        self.u = self.users['FINANZAS']

    def proyectar(self):
        return stock_mod.proyectar(self.u, stock_mod.buscar_articulo(self.u, 'TST-001')[1], hoy=HOY2)

    def test_el_calculo_lo_hace_django_stock_consumo_promedio_y_dias(self):
        p = self.proyectar()
        self.assertEqual((float(p.stock), float(p.consumo), float(p.promedio), p.dias), (100.0, 150.0, 5.0, 20))
        self.assertEqual(p.agota, HOY2 + timedelta(days=20))
        self.assertIn('Stock actual: 100 un.', p.texto)
        self.assertIn('Consumo diario promedio: 5 un.', p.texto)
        self.assertIn('Se agotará en 20 días (aprox. el 03-12-2026).', p.texto)
        self.assertIn('Quedará bajo el stock mínimo en 16 días.', p.texto)  # (100 − 20) / 5

    def test_lo_anterior_a_30_dias_no_cuenta_y_lo_que_vuelve_a_bodega_resta(self):
        self.mov('MOV-20', 'ART-900', 'SALIDA_OBRA', 500, 31)  # fuera de la ventana: no es consumo
        self.mov('MOV-21', 'ART-900', 'ENTRADA_COMPRA', 500, 31)
        self.mov('MOV-22', 'ART-900', 'REINGRESO_SOBRANTE', 10, 2, salida_origen_id='MOV-6')
        p = self.proyectar()
        self.assertEqual(float(p.consumo), 140.0)  # 150 − 10 que volvieron

    def test_una_salida_reversada_no_es_consumo(self):
        self.mov('MOV-30', 'ART-900', 'REVERSA', 30, 0, reversa_de='MOV-2', signo=1)
        self.assertEqual(float(self.proyectar().consumo), 120.0)

    def test_sin_consumo_no_se_proyecta_agotamiento(self):
        Registro.objects.filter(tabla='cardex', rid__in=[f'MOV-{i}' for i in range(2, 7)]).delete()
        p = self.proyectar()
        self.assertIsNone(p.dias)
        self.assertIn('No hubo consumo', p.texto)

    def test_sin_stock(self):
        self.mov('MOV-40', 'ART-900', 'SALIDA_OBRA', 100, 0)
        p = self.proyectar()
        self.assertIn('ya está sin stock', p.texto)
        self.assertEqual(p.dias, 0)

    def test_la_serie_para_el_grafico_cierra_en_el_stock_actual_y_la_proyeccion_baja_hasta_cero(self):
        p = self.proyectar()
        reales = [r for _, r, _ in p.serie if r is not None]
        self.assertEqual((len(reales), reales[-1]), (31, 100.0))
        proy = [x for _, _, x in p.serie if x is not None]
        self.assertEqual((proy[0], proy[-1]), (100.0, 0.0))
        self.assertTrue(all(a >= b for a, b in zip(proy, proy[1:])))
        c = stock_mod.conjunto_proyeccion(p)
        self.assertEqual(c.grafico['categoria'], 'fecha')
        self.assertFalse(c.totales)

    def test_busqueda_por_sku_nombre_parcial_sin_tildes_y_ambigua(self):
        self.articulo('ART-901', 'TST-002', 'Válvula grande de prueba')
        self.assertEqual(stock_mod.buscar_articulo(self.u, 'tst-001')[0], 'uno')
        self.assertEqual(stock_mod.buscar_articulo(self.u, 'valvula grande')[1]['sku'], 'TST-002')
        estado, lista = stock_mod.buscar_articulo(self.u, 'valvula')
        self.assertEqual((estado, [a['sku'] for a in lista]), ('varios', ['TST-001', 'TST-002']))
        self.assertEqual(stock_mod.buscar_articulo(self.u, 'inexistente')[0], 'ninguno')
        self.assertEqual(stock_mod.buscar_articulo(self.u, '   ')[0], 'ninguno')

    def test_roles_sin_acceso_a_bodega(self):
        for rol in ('TECNICO', 'RRHH'):
            with self.assertRaises(datos.SinPermiso, msg=rol):
                stock_mod.buscar_articulo(self.users[rol], 'TST-001')


class CompraCriticaTests(StockBase):
    def setUp(self):
        super().setUp()
        Registro.objects.create(tabla='proveedores', rid='PRV-1', datos={'razon_social': 'Frigotec Ltda.', 'activo': True})
        Registro.objects.create(tabla='proveedores', rid='PRV-2', datos={'razon_social': 'Alfa SpA', 'activo': True})
        self.articulo('ART-1', 'AAA-001', 'Crítico exacto', minimo=10, costo=2000, proveedor='PRV-1')   # stock 10 = mínimo → crítico
        self.articulo('ART-2', 'AAA-002', 'Crítico bajo', minimo=10, costo=500, proveedor='PRV-2')       # stock 3
        self.articulo('ART-3', 'AAA-003', 'Sano', minimo=10, costo=900, proveedor='PRV-1')               # stock 11 → no
        self.articulo('ART-4', 'AAA-004', 'Inactivo', minimo=10, costo=900, proveedor='PRV-1', activo=False)
        for i, (art, q) in enumerate((('ART-1', 10), ('ART-2', 3), ('ART-3', 11), ('ART-4', 1)), 1):
            self.mov(f'MOV-{i}', art, 'ENTRADA_COMPRA', q, 3)
        self.u = self.users['FINANZAS']

    def test_django_elige_los_productos_y_calcula_las_cantidades(self):
        c, total = stock_mod.compra_critica(self.u, hoy=HOY2)
        self.assertEqual(total, 2)
        por_sku = {f['sku']: f for f in c.filas}
        self.assertEqual(set(por_sku), {'AAA-001', 'AAA-002'})  # ni el sano ni el inactivo
        self.assertEqual(por_sku['AAA-001']['cantidad'], 30)    # 4 × 10 − 10
        self.assertEqual(por_sku['AAA-002']['cantidad'], 37)    # 4 × 10 − 3
        self.assertEqual(por_sku['AAA-002']['subtotal'], 37 * 500)
        self.assertEqual([f['proveedor'] for f in c.filas], ['Alfa SpA', 'Frigotec Ltda.'])  # ordenado por proveedor
        neto = 30 * 2000 + 37 * 500
        self.assertEqual({e: v for e, v, _ in c.resumen}['Neto'], neto)
        self.assertEqual({e: v for e, v, _ in c.resumen}['Total'], neto + round(neto * 0.19))
        self.assertEqual(c.firmas, ['Solicitado por', 'Aprobado por'])

    def test_sin_criticos_no_hay_filas(self):
        Registro.objects.filter(tabla='articulos', rid__in=['ART-1', 'ART-2']).delete()
        self.assertEqual(stock_mod.compra_critica(self.u, hoy=HOY2)[0].filas, [])

    def test_solo_roles_de_compras(self):
        for rol in ('TECNICO', 'RRHH'):
            with self.assertRaises(datos.SinPermiso, msg=rol):
                stock_mod.compra_critica(self.users[rol])

    def test_la_orden_de_compra_en_excel_tiene_tabla_totales_y_firmas(self):
        c, _ = stock_mod.compra_critica(self.u, hoy=HOY2)
        info = generadores.generar('xlsx', c, self.u)
        ws = load_workbook(generadores.ruta_de(self.u, info['token'], 'xlsx')).active
        celdas = [str(cl.value) for fila in ws.iter_rows() for cl in fila if cl.value is not None]
        self.assertIn('Orden de Compra - FYAG', celdas)
        self.assertIn('Solicitado por', celdas)
        self.assertIn('Aprobado por', celdas)
        self.assertEqual(len(ws.tables), 1)
        tabla = next(iter(ws.tables.values()))
        cab = int(tabla.ref.split(':')[0][1:])
        # el costo unitario es pesos pero NO se suma; el subtotal sí
        self.assertIsNone(ws.cell(cab + 3, 8).value)
        self.assertTrue(str(ws.cell(cab + 3, 9).value).startswith('=SUBTOTAL(109,I'))

    def test_la_orden_de_compra_en_word_tiene_tabla_totales_y_espacio_de_firma(self):
        c, _ = stock_mod.compra_critica(self.u, hoy=HOY2)
        info = generadores.generar('docx', c, self.u)
        d = Document(str(generadores.ruta_de(self.u, info['token'], 'docx')))
        textos = [p.text for p in d.paragraphs] + [cl.text for t in d.tables for r in t.rows for cl in r.cells]
        self.assertTrue(any('Solicitado por' in x for x in textos) and any('Aprobado por' in x for x in textos))
        self.assertTrue(any('______' in x for x in textos))
        self.assertEqual(d.tables[0].rows[-1].cells[0].text, 'TOTAL')


class ToolsStockEnElChatTests(StockBase):
    def setUp(self):
        super().setUp()
        self.articulo()
        self.mov('MOV-1', 'ART-900', 'ENTRADA_COMPRA', 250, 45)
        for i, dias in enumerate((28, 20, 12, 5, 1), 1):
            self.mov(f'MOV-{i + 1}', 'ART-900', 'SALIDA_OBRA', 30, dias)

    def llamar(self, nombre, args, final='Listo'):
        c = SimpleNamespace(id='call_1', function=SimpleNamespace(name=nombre, arguments=json.dumps(args)))
        return self.ia(mensaje(tool_calls=[c]), mensaje(final))

    def test_cada_rol_recibe_solo_las_tools_que_puede_usar(self):
        nombres = lambda rol: [t['function']['name'] for t in herramientas.herramientas_para(self.users[rol])]
        self.assertEqual(nombres('FINANZAS'), ['generar_reporte', 'analizar_proyeccion_stock', 'generar_borrador_compra_critico'])
        self.assertEqual(nombres('RRHH'), ['generar_reporte'])
        self.assertEqual(nombres('TECNICO'), [])

    def test_esquemas_simples(self):
        t = {x['function']['name']: x['function']['parameters'] for x in herramientas.herramientas_para(self.users['ADMIN'])}
        self.assertEqual(t['generar_borrador_compra_critico']['required'], [])  # clic único: sin parámetros obligatorios
        self.assertEqual(set(t['generar_borrador_compra_critico']['properties']), {'formato'})
        self.assertEqual(t['analizar_proyeccion_stock']['required'], ['producto'])
        self.assertEqual(set(t['analizar_proyeccion_stock']['properties']), {'producto', 'formato'})

    def test_la_ia_recibe_el_texto_ya_calculado_y_el_chat_lo_muestra_tal_cual(self):
        fake = self.llamar('analizar_proyeccion_stock', {'producto': 'TST-001'}, 'Te quedan unos 20 días de stock.')
        r = self.pedir('FINANZAS', '¿cuánto dura la válvula de prueba?')
        self.assertEqual(r.status_code, 200)
        self.assertIn('Se agotará en 20 días', r.data['calculo'])
        self.assertNotIn('archivo', r.data)
        tool = json.loads(next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content'])
        self.assertIn('Consumo diario promedio: 5 un.', tool['texto'])  # la IA solo lee y presenta
        self.assertNotIn('_calculo', tool)

    def test_el_prompt_prohibe_que_el_modelo_calcule(self):
        fake = self.llamar('analizar_proyeccion_stock', {'producto': 'TST-001'})
        self.pedir('FINANZAS', 'x')
        sistema = fake.llamadas[0]['messages'][0]['content']
        self.assertIn('TÚ NO CALCULAS NADA', sistema)
        self.assertIn('generar_borrador_compra_critico', sistema)

    def test_producto_ambiguo_o_inexistente_vuelve_como_error_y_sin_calculo(self):
        self.articulo('ART-901', 'TST-002', 'Válvula grande de prueba')
        for producto in ('válvula', 'no existe nada así'):
            fake = self.llamar('analizar_proyeccion_stock', {'producto': producto}, 'Dime cuál.')
            r = self.pedir('FINANZAS')
            self.assertNotIn('calculo', r.data)
            self.assertIn('Pídele al usuario', next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content'])

    def test_con_formato_entrega_el_archivo_con_grafico_nativo_en_los_tres_formatos(self):
        import zipfile
        for formato in ('xlsx', 'docx', 'pptx'):
            self.llamar('analizar_proyeccion_stock', {'producto': 'TST-001', 'formato': formato})
            r = self.pedir('FINANZAS')
            self.assertEqual(r.data['archivo']['formato'], formato)
            self.assertIn('calculo', r.data)
            ruta = generadores.ruta_de(self.users['FINANZAS'], r.data['archivo']['url'].split('/')[3], formato)
            z = zipfile.ZipFile(ruta)
            if formato == 'xlsx':
                self.assertTrue(any(n.startswith('xl/charts/chart') for n in z.namelist()))
                self.assertIn('lineChart', z.read('xl/charts/chart1.xml').decode())  # Excel: líneas
                ws = load_workbook(ruta).active
                self.assertEqual(len(ws._charts), 1)
            elif formato == 'docx':
                self.assertIn('word/charts/chart1.xml', z.namelist())
                self.assertIn('barChart', z.read('word/charts/chart1.xml').decode())  # Word: barras
                self.assertIn('word/embeddings/Microsoft_Excel_Sheet1.xlsx', z.namelist())
                Document(str(ruta))  # sigue abriéndose con python-docx
            else:
                grafico = [s for sl in Presentation(str(ruta)).slides for s in sl.shapes if s.has_chart]
                self.assertEqual(len(grafico), 1)
                self.assertIn('COLUMN_CLUSTERED', str(grafico[0].chart.chart_type))  # PowerPoint: barras verticales

    def test_compra_critica_en_un_clic_sin_parametros_ni_url_para_el_modelo(self):
        Registro.objects.create(tabla='articulos', rid='ART-7', datos={'sku': 'CRI-001', 'nombre': 'Crítico', 'categoria': 'X', 'unidad': 'un', 'costo_unitario': 100, 'stock_minimo': 10, 'activo': True})
        fake = self.ia(mensaje(tool_calls=[SimpleNamespace(id='c', function=SimpleNamespace(name='generar_borrador_compra_critico', arguments='{}'))]), mensaje('Borrador listo.'))
        r = self.pedir('FINANZAS', 'prepara las compras')
        self.assertEqual(r.data['archivo']['formato'], 'xlsx')
        self.assertIn('Productos críticos: 1', r.data['calculo'])
        tool = next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content']
        self.assertNotIn('/ai/reportes', tool)

    def test_compra_critica_sin_criticos_no_genera_archivo(self):
        fake = self.ia(mensaje(tool_calls=[SimpleNamespace(id='c', function=SimpleNamespace(name='generar_borrador_compra_critico', arguments='{"formato":"docx"}'))]), mensaje('Todo bien.'))
        r = self.pedir('FINANZAS')
        self.assertNotIn('archivo', r.data)
        self.assertIn('no hace falta comprar', r.data['calculo'])

    def test_argumentos_hostiles_y_roles_sin_permiso(self):
        for nombre, args in (('analizar_proyeccion_stock', {'producto': 'x' * 500}), ('analizar_proyeccion_stock', {'producto': {'a': 1}}), ('analizar_proyeccion_stock', {'producto': 'TST-001', 'formato': 'exe'}),
                             ('generar_borrador_compra_critico', {'formato': 'pptx'})):
            self.llamar(nombre, args, 'No puedo.')
            r = self.pedir('FINANZAS')
            self.assertNotIn('archivo', r.data, (nombre, args))
            self.assertNotIn('calculo', r.data, (nombre, args))
        # un rol sin acceso a bodega no puede ejecutar la tool aunque el modelo la pida
        self.llamar('generar_borrador_compra_critico', {}, 'No tienes acceso.')
        r = self.pedir('RRHH')
        self.assertNotIn('archivo', r.data)


class TotalesVisiblesSinCalcularTests(ReportesBase):
    def test_el_total_trae_su_valor_calculado_para_los_visores_que_no_calculan_formulas(self):
        for i in range(2, 5):
            Registro.objects.create(tabla='presupuestos', rid=f'PRE-{i:04d}', datos={'titulo': f'P{i}', 'estado': 'APROBADO', 'fecha': '2026-10-05', 'precio_venta_neto': 100_000 * i})
        u = self.users['FINANZAS']
        c = datos.get_resumen_presupuestos(u)
        info = generadores.generar('xlsx', c, u)
        ruta = generadores.ruta_de(u, info['token'], 'xlsx')
        ws_formula, ws_valor = load_workbook(ruta).active, load_workbook(ruta, data_only=True).active
        fila = next(r for r in range(1, ws_formula.max_row + 1) if ws_formula.cell(r, 1).value == 'TOTAL')
        self.assertTrue(str(ws_formula.cell(fila, 6).value).startswith('=SUBTOTAL('))   # sigue siendo una fórmula (respeta los filtros)
        self.assertEqual(ws_valor.cell(fila, 6).value, sum(f['venta'] for f in c.filas))  # y trae el resultado ya calculado
