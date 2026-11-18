"""Consultas seguras del agente: solo ORM, filtros en lista blanca, máximo 50 filas, RBAC con el usuario del JWT y 403 que el modelo explica."""
import json
from unittest.mock import patch
from datetime import datetime, timedelta, timezone as tz

from django.utils import timezone

from ai_agent import consultas, herramientas
from ai_agent.tests.test_preparar_factura import llamada
from ai_agent.tests.test_reportes import ReportesBase, mensaje
from erp.models import Registro
from facturacion.models import FacturaDTE


def reg(tabla, rid, **datos):
    return Registro.objects.update_or_create(tabla=tabla, rid=rid, defaults={'datos': datos})[0]  # la base de pruebas ya trae CLI-001 y PRE-0001


class ConsultasBase(ReportesBase):
    def setUp(self):
        super().setUp()
        hoy = timezone.localdate()
        reg('proveedores', 'PRV-001', razon_social='Frío Sur SpA', rut='77.000.001-1', activo=True)
        reg('proveedores', 'PRV-002', razon_social='Cobre Andes Ltda', rut='77.000.002-2', activo=True)
        reg('facturas', 'FC-0001', numero='A1', proveedor_id='PRV-001', fecha='2026-10-10', neto=1_000_000, iva=190_000, total=1_190_000, items=[])
        reg('facturas', 'FC-0002', numero='A2', proveedor_id='PRV-002', fecha='2026-11-05', neto=500_000, iva=95_000, total=595_000, items=[])
        reg('facturas', 'FC-0003', numero='A3', proveedor_id='PRV-001', fecha='2026-11-20', neto=300_000, iva=57_000, total=357_000, items=[])
        for i, (cobro, dia) in enumerate((('PENDIENTE_PAGO', 5), ('PAGADA', 15)), start=1):
            FacturaDTE.objects.create(orden_id=f'OB-{i}', folio_sii=i, estado_sii='ACEPTADO', monto_neto=2_000_000, monto_iva=380_000, monto_total=2_380_000, pdf_archivo='x.pdf',
                                      receptor_razon_social='Cecinas Sur SpA', receptor_rut='76.111.111-1', estado_cobro=cobro, emitido_en=datetime(2026, 11, dia, 15, 0, tzinfo=tz.utc))
        # Bodega: un artículo que se movió hace 200 días y otro hace 5
        vieja, reciente = (hoy - timedelta(days=200)).isoformat(), (hoy - timedelta(days=5)).isoformat()
        reg('articulos', 'ART-001', sku='CMP-1', nombre='Compresor', categoria='Compresores', unidad='un', costo_unitario=1_000_000, proveedor_id='PRV-001', activo=True, stock_minimo=1)
        reg('articulos', 'ART-002', sku='TUB-1', nombre='Tubo de cobre', categoria='Cobre', unidad='m', costo_unitario=10_000, proveedor_id='PRV-002', activo=True, stock_minimo=1)
        reg('articulos', 'ART-003', sku='VAL-1', nombre='Válvula sin stock', categoria='Válvulas', unidad='un', costo_unitario=5_000, proveedor_id='PRV-001', activo=True, stock_minimo=1)
        reg('cardex', 'MOV-000001', tipo='ENTRADA_COMPRA', signo=1, cantidad=3, articulo_id='ART-001', costo_unitario=1_000_000, obra_id=None, fecha=vieja + 'T10:00:00')
        reg('cardex', 'MOV-000002', tipo='ENTRADA_COMPRA', signo=1, cantidad=100, articulo_id='ART-002', costo_unitario=10_000, obra_id=None, fecha=reciente + 'T10:00:00')
        reg('cardex', 'MOV-000003', tipo='ENTRADA_COMPRA', signo=1, cantidad=2, articulo_id='ART-003', costo_unitario=5_000, obra_id=None, fecha=vieja + 'T10:00:00')
        reg('cardex', 'MOV-000004', tipo='SALIDA_OBRA', signo=-1, cantidad=2, articulo_id='ART-003', costo_unitario=5_000, obra_id='OB-0001', fecha=reciente + 'T10:00:00')
        # Operaciones
        reg('clientes', 'CLI-001', razon_social='Cecinas Sur SpA', rut='76.111.111-1', activo=True)
        reg('presupuestos', 'PRE-0001', titulo='A', cliente_id='CLI-001', estado='APROBADO', precio_venta_neto=1_000_000, materiales=[{'cantidad': 1, 'costo_unitario': 850_000}], mano_obra=[], adicionales=[])
        reg('presupuestos', 'PRE-0002', titulo='B', cliente_id='CLI-001', estado='APROBADO', precio_venta_neto=1_000_000, materiales=[{'cantidad': 1, 'costo_unitario': 400_000}], mano_obra=[], adicionales=[])
        reg('obras', 'OB-0001', nombre='Cámara A', estado='EN_CURSO', cliente_id='CLI-001', presupuesto_id='PRE-0001', tipo='INSTALACION')
        reg('obras', 'OB-0002', nombre='Cámara B', estado='FINALIZADA', cliente_id='CLI-001', presupuesto_id='PRE-0002', tipo='INSTALACION')
        reg('obras', 'OB-0003', nombre='Emergencia sin presupuesto', estado='EN_CURSO', cliente_id='CLI-001', presupuesto_id=None, tipo='EMERGENCIA')

    def q(self, rol, herramienta, **args):
        return consultas.ejecutar(self.users[rol], herramienta, args)


