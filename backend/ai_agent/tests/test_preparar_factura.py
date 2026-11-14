"""El agente lleva a Finanzas/Administrador hasta la obra a facturar, pero NUNCA emite: la emisión es un clic humano en la pantalla de la obra."""
import json
from types import SimpleNamespace

from ai_agent import herramientas, prompts
from ai_agent.tests.test_reportes import FakeIATools, ReportesBase, mensaje
from erp.models import Registro
from facturacion import busqueda
from facturacion.models import FacturaDTE


def llamada(args, nombre='preparar_factura'):
    return SimpleNamespace(id='call_1', function=SimpleNamespace(name=nombre, arguments=args if isinstance(args, str) else json.dumps(args)))


class FacturaIABase(ReportesBase):
    def setUp(self):
        super().setUp()
        self.cliente('CLI-001', 'Packing Cordillera S.A.', '76.115.402-8')
        self.cliente('CLI-002', 'Lácteos Valle del Itata Ltda.', '78.054.267-5')
        self.obra('OB-0001', 'Cámara de frío N°3', 'CLI-001')
        self.obra('OB-0002', 'Sala de proceso refrigerada', 'CLI-002')
        self.obra('OB-0003', 'Mantención de cámaras', 'CLI-002', estado='EN_CURSO')

    def cliente(self, rid, razon, rut):
        Registro.objects.update_or_create(tabla='clientes', rid=rid, defaults={'datos': {'razon_social': razon, 'rut': rut, 'activo': True}})

    def obra(self, rid, nombre, cliente, estado='FINALIZADA', venta=1_000_000, presupuesto='APROBADO'):
        pid = f'PRF-{rid[-4:]}'
        if presupuesto:
            Registro.objects.create(tabla='presupuestos', rid=pid, datos={'titulo': nombre, 'estado': presupuesto, 'precio_venta_neto': venta, 'cliente_id': cliente})
        Registro.objects.create(tabla='obras', rid=rid, datos={'nombre': nombre, 'estado': estado, 'cliente_id': cliente, 'presupuesto_id': pid if presupuesto else None})

    def llamar(self, args, final='Te llevo a la obra para que la revises.'):
        return self.ia(mensaje(tool_calls=[llamada(args)]), mensaje(final))


class RolesYBusquedaTests(FacturaIABase):
    def test_solo_administrador_y_finanzas_reciben_la_herramienta(self):
        nombres = lambda rol: [t['function']['name'] for t in herramientas.herramientas_para(self.users[rol])]
        self.assertIn('preparar_factura', nombres('ADMIN'))
        self.assertIn('preparar_factura', nombres('FINANZAS'))
        for rol in ('OPERACIONES', 'RRHH', 'TECNICO'):
            self.assertNotIn('preparar_factura', nombres(rol), rol)

    def test_el_esquema_es_simple(self):
        t = next(x['function']['parameters'] for x in herramientas.herramientas_para(self.users['FINANZAS']) if x['function']['name'] == 'preparar_factura')
        self.assertEqual((set(t['properties']), t['required']), ({'trabajo'}, ['trabajo']))

    def test_encuentra_por_codigo_con_cualquier_escritura(self):
        for texto in ('OB-0001', 'ob-1', 'OB 0001', 'ob_01', ' Ob-0001 '):
            r = busqueda.buscar_para_facturar(self.users['FINANZAS'], texto)
            self.assertEqual((r.estado, r.obra.id), ('uno', 'OB-0001'), texto)

    def test_encuentra_por_nombre_o_cliente_sin_tildes_ni_mayusculas(self):
        self.assertEqual(busqueda.buscar_para_facturar(self.users['FINANZAS'], 'camara de frio').obra.id, 'OB-0001')
        self.assertEqual(busqueda.buscar_para_facturar(self.users['FINANZAS'], 'lacteos valle').obra.id, 'OB-0002')  # la otra obra de ese cliente no está finalizada

    def test_si_hay_varias_prefiere_la_que_se_puede_facturar(self):
        r = busqueda.buscar_para_facturar(self.users['FINANZAS'], 'itata')
        self.assertEqual((r.estado, r.obra.id, r.obra.situacion), ('uno', 'OB-0002', 'facturable'))

    def test_varias_facturables_pide_precisar_y_ninguna_coincidencia(self):
        self.obra('OB-0004', 'Cámara de frío N°4', 'CLI-001')
        r = busqueda.buscar_para_facturar(self.users['FINANZAS'], 'camara de frio')
        self.assertEqual((r.estado, sorted(c.id for c in r.lista)), ('varios', ['OB-0001', 'OB-0004']))
        self.assertEqual(busqueda.buscar_para_facturar(self.users['FINANZAS'], 'no existe').estado, 'ninguno')
        self.assertEqual(busqueda.buscar_para_facturar(self.users['FINANZAS'], '   ').estado, 'ninguno')

    def test_distingue_facturable_emitida_y_no_facturable(self):
        FacturaDTE.objects.create(orden_id='OB-0001', estado_sii='ACEPTADO', folio_sii=9999, pdf_archivo='x.pdf', monto_neto=1, monto_iva=0, monto_total=1)
        self.assertEqual(busqueda.buscar_para_facturar(self.users['ADMIN'], 'OB-0001').obra.situacion, 'emitida')
        self.assertEqual(busqueda.buscar_para_facturar(self.users['ADMIN'], 'OB-0003').obra.situacion, 'no_facturable')
        self.assertEqual(busqueda.buscar_para_facturar(self.users['ADMIN'], 'OB-0002').obra.situacion, 'facturable')


