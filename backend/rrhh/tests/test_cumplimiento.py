"""Historial de contrataciones, alertas del art. 159 N°4, rotación de personal e informe de rotación."""
from datetime import date, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from accounts.models import CustomUser
from accounts.tests.base import RoleTestCase
from rrhh import analitica
from rrhh import cumplimiento as cu
from rrhh.models import Contrato, FichaTrabajador

from .helpers import crear_ficha

HOY = date(2026, 11, 15)


def periodo(id, tipo, d_ini, d_fin=None, activo=False, renov=0, motivo='', sueldo=900_000):
    """Fechas como «días atrás» respecto de HOY (negativo = en el futuro)."""
    return cu.Periodo(id, tipo, HOY - timedelta(days=d_ini), None if d_fin is None else HOY - timedelta(days=d_fin), activo, renov, motivo, sueldo)


class TiemposTests(SimpleTestCase):
    def test_meses_atras_ajusta_el_fin_de_mes(self):
        self.assertEqual(cu.meses_atras(date(2026, 11, 15), 15), date(2025, 8, 15))
        self.assertEqual(cu.meses_atras(date(2026, 5, 31), 15), date(2025, 2, 28))

    def test_tiempo_total_ventana_de_15_meses_y_laguna(self):
        ps = [periodo(1, 'PLAZO_FIJO', 900, 801), periodo(2, 'PLAZO_FIJO', 200, 101)]
        t = cu.tiempos(ps, HOY)
        self.assertEqual(t['dias_trabajados_total'], 200)
        self.assertEqual(t['dias_trabajados_15_meses'], 100)   # el contrato antiguo queda fuera de la ventana
        self.assertEqual(t['contratos_plazo_15_meses'], 1)
        self.assertEqual(t['dias_desde_ultimo_termino'], 101)
        self.assertEqual(cu.lagunas(ps)[0]['dias'], 600)

    def test_con_contrato_activo_no_hay_laguna_y_los_dias_corren_hasta_hoy(self):
        t = cu.tiempos([periodo(1, 'INDEFINIDO', 99, None, activo=True)], HOY)
        self.assertEqual((t['dias_trabajados_total'], t['dias_desde_ultimo_termino']), (100, None))


class AlertasVigenteTests(SimpleTestCase):
    def nivel(self, **kw):
        return cu.evaluar_vigente(periodo(1, 'PLAZO_FIJO', kw.pop('ini', 150), kw.pop('fin'), activo=True, **kw), HOY)

    def test_primera_renovacion_por_vencer_es_alerta_critica_con_el_texto_legal(self):
        e = self.nivel(fin=-10, renov=1)
        self.assertEqual((e['nivel'], e['critica'], e['dias_para_vencer']), (cu.RIESGO_ALTO, True, 10))
        self.assertTrue(e['mensajes'][0].startswith('ADVERTENCIA LEGAL: Este trabajador ya cuenta con 1 renovación.'))

    def test_por_vencer_sin_renovaciones_es_riesgo_bajo(self):
        self.assertEqual(self.nivel(fin=-10)['nivel'], cu.RIESGO_BAJO)
        self.assertEqual(self.nivel(fin=-30)['nivel'], cu.RIESGO_BAJO)
        self.assertEqual(self.nivel(fin=-31)['nivel'], cu.SIN_RIESGO)
        self.assertEqual(self.nivel(fin=-16, renov=1)['nivel'], cu.RIESGO_BAJO)  # aún no entra en los 15 días críticos

    def test_vencido_y_activo_o_con_dos_renovaciones_es_paso_automatico(self):
        self.assertEqual(self.nivel(fin=5)['nivel'], cu.PASO_AUTOMATICO)
        self.assertEqual(self.nivel(fin=-60, renov=2)['nivel'], cu.PASO_AUTOMATICO)
        self.assertEqual(cu.estado_historial(periodo(1, 'PLAZO_FIJO', 150, 5, activo=True), HOY), cu.ALERTA_INDEFINIDO)

    def test_plazo_de_mas_de_un_anio_es_riesgo_alto(self):
        self.assertEqual(self.nivel(ini=300, fin=-100)['nivel'], cu.RIESGO_ALTO)

    def test_indefinido_y_obra_no_generan_alerta(self):
        for tipo in ('INDEFINIDO', 'OBRA_FAENA'):
            self.assertEqual(cu.evaluar_vigente(periodo(1, tipo, 500, -5, activo=True), HOY)['nivel'], cu.SIN_RIESGO)
        self.assertEqual(cu.estado_historial(periodo(1, 'PLAZO_FIJO', 500, 300), HOY), cu.FINALIZADO)