class FinanzasTests(ConsultasBase):
    def test_compras_por_proveedor_y_fechas_con_totales(self):
        r = self.q('FINANZAS', 'consultar_finanzas', tipo='compra', proveedor='frío', fecha_desde='2026-11-01', fecha_hasta='2026-11-30')
        c = r['compras']
        self.assertEqual([f['numero'] for f in c['filas']], ['A3'])
        self.assertEqual((c['total_coincidencias'], c['totales']), (1, {'neto': 300_000, 'iva': 57_000}))
        self.assertNotIn('ventas', r)
        todas = self.q('FINANZAS', 'consultar_finanzas', tipo='compra')['compras']
        self.assertEqual((todas['total_coincidencias'], todas['totales']['neto']), (3, 1_800_000))
        self.assertEqual([f['numero'] for f in todas['filas']], ['A3', 'A2', 'A1'])  # más recientes primero

    def test_ventas_por_cliente_y_estado_de_cobro(self):
        v = self.q('FINANZAS', 'consultar_finanzas', tipo='venta', estado_cobro='PENDIENTE_PAGO')['ventas']
        self.assertEqual([(f['folio'], f['estado_cobro']) for f in v['filas']], [(1, 'PENDIENTE_PAGO')])
        self.assertEqual(self.q('FINANZAS', 'consultar_finanzas', tipo='venta', cliente='cecinas', fecha_desde='2026-11-10')['ventas']['total_coincidencias'], 1)
        ambas = self.q('FINANZAS', 'consultar_finanzas')
        self.assertEqual((ambas['compras']['total_coincidencias'], ambas['ventas']['total_coincidencias']), (3, 2))

    def test_filtros_que_no_estan_en_la_lista_blanca_se_ignoran(self):
        r = self.q('FINANZAS', 'consultar_finanzas', tipo='compra', tabla='usuarios', sql='1=1', datos__neto__gt=0, orden='-id')
        self.assertEqual(r['compras']['total_coincidencias'], 3)

    def test_filtros_mal_formados_devuelven_400_sin_tocar_la_base(self):
        for args in ({'tipo': 'otra'}, {'fecha_desde': '10/11/2026'}, {'fecha_desde': '2026-11-30', 'fecha_hasta': '2026-11-01'}, {'tipo': 'compra', 'cliente': 'x'}, {'estado_cobro': 'X'}):
            r = self.q('FINANZAS', 'consultar_finanzas', **args)
            self.assertEqual((r['ok'], r['status']), (False, 400), args)

    def test_texto_malicioso_es_un_valor_literal(self):
        r = self.q('FINANZAS', 'consultar_finanzas', tipo='compra', proveedor="' OR 1=1 --")
        self.assertEqual(r['compras']['total_coincidencias'], 0)

    def test_permisos_por_modulo(self):
        for rol in ('RRHH', 'COMERCIAL', 'TECNICO'):
            r = self.q(rol, 'consultar_finanzas')
            self.assertEqual((r['ok'], r['status']), (False, 403), rol)
        self.assertNotIn('ventas', self.q('JEFE_BODEGA', 'consultar_finanzas'))  # Bodega lee compras, no facturación electrónica
        # Operaciones lee compras pero no facturación electrónica
        o = self.q('OPERACIONES', 'consultar_finanzas')
        self.assertIn('compras', o)
        self.assertNotIn('ventas', o)
        self.assertEqual(self.q('OPERACIONES', 'consultar_finanzas', tipo='venta')['status'], 403)
        self.assertEqual(self.q('AUDITOR', 'consultar_finanzas')['ventas']['total_coincidencias'], 2)


