"""Etapa 2: el estado de cada factura se calcula cruzando orden de compra, recepciones y factura (tolerancia: cantidad exacta, precio 1 %)."""
from django.test import SimpleTestCase

from erp import conciliacion as c
from erp.models import Registro

from .test_erp import ErpBase, crear

ORDEN = {'id': 'OC-1', 'items': [{'articulo_id': 'A', 'cantidad': 10, 'precio_unitario': 1000}, {'articulo_id': 'B', 'cantidad': 4, 'precio_unitario': 500}]}


def factura(*items, descuentos=(), **extra):
    return {'id': 'FC-1', 'orden_compra_id': 'OC-1', 'descuentos': list(descuentos), 'items': [{'articulo_id': a, 'cantidad': q, 'precio_lista': p} for a, q, p in items], **extra}


class CalculoPuroTests(SimpleTestCase):
    def estado(self, f, recibido, antes=None, orden=ORDEN):
        return c.conciliar_factura(f, orden, recibido, antes or {})

    def test_sin_orden_no_se_bloquea(self):
        r = c.conciliar_factura(factura(('A', 1, 1000), orden_compra_id=None), None, {}, {})
        self.assertEqual((r['estado'], r['monto_retenido']), (c.SIN_ORDEN, 0))

    def test_conciliada_cuando_todo_coincide(self):
        r = self.estado(factura(('A', 10, 1000), ('B', 4, 500)), {'A': 10, 'B': 4})
        self.assertEqual((r['estado'], r['discrepancias'], r['monto_retenido']), (c.CONCILIADA, [], 0))

    def test_pendiente_de_recepcion_si_aun_no_llega_nada(self):
        r = self.estado(factura(('A', 10, 1000)), {})
        self.assertEqual((r['estado'], r['monto_pendiente_recepcion'], r['monto_retenido']), (c.PENDIENTE_RECEPCION, 10000, 0))

    def test_faltante_cuando_llego_menos_de_lo_facturado(self):
        r = self.estado(factura(('A', 10, 1000)), {'A': 6})
        self.assertEqual(r['estado'], c.BLOQUEADA)
        self.assertEqual([(d['tipo'], d['cantidad'], d['monto_neto']) for d in r['discrepancias']], [(c.FALTANTE, 4, 4000)])
        self.assertEqual((r['monto_retenido_neto'], r['monto_retenido']), (4000, 4760))  # con IVA 19 %

    def test_la_recepcion_tardia_desbloquea_sola(self):
        self.assertEqual(self.estado(factura(('A', 10, 1000)), {'A': 6})['estado'], c.BLOQUEADA)
        self.assertEqual(self.estado(factura(('A', 10, 1000)), {'A': 10})['estado'], c.CONCILIADA)

    def test_facturado_sobre_lo_pedido(self):
        r = self.estado(factura(('A', 12, 1000)), {'A': 12})
        self.assertEqual([(d['tipo'], d['cantidad']) for d in r['discrepancias']], [(c.SOBRE_PEDIDO, 2)])
        self.assertEqual(r['monto_retenido_neto'], 2000)

    def test_las_mismas_unidades_no_se_retienen_dos_veces(self):
        # 12 facturadas, 10 pedidas, 6 recibidas: 2 sobre lo pedido y 4 faltantes (no 6 faltantes ni 8 retenidas en doble)
        r = self.estado(factura(('A', 12, 1000)), {'A': 6})
        self.assertEqual(sorted((d['tipo'], d['cantidad']) for d in r['discrepancias']), [(c.FALTANTE, 4), (c.SOBRE_PEDIDO, 2)])
        self.assertEqual(r['monto_retenido_neto'], 6000)

    def test_articulo_que_no_estaba_en_la_orden(self):
        r = self.estado(factura(('A', 10, 1000), ('Z', 3, 200)), {'A': 10})
        self.assertEqual([(d['tipo'], d['articulo_id'], d['monto_neto']) for d in r['discrepancias']], [(c.NO_PEDIDO, 'Z', 600)])

    def test_precio_mayor_con_tolerancia_del_uno_por_ciento(self):
        dentro = self.estado(factura(('A', 10, 1009)), {'A': 10})            # +0,9 %: tolerado
        self.assertEqual(dentro['estado'], c.CONCILIADA)
        fuera = self.estado(factura(('A', 10, 1050)), {'A': 10})             # +5 %
        self.assertEqual((fuera['estado'], fuera['discrepancias'][0]['tipo'], fuera['monto_retenido_neto']), (c.BLOQUEADA, c.PRECIO_MAYOR, 500))
        menor = self.estado(factura(('A', 10, 900)), {'A': 10})              # más barato que lo pactado: no es discrepancia
        self.assertEqual(menor['estado'], c.CONCILIADA)

    def test_el_precio_se_compara_despues_de_descuentos(self):
        r = self.estado(factura(('A', 10, 1100), descuentos=[10]), {'A': 10})  # 1100 − 10 % = 990
        self.assertEqual(r['estado'], c.CONCILIADA)

    def test_varias_facturas_consumen_lo_recibido_en_orden(self):
        # se recibieron 10; la primera factura cobra 6 y la segunda 4: ambas cubiertas. Una tercera de 2 más supera lo pedido.
        self.assertEqual(self.estado(factura(('A', 4, 1000)), {'A': 10}, {'A': 6})['estado'], c.CONCILIADA)
        r = self.estado(factura(('A', 2, 1000)), {'A': 10}, {'A': 10})
        self.assertEqual((r['estado'], [d['tipo'] for d in r['discrepancias']]), (c.BLOQUEADA, [c.SOBRE_PEDIDO]))

    def test_liberada_conserva_las_discrepancias_pero_no_retiene(self):
        r = self.estado(factura(('A', 10, 1000), liberacion={'por': 'U-001', 'motivo': 'Llegó con la guía 88'}), {'A': 6})
        self.assertEqual((r['estado'], len(r['discrepancias']), r['monto_retenido']), (c.LIBERADA, 1, 0))