class RecontratacionTests(SimpleTestCase):
    def test_sin_historial_no_hay_riesgo(self):
        e = cu.evaluar_recontratacion([], HOY)
        self.assertEqual((e['nivel'], e['dias_espera']), (cu.SIN_RIESGO, 0))

    def test_tercer_contrato_en_15_meses_alerta_y_dice_cuanto_esperar(self):
        ps = [periodo(1, 'PLAZO_FIJO', 410, 350), periodo(2, 'PLAZO_FIJO', 200, 140)]
        e = cu.evaluar_recontratacion(ps, HOY)
        self.assertEqual((e['nivel'], e['supera_contratos'], e['supera_meses'], e['contratos_plazo_en_ventana']), (cu.RIESGO_ALTO, True, False, 2))
        # Es seguro cuando el primer contrato sale de la ventana de 15 meses.
        segura = date.fromisoformat(e['fecha_segura'])
        self.assertEqual(cu.meses_atras(segura, 15), HOY - timedelta(days=349))
        self.assertEqual(e['dias_espera'], (segura - HOY).days)
        self.assertEqual(cu.evaluar_recontratacion(ps, HOY, inicio=segura)['nivel'], cu.SIN_RIESGO)
        self.assertEqual(cu.evaluar_recontratacion(ps, HOY, inicio=segura - timedelta(days=1))['nivel'], cu.RIESGO_ALTO)
        self.assertIn(f'esperar {e["dias_espera"]} día(s)', e['mensajes'][-1])

    def test_doce_meses_en_quince_alerta_aunque_sea_el_segundo_contrato(self):
        e = cu.evaluar_recontratacion([periodo(1, 'PLAZO_FIJO', 330, 31)], HOY, termino=HOY + timedelta(days=89))  # 300 + 90 días
        self.assertEqual((e['nivel'], e['supera_contratos'], e['supera_meses'], e['dias_con_nuevo_contrato']), (cu.RIESGO_ALTO, False, True, 390))
        corto = cu.evaluar_recontratacion([periodo(1, 'PLAZO_FIJO', 330, 31)], HOY, termino=HOY + timedelta(days=29))
        self.assertEqual(corto['nivel'], cu.SIN_RIESGO)  # 300 + 30 días no llega a doce meses

    def test_las_dos_condiciones_juntas_son_la_presuncion_legal(self):
        ps = [periodo(1, 'PLAZO_FIJO', 410, 262), periodo(2, 'PLAZO_FIJO', 205, 38)]
        e = cu.evaluar_recontratacion(ps, HOY)
        self.assertEqual((e['nivel'], e['presuncion_legal']), (cu.PASO_AUTOMATICO, True))
        self.assertGreater(e['dias_espera'], 0)

    def test_los_contratos_indefinidos_o_por_obra_no_cuentan(self):
        ps = [periodo(1, 'INDEFINIDO', 400, 100), periodo(2, 'OBRA_FAENA', 90, 30)]
        self.assertEqual(cu.evaluar_recontratacion(ps, HOY)['nivel'], cu.SIN_RIESGO)


class RotacionTests(SimpleTestCase):
    def test_tasas_desglose_y_dotacion(self):
        personas = [
            {'id': 1, 'nombre': 'A', 'cargo': 'Técnico', 'periodos': [periodo(1, 'INDEFINIDO', 800, None, activo=True)]},
            {'id': 2, 'nombre': 'B', 'cargo': 'Técnico', 'periodos': [periodo(2, 'PLAZO_FIJO', 100, -50, activo=True)]},
            {'id': 3, 'nombre': 'C', 'cargo': 'Técnico', 'periodos': [periodo(3, 'INDEFINIDO', 700, 100, motivo='RENUNCIA', sueldo=1_000_000)]},
            {'id': 4, 'nombre': 'D', 'cargo': 'Bodeguero', 'periodos': [periodo(4, 'PLAZO_FIJO', 300, 200, motivo='VENCIMIENTO_PLAZO', sueldo=800_000)]},
        ]
        r = cu.rotacion(personas, HOY)
        self.assertEqual((r['dotacion_actual'], r['bajas_anual'], r['altas_anual']), (2, 2, 2))
        self.assertEqual((r['rotacion_voluntaria']['bajas'], r['rotacion_involuntaria']['bajas']), (1, 1))
        self.assertAlmostEqual(r['tasa_rotacion_anual'], 2 / r['dotacion_promedio_anual'] * 100, delta=2.5)  # la dotación promedio se informa redondeada
        self.assertEqual(r['dotacion_por_tipo']['PLAZO_FIJO'], {'personas': 1, 'porcentaje': 50.0})
        self.assertEqual(r['duracion_promedio_contratos_dias'], round((601 + 101) / 2))
        self.assertEqual(r['duracion_promedio_plazo_fijo_dias'], 101)
        self.assertEqual(r['costo_reemplazo_estimado'], 2_700_000)
        self.assertEqual(len(r['serie_mensual']), 12)
        self.assertEqual(sum(m['bajas'] for m in r['serie_mensual']), 2)
        self.assertEqual(r['serie_mensual'][-1]['mes'], '2026-11')

    def test_sin_datos_no_divide_por_cero(self):
        r = cu.rotacion([], HOY)
        self.assertEqual((r['tasa_rotacion_anual'], r['dotacion_actual'], r['cargo_mayor_fuga']), (0.0, 0, None))


class CumplimientoApiTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.hoy = timezone.localdate()

    def trabajador(self, email, tipo='PLAZO_FIJO', activo=True):
        u = CustomUser.objects.create_user(email, 'Clave-Segura-123', role='TECNICO', is_active=activo, first_name='Persona', last_name=email.split('@')[0])
        crear_ficha(u, tipo)
        return u

    def contrato(self, u, d_ini, d_fin, activo=False, **extra):
        return Contrato.objects.create(empleado=u, sueldo_base=900_000, fecha_inicio=self.hoy - timedelta(days=d_ini), fecha_termino=self.hoy - timedelta(days=d_fin),
                                       estado='ACTIVO' if activo else 'FINIQUITADO', **extra)

    def test_panel_lo_ven_rrhh_gerencia_y_auditor(self):
        u = self.trabajador('renueva@fyag.cl')
        self.contrato(u, 170, -9, activo=True, numero_renovacion=1)
        for rol in ('RRHH', 'ADMIN', 'AUDITOR'):
            self.as_role(rol)
            r = self.client.get('/api/rrhh/cumplimiento/')
            self.assertEqual(r.status_code, 200, rol)
            self.assertEqual(r.data['semaforo'][cu.RIESGO_ALTO], 1)
            self.assertEqual((r.data['alertas'][0]['nombre'], r.data['alertas'][0]['critica']), ('Persona renueva', True))
        for rol in ('FINANZAS', 'OPERACIONES', 'COMERCIAL', 'SUPERADMIN', 'TECNICO'):
            self.as_role(rol)
            for url in ('/api/rrhh/cumplimiento/', f'/api/rrhh/cumplimiento/historial/{u.pk}/', '/api/rrhh/cumplimiento/evaluar/?empleado=1', '/api/rrhh/ia-reporte-rotacion/'):
                self.assertEqual(self.client.get(url).status_code, 403, f'{rol} {url}')

    def test_historial_muestra_contratos_lagunas_y_ventana_segura(self):
        u = self.trabajador('ex@fyag.cl', activo=False)
        self.contrato(u, 410, 262, tipo='PLAZO_FIJO', motivo_termino='VENCIMIENTO_PLAZO')
        self.contrato(u, 205, 38, tipo='PLAZO_FIJO', motivo_termino='RENUNCIA')
        self.as_role('RRHH')
        r = self.client.get(f'/api/rrhh/cumplimiento/historial/{u.pk}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([c['estado'] for c in r.data['contratos']], ['FINALIZADO', 'FINALIZADO'])
        self.assertEqual(r.data['contratos'][0]['dias_trabajados_acumulados'], 168)   # el más reciente primero
        self.assertEqual(r.data['contratos'][0]['motivo_texto'], 'Renuncia')
        self.assertEqual((r.data['lagunas'][0]['dias'], r.data['dias_desde_ultimo_termino'], r.data['situacion']), (56, 38, 'EX_TRABAJADOR'))
        self.assertEqual(r.data['recontratacion']['nivel'], cu.PASO_AUTOMATICO)
        self.assertGreater(r.data['recontratacion']['dias_espera'], 0)
        por_rut = self.client.get(f'/api/rrhh/cumplimiento/evaluar/?rut={u.ficha.rut}')
        self.assertEqual((por_rut.status_code, por_rut.data['evaluacion']['dias_espera']), (200, r.data['recontratacion']['dias_espera']))
        self.assertEqual(self.client.get('/api/rrhh/cumplimiento/evaluar/?rut=1-9').status_code, 404)

    def test_crear_un_tercer_plazo_fijo_se_bloquea_hasta_confirmar(self):
        u = self.trabajador('vuelve@fyag.cl')
        self.contrato(u, 410, 262, tipo='PLAZO_FIJO')
        self.contrato(u, 205, 38, tipo='PLAZO_FIJO')
        self.as_role('RRHH')
        datos = {'empleado': u.pk, 'fecha_inicio': self.hoy.isoformat(), 'fecha_termino': (self.hoy + timedelta(days=89)).isoformat(), 'sueldo_base': 900000}
        r = self.client.post('/api/rrhh/contratos/', datos, format='json')
        self.assertEqual((r.status_code, r.data['code']), (409, 'riesgo_indefinido'))
        self.assertIn('ALERTA DE CUMPLIMIENTO LABORAL', r.data['detail'])
        self.assertGreater(r.data['evaluacion']['dias_espera'], 0)
        self.assertEqual(Contrato.objects.filter(empleado=u, estado='ACTIVO').count(), 0)
        r = self.client.post('/api/rrhh/contratos/', {**datos, 'confirmar_riesgo_legal': True}, format='json')
        self.assertEqual(r.status_code, 201)

    def test_un_primer_plazo_fijo_o_un_indefinido_se_crean_sin_alerta(self):
        self.as_role('RRHH')
        u = self.trabajador('nuevo@fyag.cl')
        datos = {'empleado': u.pk, 'fecha_inicio': self.hoy.isoformat(), 'fecha_termino': (self.hoy + timedelta(days=89)).isoformat(), 'sueldo_base': 900000}
        r = self.client.post('/api/rrhh/contratos/', datos, format='json')
        self.assertEqual((r.status_code, r.data['numero_renovacion'], r.data['tipo_contrato']), (201, 0, 'PLAZO_FIJO'))
        v = self.trabajador('planta@fyag.cl', tipo='INDEFINIDO')
        self.contrato(v, 410, 262, tipo='PLAZO_FIJO')
        self.contrato(v, 205, 38, tipo='PLAZO_FIJO')
        r = self.client.post('/api/rrhh/contratos/', {'empleado': v.pk, 'fecha_inicio': self.hoy.isoformat(), 'sueldo_base': 900000}, format='json')
        self.assertEqual(r.status_code, 201)  # indefinido: la regla no aplica

    def test_renovar_cuenta_la_primera_y_la_segunda_exige_aceptar_indefinido(self):
        u = self.trabajador('renueva@fyag.cl')
        c = self.contrato(u, 100, -10, activo=True)
        url = f'/api/rrhh/contratos/{c.pk}/renovar/'
        self.as_role('FINANZAS')
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 403)
        self.as_role('RRHH')
        self.assertEqual(self.client.post(url, {'fecha_termino': (self.hoy + timedelta(days=5)).isoformat()}, format='json').status_code, 400)   # no alarga
        self.assertEqual(self.client.post(url, {'fecha_termino': (self.hoy + timedelta(days=400)).isoformat()}, format='json').status_code, 400)  # más de un año
        r = self.client.post(url, {'fecha_termino': (self.hoy + timedelta(days=90)).isoformat()}, format='json')
        self.assertEqual((r.status_code, r.data['numero_renovacion']), (200, 1))
        r = self.client.post(url, {'fecha_termino': (self.hoy + timedelta(days=150)).isoformat()}, format='json')
        self.assertEqual((r.status_code, r.data['code']), (409, 'segunda_renovacion'))
        self.assertIn('CONTRATO INDEFINIDO', r.data['detail'])
        r = self.client.post(url, {'aceptar_indefinido': True}, format='json')
        self.assertEqual((r.status_code, r.data['tipo_contrato'], r.data['fecha_termino'], r.data['numero_renovacion']), (200, 'INDEFINIDO', None, 2))
        self.assertEqual(FichaTrabajador.objects.get(usuario=u).tipo_contrato, 'INDEFINIDO')

    def test_el_historial_conserva_el_tipo_aunque_la_ficha_cambie(self):
        u = self.trabajador('cambia@fyag.cl')
        c = self.contrato(u, 300, 200, tipo='PLAZO_FIJO')
        FichaTrabajador.objects.filter(usuario=u).update(tipo_contrato='INDEFINIDO')
        self.assertEqual(Contrato.objects.get(pk=c.pk).tipo_contrato, 'PLAZO_FIJO')


class InformeRotacionTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        hoy = timezone.localdate()
        u = CustomUser.objects.create_user('riesgo@fyag.cl', 'Clave-Segura-123', role='TECNICO', first_name='Ana', last_name='Riesgo')
        crear_ficha(u, 'PLAZO_FIJO')
        Contrato.objects.create(empleado=u, sueldo_base=900_000, fecha_inicio=hoy - timedelta(days=170), fecha_termino=hoy + timedelta(days=9), numero_renovacion=1)
        b = CustomUser.objects.create_user('baja@fyag.cl', 'Clave-Segura-123', role='TECNICO', first_name='Beto', last_name='Baja', is_active=False)
        crear_ficha(b, 'INDEFINIDO')
        Contrato.objects.create(empleado=b, sueldo_base=1_000_000, fecha_inicio=hoy - timedelta(days=500), fecha_termino=hoy - timedelta(days=60),
                                estado='FINIQUITADO', tipo='INDEFINIDO', motivo_termino='RENUNCIA')
        self.riesgo = u

    @override_settings(DEEPSEEK_API_KEY='')
    def test_sin_clave_usa_el_motor_analitico_con_todas_las_secciones(self):
        self.as_role('RRHH')
        r = self.client.get('/api/rrhh/ia-reporte-rotacion/')
        self.assertEqual((r.status_code, r.data['fuente']), (200, 'analitico'))
        self.assertIn('no está configurada', r.data['aviso'])
        md = r.data['markdown']
        for seccion in ('## 1. Diagnóstico de rotación', '## 2. Costos ocultos estimados', '## 3. Trabajadores en riesgo', '## 4. Recomendaciones para Gerencia General', '## 5. Recomendaciones para la Jefatura de RR. HH.'):
            self.assertIn(seccion, md)
        self.assertIn('Ana Riesgo', md)
        self.assertIn('$1.500.000', md)
        self.assertNotRegex(md, r'\d\.\d %')  # los porcentajes van con coma decimal  # 1,5 sueldos de la única baja
        self.assertEqual(r.data['rotacion']['bajas_anual'], 1)

    @override_settings(DEEPSEEK_API_KEY='clave-de-prueba')
    def test_con_ia_no_salen_nombres_ni_rut_y_el_servidor_los_repone(self):
        self.as_role('ADMIN')
        capturado = {}

        def falso(usuario, rol, tarea, mensajes, **kw):
            capturado['mensajes'] = mensajes
            return f'## 3. Trabajadores en riesgo\nTRAB-{self.riesgo.pk} debe regularizarse.'

        with patch('ai_agent.services._completar', side_effect=falso):
            r = self.client.get('/api/rrhh/ia-reporte-rotacion/')
        self.assertEqual((r.status_code, r.data['fuente'], r.data['aviso']), (200, 'ia', None))
        enviado = capturado['mensajes'][1]['content']
        self.assertIn(f'TRAB-{self.riesgo.pk}', enviado)
        for dato in ('Ana', 'Riesgo', self.riesgo.ficha.rut, 'riesgo@fyag.cl'):
            self.assertNotIn(dato, enviado)
        self.assertIn('Ana Riesgo debe regularizarse.', r.data['markdown'])

    @override_settings(DEEPSEEK_API_KEY='clave-de-prueba')
    def test_si_la_ia_falla_responde_igual_con_el_motor_analitico(self):
        from ai_agent.services import ServicioIAError
        self.as_role('AUDITOR')
        with patch('ai_agent.services._completar', side_effect=ServicioIAError('caído', 503, 'ai_unreachable')):
            r = self.client.get('/api/rrhh/ia-reporte-rotacion/')
        self.assertEqual((r.status_code, r.data['fuente']), (200, 'analitico'))
        self.assertIn('no respondió', r.data['aviso'])
        self.assertIn('## 1. Diagnóstico de rotación', r.data['markdown'])


class DemoCumplimientoTests(RoleTestCase):
    def test_los_casos_de_demostracion_muestran_las_dos_alertas_y_son_idempotentes(self):
        from rrhh.demo import cargar_demo_cumplimiento
        self.assertGreater(cargar_demo_cumplimiento(), 0)
        self.assertEqual(cargar_demo_cumplimiento(), 0)
        p = analitica.panel(timezone.localdate())
        por_nombre = {a['nombre']: a for a in p['alertas']}
        self.assertEqual((por_nombre['Renovación Demo']['nivel'], por_nombre['Renovación Demo']['critica']), (cu.RIESGO_ALTO, True))
        ex = por_nombre['Recontratación Demo']
        self.assertEqual((ex['situacion'], ex['nivel']), ('EX_TRABAJADOR', cu.PASO_AUTOMATICO))
        self.assertGreater(ex['dias_espera'], 0)
        self.assertEqual(p['rotacion']['bajas_anual'], 6)  # 4 bajas históricas + los 2 contratos terminados del ex trabajador
        self.assertEqual(p['rotacion']['rotacion_voluntaria']['bajas'], 3)