class KardexTests(ConsultasBase):
    def test_stock_valorizado_ordenado_por_valor_y_por_antiguedad(self):
        r = self.q('FINANZAS', 'consultar_kardex')
        self.assertEqual([f['sku'] for f in r['filas']], ['CMP-1', 'TUB-1'])  # VAL-1 quedó sin stock
        self.assertEqual((r['filas'][0]['valor_total'], r['totales']['valor_total']), (3_000_000, 4_000_000))
        a = self.q('FINANZAS', 'consultar_kardex', ordenar_por='antiguedad')['filas']
        self.assertEqual([(f['sku'], f['dias_sin_movimiento']) for f in a], [('CMP-1', 200), ('TUB-1', 5)])

    def test_sin_movimiento_categoria_y_proveedor(self):
        self.assertEqual([f['sku'] for f in self.q('FINANZAS', 'consultar_kardex', sin_movimiento_dias=90)['filas']], ['CMP-1'])
        self.assertEqual([f['sku'] for f in self.q('FINANZAS', 'consultar_kardex', categoria='cobre')['filas']], ['TUB-1'])
        self.assertEqual([f['sku'] for f in self.q('FINANZAS', 'consultar_kardex', proveedor='Frío Sur')['filas']], ['CMP-1'])
        self.assertEqual(self.q('FINANZAS', 'consultar_kardex', sin_movimiento_dias=-1)['status'], 400)
        self.assertEqual(self.q('FINANZAS', 'consultar_kardex', ordenar_por='nombre')['status'], 400)

    def test_el_rol_sin_costos_no_ve_valores(self):
        with patch('ai_agent.consultas.tablas.ver_costos', return_value=False):  # ningún rol con acceso al Cardex carece hoy de costos: se simula
            r = self.q('JEFE_BODEGA', 'consultar_kardex', ordenar_por='valor_total')
        self.assertEqual(r['ordenado_por'], 'antiguedad')
        self.assertNotIn('valor_total', r['filas'][0])
        self.assertIn('no ve costos', r['nota'])

    def test_permiso_denegado(self):
        for rol in ('RRHH', 'COMERCIAL', 'TECNICO'):
            self.assertEqual(self.q(rol, 'consultar_kardex')['status'], 403, rol)

    def test_maximo_50_filas_pero_los_totales_cubren_todo(self):
        hoy = timezone.localdate().isoformat()
        for i in range(60):
            reg('articulos', f'ART-9{i:02d}', sku=f'MAS-{i}', nombre='Masivo', categoria='Masivos', unidad='un', costo_unitario=1_000, proveedor_id='PRV-001', activo=True)
            reg('cardex', f'MOV-9{i:05d}', tipo='ENTRADA_COMPRA', signo=1, cantidad=1, articulo_id=f'ART-9{i:02d}', costo_unitario=1_000, obra_id=None, fecha=hoy + 'T09:00:00')
        r = self.q('FINANZAS', 'consultar_kardex', categoria='masivos')
        self.assertEqual((len(r['filas']), r['total_coincidencias'], r['truncado'], r['totales']['valor_total']), (50, 60, True, 60_000))


