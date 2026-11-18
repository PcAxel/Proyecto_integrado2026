from django.test import override_settings

from erp.models import Registro

from .test_erp import ErpBase, crear


class AutocompletarTests(ErpBase):
    def setUp(self):
        super().setUp()
        for i in range(1, 31):
            crear('proveedores', f'PRV-{i + 1:03d}', rut=f'99.{i:03d}.000-0', razon_social=f'Distribuidora Andes {i:02d} Ltda.', comuna='Chillán', activo=True)
        crear('proveedores', 'PRV-900', rut='99.900.000-0', razon_social='Proveedor Inactivo Andes', activo=False)
        crear('articulos', 'ART-002', sku='CMP-9', nombre='Compresor scroll 9 HP', categoria='Compresores', unidad='un', costo_unitario=777777, stock_minimo=1, activo=True)

    def buscar(self, rol, tabla, **params):
        self.as_role(rol)
        return self.client.get(f'/api/erp/buscar/{tabla}/', params)

    def test_filtra_en_el_servidor_y_limita_a_veinte(self):
        r = self.buscar('FINANZAS', 'proveedores', search='andes', limit=100)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 20)  # hay 30 que coinciden: nunca devuelve más de 20
        r = self.buscar('FINANZAS', 'proveedores', search='andes 07')
        # busca en nombre, RUT y código a la vez: «07» está en el nombre de uno y en el código PRV-007 de otro
        self.assertEqual(sorted(x['label'] for x in r.json()), ['Distribuidora Andes 06 Ltda.', 'Distribuidora Andes 07 Ltda.'])
        self.assertEqual(self.buscar('FINANZAS', 'proveedores', search='andes 07 99.007').json()[0]['detalle'], '99.007.000-0')
        self.assertEqual(len(self.buscar('FINANZAS', 'proveedores').json()), 10)  # sin texto, la primera tanda
        self.assertEqual(len(self.buscar('FINANZAS', 'proveedores', limit='x').json()), 10)

    def test_busca_por_rut_codigo_y_no_ofrece_inactivos(self):
        self.assertEqual([x['id'] for x in self.buscar('FINANZAS', 'proveedores', search='99.012').json()], ['PRV-013'])
        self.assertEqual([x['id'] for x in self.buscar('FINANZAS', 'proveedores', search='PRV-005').json()], ['PRV-005'])
        self.assertEqual(self.buscar('FINANZAS', 'proveedores', search='Inactivo').json(), [])

    def test_recupera_lo_elegido_por_id_aunque_este_inactivo(self):
        r = self.buscar('FINANZAS', 'proveedores', ids='PRV-900,PRV-002')
        self.assertEqual(sorted(x['id'] for x in r.json()), ['PRV-002', 'PRV-900'])

    def test_articulos_por_sku_o_nombre_sin_exponer_costos(self):
        d = self.buscar('JEFE_BODEGA', 'articulos', search='scroll').json()
        self.assertEqual(d, [{'id': 'ART-002', 'label': 'CMP-9 · Compresor scroll 9 HP', 'detalle': 'Compresores'}])
        self.assertNotIn('777777', str(self.buscar('JEFE_BODEGA', 'articulos', search='cmp').json()))

    def test_cada_rol_solo_busca_lo_que_ya_puede_leer(self):
        self.assertEqual(self.buscar('RRHH', 'proveedores', search='andes').status_code, 403)  # RR. HH. no ve proveedores
        self.assertEqual(self.buscar('TECNICO', 'articulos', search='cmp').status_code, 403)  # el técnico no tiene este buscador
        self.assertEqual(self.buscar('JEFE_BODEGA', 'obras', search='cámara').status_code, 200)
        self.assertEqual(self.buscar('FINANZAS', 'personal', search='jorge').status_code, 404)  # solo tablas pensadas para elegir
        self.assertEqual(self.buscar('FINANZAS', 'cardex', search='x').status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/erp/buscar/proveedores/?search=a').status_code, 401)

    def test_no_baja_la_tabla_completa(self):
        total = Registro.objects.filter(tabla='proveedores').count()
        self.assertGreater(total, 30)
        for texto in ('', 'a', 'distribuidora', '9'):
            self.assertLessEqual(len(self.buscar('FINANZAS', 'proveedores', search=texto, limit=20).json()), 20)