class DesdeLaBaseTests(ErpBase):
    def setUp(self):
        super().setUp()
        crear('ordenes_compra', 'OC-0001', proveedor_id='PRV-001', estado='EMITIDA', items=[{'articulo_id': 'ART-001', 'cantidad': 10, 'precio_unitario': 1000}])
        item = lambda q: [{'articulo_id': 'ART-001', 'cantidad': q, 'precio_lista': 1000}]
        crear('facturas', 'FC-0001', numero='1', proveedor_id='PRV-001', fecha='2026-11-05', descuentos=[], orden_compra_id='OC-0001', items=item(10))
        crear('facturas', 'FC-0002', numero='2', proveedor_id='PRV-001', fecha='2026-11-06', descuentos=[], items=item(1))
        crear('cardex', 'MOV-000001', tipo='ENTRADA_RECEPCION', signo=1, cantidad=7, articulo_id='ART-001', costo_unitario=1000, orden_compra_id='OC-0001', referencia='Guía 1')
        crear('cardex', 'MOV-000002', tipo='ENTRADA_RECEPCION', signo=1, cantidad=50, articulo_id='ART-001', costo_unitario=1000, referencia='Guía sin orden')

    def test_cruza_con_las_recepciones_enlazadas_y_resume(self):
        r = c.conciliar_todas()
        self.assertEqual((r['FC-0001']['estado'], r['FC-0001']['monto_retenido_neto']), (c.BLOQUEADA, 3000))  # llegaron 7 de 10 (la recepción sin orden no cuenta)
        self.assertEqual(r['FC-0002']['estado'], c.SIN_ORDEN)
        res = c.resumen(r)
        self.assertEqual((res['por_estado'], res['monto_retenido']), ({c.BLOQUEADA: 1, c.SIN_ORDEN: 1}, 3570))
        f = {x.rid: x.datos for x in Registro.objects.filter(tabla='facturas')}
        self.assertEqual(c.resumen(r, desde='2026-11-06', facturas=f)['por_estado'], {c.SIN_ORDEN: 1})