class OperacionesTests(ConsultasBase):
    def test_estado_obra_y_margen(self):
        r = self.q('FINANZAS', 'consultar_operaciones', estado='EN_CURSO')
        self.assertEqual(sorted(f['id'] for f in r['filas']), ['OB-0001', 'OB-0003'])
        con_margen = {f['id']: f['margen_pct'] for f in self.q('FINANZAS', 'consultar_operaciones')['filas']}
        self.assertEqual((con_margen['OB-0001'], con_margen['OB-0002'], con_margen['OB-0003']), (15.0, 60.0, None))
        bajo = self.q('FINANZAS', 'consultar_operaciones', margen_menor_a=20)
        self.assertEqual([f['id'] for f in bajo['filas']], ['OB-0001'])  # la obra sin presupuesto no tiene margen: no entra
        self.assertEqual([f['id'] for f in self.q('FINANZAS', 'consultar_operaciones', obra='cámara b')['filas']], ['OB-0002'])
        self.assertEqual([f['id'] for f in self.q('FINANZAS', 'consultar_operaciones', obra='OB-0003')['filas']], ['OB-0003'])

    def test_margen_exige_permiso_de_costos(self):
        r = self.q('JEFE_BODEGA', 'consultar_operaciones', margen_menor_a=20)
        self.assertEqual((r['ok'], r['status']), (False, 403))
        sin = self.q('JEFE_BODEGA', 'consultar_operaciones')
        self.assertTrue(sin['ok'])
        self.assertNotIn('margen_pct', sin['filas'][0])

    def test_permiso_denegado_y_filtros_invalidos(self):
        for rol in ('RRHH', 'COMERCIAL', 'TECNICO'):
            self.assertEqual(self.q(rol, 'consultar_operaciones')['status'], 403, rol)
        for args in ({'estado': 'CERRADA'}, {'margen_menor_a': 'bajo'}, {'margen_menor_a': 5000}):
            self.assertEqual(self.q('FINANZAS', 'consultar_operaciones', **args)['status'], 400, args)


class PresupuestosTests(ConsultasBase):
    def setUp(self):
        super().setUp()
        reg('presupuestos', 'PRE-0010', titulo='Cámara nueva', cliente_id='CLI-001', estado='ENVIADO', precio_venta_neto=1_000_000, materiales=[{'cantidad': 1, 'costo_unitario': 850_000}], mano_obra=[], adicionales=[])
        reg('presupuestos', 'PRE-0011', titulo='Mantención', cliente_id='CLI-001', estado='ENVIADO', precio_venta_neto=1_000_000, materiales=[{'cantidad': 1, 'costo_unitario': 500_000}], mano_obra=[], adicionales=[])
        reg('presupuestos', 'PRE-0012', titulo='Todavía borrador', cliente_id='CLI-001', estado='BORRADOR', precio_venta_neto=1_000_000, materiales=[{'cantidad': 1, 'costo_unitario': 900_000}], mano_obra=[], adicionales=[])

    def test_sin_filtros_devuelve_los_pendientes_de_aprobacion_con_su_margen(self):
        r = self.q('FINANZAS', 'consultar_presupuestos')
        self.assertEqual([(f['id'], f['margen_pct']) for f in r['filas']], [('PRE-0010', 15.0), ('PRE-0011', 50.0)])  # menor margen primero
        self.assertEqual((r['totales']['estado'], r['totales']['bajo_margen_minimo'], r['totales']['venta_neta']), ('ENVIADO', 1, 2_000_000))
        self.assertTrue(r['filas'][0]['bajo_margen_minimo'])

    def test_margen_menor_a_estado_y_cliente(self):
        self.assertEqual([f['id'] for f in self.q('FINANZAS', 'consultar_presupuestos', margen_menor_a=20)['filas']], ['PRE-0010'])
        self.assertEqual([f['id'] for f in self.q('FINANZAS', 'consultar_presupuestos', estado='BORRADOR')['filas']], ['PRE-0012'])
        self.assertEqual(self.q('FINANZAS', 'consultar_presupuestos', cliente='cecinas')['total_coincidencias'], 2)
        self.assertEqual(self.q('FINANZAS', 'consultar_presupuestos', cliente='no existe')['total_coincidencias'], 0)
        for args in ({'estado': 'PENDIENTE'}, {'margen_menor_a': 'poco'}):
            self.assertEqual(self.q('FINANZAS', 'consultar_presupuestos', **args)['status'], 400, args)

    def test_permisos(self):
        for rol in ('ADMIN', 'AUDITOR', 'OPERACIONES', 'COMERCIAL'):
            self.assertTrue(self.q(rol, 'consultar_presupuestos')['ok'], rol)
        for rol in ('RRHH', 'JEFE_BODEGA', 'TECNICO'):
            self.assertEqual(self.q(rol, 'consultar_presupuestos')['status'], 403, rol)


