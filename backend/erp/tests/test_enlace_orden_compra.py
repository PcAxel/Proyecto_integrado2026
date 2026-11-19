"""Etapa 1 del cruce de tres documentos: la recepción y la factura pueden enlazarse a una orden de compra, y el stock entra solo por la recepción."""
from erp.models import Registro

from .test_erp import crear
from .test_negocio import Negocio


class EnlaceOrdenCompraTests(Negocio):
    def setUp(self):
        super().setUp()
        crear('proveedores', 'PRV-002', rut='99.100.002-9', razon_social='Otro Proveedor', activo=True)
        crear('articulos', 'ART-002', sku='VAL-1', nombre='Válvula', categoria='Val', unidad='un', costo_unitario=500, stock_minimo=1, activo=True)
        crear('ordenes_compra', 'OC-0001', proveedor_id='PRV-001', estado='EMITIDA', fecha='2026-11-01T10:00:00', neto=10000, iva=1900, total=11900,
              items=[{'articulo_id': 'ART-001', 'sku': 'REF-1', 'nombre': 'Gas', 'unidad': 'un', 'cantidad': 10, 'precio_unitario': 1000, 'subtotal': 10000}])
        crear('ordenes_compra', 'OC-0002', proveedor_id='PRV-002', estado='EMITIDA', fecha='2026-11-01T10:00:00', neto=500, iva=95, total=595,
              items=[{'articulo_id': 'ART-002', 'sku': 'VAL-1', 'nombre': 'Válvula', 'unidad': 'un', 'cantidad': 1, 'precio_unitario': 500, 'subtotal': 500}])
        crear('ordenes_compra', 'OC-0003', proveedor_id='PRV-001', estado='ANULADA', fecha='2026-11-01T10:00:00', neto=0, iva=0, total=0, items=[])

    def recepcion(self, n=1, orden='OC-0001', articulo='ART-001', cantidad=6, **extra):
        costo = 1000 if articulo == 'ART-001' else 500
        return self.mov(f'MOV-{n:06d}', 'ENTRADA_RECEPCION', cantidad, referencia='Guía 77', articulo_id=articulo, costo_unitario=costo, **({'orden_compra_id': orden} if orden else {}), **extra)

    def factura(self, n=1, orden='OC-0001', proveedor='PRV-001', cantidad=10):
        fila = {'id': f'FC-{n:04d}', 'numero': f'N{n}', 'proveedor_id': proveedor, 'fecha': '2026-11-05', 'descuentos': [],
                'items': [{'articulo_id': 'ART-001', 'cantidad': cantidad, 'precio_lista': 1000}]}
        if orden:
            fila['orden_compra_id'] = orden
        return {'op': 'insert', 'tabla': 'facturas', 'fila': fila}

    def test_la_recepcion_queda_enlazada_a_la_orden(self):
        r = self.lote('JEFE_BODEGA', self.recepcion())
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.datos('cardex', 'MOV-000001')['orden_compra_id'], 'OC-0001')

    def test_la_recepcion_valida_la_orden(self):
        casos = {'inexistente': self.recepcion(orden='OC-9999'), 'anulada': self.recepcion(orden='OC-0003'), 'articulo ajeno a la orden': self.recepcion(articulo='ART-002')}
        for nombre, op in casos.items():
            self.assertIn(self.lote('JEFE_BODEGA', op).status_code, (409, 422), nombre)
        self.assertFalse(Registro.objects.filter(tabla='cardex').exists())

    def test_la_recepcion_sin_orden_sigue_funcionando_como_antes(self):
        r = self.lote('JEFE_BODEGA', self.recepcion(orden=None))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotIn('orden_compra_id', self.datos('cardex', 'MOV-000001'))

    def test_otro_tipo_de_movimiento_no_puede_nombrar_una_orden(self):
        self.lote('JEFE_BODEGA', *self.compra(1, 10))
        salida = self.mov('MOV-000002', 'SALIDA_OBRA', 2, orden_compra_id='OC-0001')
        self.assertEqual(self.lote('JEFE_BODEGA', salida).status_code, 422)

    def test_factura_enlazada_guarda_la_orden_y_no_suma_stock(self):
        r = self.lote('JEFE_BODEGA', self.factura())
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.datos('facturas', 'FC-0001')['orden_compra_id'], 'OC-0001')
        # la entrada por factura queda prohibida: el stock entra por la recepción
        entrada = self.mov('MOV-000001', cantidad=10, costo_unitario=1000, referencia='FC-0001')
        r = self.lote('JEFE_BODEGA', entrada)
        self.assertEqual((r.status_code, r.json().get('code')), (409, 'estado_invalido'))
        self.assertFalse(Registro.objects.filter(tabla='cardex').exists())

    def test_factura_en_el_mismo_lote_que_su_entrada_tambien_se_rechaza(self):
        r = self.lote('JEFE_BODEGA', self.factura(), self.mov('MOV-000001', cantidad=10, costo_unitario=1000, referencia='FC-0001'))
        self.assertEqual(r.status_code, 409)
        self.assertFalse(Registro.objects.filter(tabla='facturas').exists())  # todo o nada

    def test_la_factura_valida_la_orden_y_el_proveedor(self):
        self.assertEqual(self.lote('JEFE_BODEGA', self.factura(orden='OC-9999')).status_code, 422)
        self.assertEqual(self.lote('JEFE_BODEGA', self.factura(orden='OC-0003')).status_code, 409)  # anulada
        self.assertEqual(self.lote('JEFE_BODEGA', self.factura(orden='OC-0002')).status_code, 422)  # de otro proveedor
        self.assertFalse(Registro.objects.filter(tabla='facturas').exists())

    def test_la_factura_sin_orden_sigue_sumando_stock_como_antes(self):
        r = self.lote('JEFE_BODEGA', *self.compra(1, 10))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.stock(), 10)
        self.assertNotIn('orden_compra_id', self.datos('facturas', 'FC-0001'))

    def test_stock_total_con_orden_solo_por_la_recepcion(self):
        self.lote('JEFE_BODEGA', self.factura())
        self.lote('JEFE_BODEGA', self.recepcion(cantidad=6))
        self.assertEqual(self.stock(), 6)  # lo recibido; lo facturado de más NO suma

    def test_el_buscador_ofrece_las_ordenes_vigentes_del_proveedor(self):
        self.as_role('JEFE_BODEGA')
        r = self.client.get('/api/erp/buscar/ordenes_compra/', {'estado': 'EMITIDA', 'proveedor': 'PRV-001'})
        self.assertEqual([x['id'] for x in r.json()], ['OC-0001'])
        self.assertEqual(self.client.get('/api/erp/buscar/ordenes_compra/', {'search': 'OC-0002'}).json()[0]['id'], 'OC-0002')
        self.as_role('RRHH')
        self.assertEqual(self.client.get('/api/erp/buscar/ordenes_compra/').status_code, 403)

    def stock(self):
        return sum(r.datos['signo'] * r.datos['cantidad'] for r in Registro.objects.filter(tabla='cardex'))