class FlujoEnElChatTests(FacturaIABase):
    def test_lleva_a_la_obra_con_ancla_y_nunca_emite(self):
        fake = self.llamar({'trabajo': 'cámara de frío'})
        r = self.pedir('FINANZAS', 'quiero emitir la factura de la cámara de frío')
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data['accion'], r.data['ruta'], r.data['ancla']), ('navegar', '/erp/obras/OB-0001', 'facturacion'))
        self.assertIn('lista para facturar (aún NO emitida)', r.data['calculo'])
        self.assertIn('Total: $1.190.000', r.data['calculo'])
        self.assertEqual(FacturaDTE.objects.count(), 0)  # nada emitido
        self.assertNotIn('archivo', r.data)
        tool = json.loads(next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content'])
        self.assertIn('NO se emitió nada', tool['nota'])
        self.assertNotIn('_navegacion', tool)  # el destino no pasa por el modelo

    def test_el_destino_lo_pone_el_servidor_aunque_el_modelo_conteste_otra_cosa(self):
        self.ia(mensaje(tool_calls=[llamada({'trabajo': 'OB-0002'})]),
                mensaje(json.dumps({'respuesta_texto': 'ok', 'accion': 'navegar', 'ruta': '/erp/usuarios', 'termino_busqueda': None})))
        r = self.pedir('ADMIN')
        self.assertEqual((r.data['ruta'], r.data['ancla']), ('/erp/obras/OB-0002', 'facturacion'))

    def test_si_el_modelo_no_redacta_hay_un_texto_de_reserva(self):
        self.ia(mensaje(tool_calls=[llamada({'trabajo': 'OB-0001'})]), mensaje(''), mensaje(''))
        r = self.pedir('FINANZAS')
        self.assertIn('revises', r.data['respuesta'])
        self.assertEqual(r.data['ruta'], '/erp/obras/OB-0001')

    def test_obra_que_aun_no_se_puede_facturar_igual_se_lleva_con_el_motivo(self):
        self.llamar({'trabajo': 'OB-0003'})
        r = self.pedir('FINANZAS')
        self.assertEqual(r.data['ruta'], '/erp/obras/OB-0003')
        self.assertIn('Todavía no se puede facturar', r.data['calculo'])
        self.assertIn('finalizada', r.data['calculo'])

    def test_ya_emitida_se_lleva_para_ver_el_folio(self):
        FacturaDTE.objects.create(orden_id='OB-0001', estado_sii='ACEPTADO', folio_sii=9999, pdf_archivo='x.pdf', monto_neto=1, monto_iva=0, monto_total=1)
        self.llamar({'trabajo': 'OB-0001'})
        r = self.pedir('FINANZAS')
        self.assertIn('folio 9999', r.data['calculo'])
        self.assertEqual(r.data['ruta'], '/erp/obras/OB-0001')

    def test_ambigua_o_inexistente_no_navega_y_el_modelo_pide_precisar(self):
        self.obra('OB-0004', 'Cámara de frío N°4', 'CLI-001')
        for trabajo in ('cámara de frío', 'nada que ver'):
            fake = self.llamar({'trabajo': trabajo}, 'Dime cuál.')
            r = self.pedir('FINANZAS')
            self.assertNotEqual(r.data.get('accion'), 'navegar', trabajo)
            self.assertNotIn('ancla', r.data)
            self.assertIn('Pídele', next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content'])

    def test_argumentos_hostiles(self):
        for args in ({'trabajo': 'x' * 500}, {'trabajo': {'a': 1}}, {'trabajo': ''}, {}, '[]', 'no es json', {'trabajo': "OB-0001'; DROP TABLE x;--"}):
            self.llamar(args, 'No pude.')
            r = self.pedir('FINANZAS')
            self.assertNotIn('ancla', r.data, args)
        self.assertEqual(FacturaDTE.objects.count(), 0)

    def test_roles_sin_permiso_no_pueden_ejecutarla_aunque_el_modelo_la_pida(self):
        for rol in ('OPERACIONES', 'RRHH'):
            self.llamar({'trabajo': 'OB-0001'}, 'No tienes acceso.')
            r = self.pedir(rol)
            self.assertNotIn('ancla', r.data, rol)

    def test_el_prompt_deja_claro_que_la_ia_no_emite(self):
        fake = self.llamar({'trabajo': 'OB-0001'})
        self.pedir('FINANZAS')
        self.assertIn('TÚ NO EMITES FACTURAS', fake.llamadas[0]['messages'][0]['content'])
        self.assertIn('preparar_factura', fake.llamadas[0]['messages'][0]['content'])
        self.assertIn('PREPARAR UNA FACTURA', prompts.PROMPT_FACTURA)