class ChatConConsultasTests(ConsultasBase):
    def test_el_modelo_pide_la_consulta_y_recibe_json_limpio(self):
        fake = self.ia(mensaje(tool_calls=[llamada({'tipo': 'compra', 'proveedor': 'Frío'}, 'consultar_finanzas')]), mensaje('Hay 2 facturas de compra de Frío Sur.'))
        r = self.pedir('FINANZAS', '¿Cuánto le compramos a Frío Sur?')
        self.assertEqual(r.status_code, 200)
        self.assertIn('Frío Sur', r.data['respuesta'])
        tool = json.loads(next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content'])
        self.assertEqual((tool['ok'], tool['compras']['total_coincidencias'], tool['compras']['totales']['neto']), (True, 2, 1_300_000))
        self.assertNotIn('datos', json.dumps(tool))  # no se filtra la estructura interna

    def test_sin_permiso_el_modelo_recibe_403_y_se_lo_explica_a_la_persona(self):
        fake = self.ia(mensaje(tool_calls=[llamada({}, 'consultar_finanzas')]), mensaje('Tu perfil no tiene acceso a las finanzas.'))
        r = self.pedir('RRHH', 'Muéstrame las facturas de compra')
        self.assertEqual(r.status_code, 200)
        tool = json.loads(next(m for m in fake.llamadas[1]['messages'] if m['role'] == 'tool')['content'])
        self.assertEqual((tool['ok'], tool['status']), (False, 403))
        self.assertIn('Permiso denegado (403)', tool['error'])
        self.assertIn('no tiene acceso', r.data['respuesta'])

    def test_las_tres_herramientas_se_ofrecen_menos_al_tecnico(self):
        nombres = lambda rol: {t['function']['name'] for t in herramientas.herramientas_para(self.users[rol])}
        for rol in ('FINANZAS', 'RRHH', 'JEFE_BODEGA', 'OPERACIONES'):
            self.assertTrue({'consultar_finanzas', 'consultar_kardex', 'consultar_operaciones', 'consultar_presupuestos'} <= nombres(rol), rol)
        self.assertFalse(nombres('TECNICO'))

    def test_el_esquema_solo_declara_los_filtros_de_la_lista_blanca(self):
        esquemas = {t['function']['name']: t['function']['parameters'] for t in herramientas.herramientas_para(self.users['FINANZAS'])}
        for nombre, filtros in consultas.FILTROS.items():
            self.assertEqual(set(esquemas[nombre]['properties']), set(filtros), nombre)
            self.assertFalse(esquemas[nombre]['additionalProperties'])