class LiberacionTests(ErpBase):
    def setUp(self):
        super().setUp()
        crear('ordenes_compra', 'OC-0001', proveedor_id='PRV-001', estado='EMITIDA', items=[{'articulo_id': 'ART-001', 'cantidad': 10, 'precio_unitario': 1000}])
        item = [{'articulo_id': 'ART-001', 'cantidad': 10, 'precio_lista': 1000}]
        crear('facturas', 'FC-0001', numero='1', proveedor_id='PRV-001', fecha='2026-11-05', descuentos=[], orden_compra_id='OC-0001', items=item)  # bloqueada: faltan 3
        crear('facturas', 'FC-0002', numero='2', proveedor_id='PRV-001', fecha='2026-11-06', descuentos=[], items=item)  # sin orden
        crear('cardex', 'MOV-000001', tipo='ENTRADA_RECEPCION', signo=1, cantidad=7, articulo_id='ART-001', costo_unitario=1000, orden_compra_id='OC-0001', referencia='Guía 1')

    def liberar(self, rol, factura='FC-0001', motivo='La guía 88 trae las 3 unidades restantes'):
        self.as_role(rol)
        return self.client.post(f'/api/erp/facturas/{factura}/liberar/', {'motivo': motivo}, format='json')

    def test_finanzas_libera_con_motivo_y_queda_registrado(self):
        r = self.liberar('FINANZAS')
        self.assertEqual(r.status_code, 200, r.content)
        lib = Registro.objects.get(tabla='facturas', rid='FC-0001').datos['liberacion']
        self.assertEqual((lib['por'], lib['motivo'], lib['monto_retenido'], len(lib['discrepancias'])), (f"U-{self.users['FINANZAS'].pk:03d}", 'La guía 88 trae las 3 unidades restantes', 3570, 1))
        self.assertEqual(r.json()['conciliacion']['estado'], c.LIBERADA)
        self.assertEqual(c.conciliar_todas()['FC-0001']['monto_retenido'], 0)  # ya no retiene
        a = Registro.objects.filter(tabla='auditoria', datos__entidad_id='FC-0001', datos__accion='LIBERAR_FACTURA').first()
        self.assertIsNotNone(a)
        self.assertEqual((a.datos['anterior']['estado'], a.datos['nuevo']['estado']), (c.BLOQUEADA, c.LIBERADA))

    def test_el_administrador_general_tambien_puede(self):
        self.assertEqual(self.liberar('ADMIN').status_code, 200)

    def test_otros_roles_no_pueden(self):
        for rol in ('JEFE_BODEGA', 'OPERACIONES', 'AUDITOR', 'RRHH', 'COMERCIAL', 'TECNICO'):
            self.assertEqual(self.liberar(rol).status_code, 403, rol)
        self.assertNotIn('liberacion', Registro.objects.get(tabla='facturas', rid='FC-0001').datos)

    def test_exige_un_motivo_de_verdad(self):
        for motivo in ('', '   ', 'ok', 'x' * 301, None):
            self.assertEqual(self.liberar('FINANZAS', motivo=motivo).status_code, 422, repr(motivo))

    def test_solo_se_libera_una_factura_bloqueada_y_una_sola_vez(self):
        self.assertEqual(self.liberar('FINANZAS', factura='FC-0002').status_code, 409)  # sin orden: no está bloqueada
        self.assertEqual(self.liberar('FINANZAS', factura='FC-9999').status_code, 404)
        self.assertEqual(self.liberar('FINANZAS').status_code, 200)
        r = self.liberar('ADMIN')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'estado_invalido'))

    def test_la_conciliada_tampoco_se_puede_liberar(self):
        crear('cardex', 'MOV-000002', tipo='ENTRADA_RECEPCION', signo=1, cantidad=3, articulo_id='ART-001', costo_unitario=1000, orden_compra_id='OC-0001', referencia='Guía 2')
        self.assertEqual(c.conciliar_todas()['FC-0001']['estado'], c.CONCILIADA)
        self.assertEqual(self.liberar('FINANZAS').status_code, 409)


class DatosDeDemostracionTests(ErpBase):
    def setUp(self):
        super().setUp()
        for i, prov in enumerate(('PRV-002', 'PRV-003'), start=2):
            crear('proveedores', prov, rut=f'99.100.00{i}-9', razon_social=f'Proveedor {i}', activo=True)
        Registro.objects.filter(tabla='articulos', rid='ART-001').update(datos={**Registro.objects.get(tabla='articulos', rid='ART-001').datos, 'proveedor_id': 'PRV-001'})
        for n, prov in enumerate(('PRV-001', 'PRV-002', 'PRV-003'), start=10):
            for k in (1, 2):
                if (prov, k) != ('PRV-001', 1):
                    crear('articulos', f'ART-{n}{k}', sku=f'S-{n}{k}', nombre=f'Art {n}{k}', categoria='C', unidad='un', costo_unitario=2000 * k, stock_minimo=1, activo=True, proveedor_id=prov)

    def test_crea_un_escenario_por_estado_y_es_idempotente(self):
        from erp.demo import compras_cruce
        salida = []
        self.assertEqual(compras_cruce.poblar(salida.append), 8)
        r = c.conciliar_todas()
        demo = [x for fid, x in r.items() if Registro.objects.get(tabla='facturas', rid=fid).datos.get('demo')]
        estados = sorted(x['estado'] for x in demo)
        self.assertEqual(estados.count(c.BLOQUEADA), 5)       # dos faltantes, sobre lo pedido, artículo no pedido y precio mayor
        self.assertEqual(estados.count(c.CONCILIADA), 1)
        self.assertEqual(estados.count(c.PENDIENTE_RECEPCION), 1)
        self.assertEqual(estados.count(c.LIBERADA), 1)
        tipos = {d['tipo'] for x in demo for d in x['discrepancias']}
        self.assertEqual(tipos, set(c.TIPOS))                 # aparece cada tipo de discrepancia
        self.assertEqual(compras_cruce.poblar(salida.append), 0)  # segunda vez: no duplica
        self.assertEqual(Registro.objects.filter(tabla='ordenes_compra').count(), 8)

    def test_el_agente_ve_el_ranking_de_proveedores(self):
        from ai_agent import consultas
        from erp.demo import compras_cruce
        compras_cruce.poblar(lambda *_: None)
        r = consultas.ejecutar(self.users['FINANZAS'], 'consultar_finanzas', {'tipo': 'compra', 'resumen_discrepancias': True})['compras']['resumen_discrepancias']
        self.assertGreater(r['monto_retenido'], 0)
        self.assertEqual(r['ranking_proveedores'][0]['discrepancias'], max(p['discrepancias'] for p in r['ranking_proveedores']))
