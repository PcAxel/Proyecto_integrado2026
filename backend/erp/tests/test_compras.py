"""Compras: Bodega solicita, Finanzas aprueba y se emiten las órdenes de compra por proveedor."""
from erp.models import Registro
from notificaciones.models import Notification

from .test_erp import crear
from .test_negocio import Negocio


class ComprasTests(Negocio):
    def setUp(self):
        super().setUp()
        crear('proveedores', 'PRV-002', rut='99.100.002-9', razon_social='Proveedor Demo 02', activo=True)
        crear('articulos', 'ART-002', sku='VAL-2', nombre='Válvula', categoria='Val', unidad='un', costo_unitario=5000, stock_minimo=1, activo=True, proveedor_id='PRV-002')
        art = Registro.objects.get(tabla='articulos', rid='ART-001')
        art.datos = {**art.datos, 'proveedor_id': 'PRV-001'}; art.save()

    def solicitar(self, items=None, rol='JEFE_BODEGA', **extra):
        fila = {'id': 'SC-0001', 'items': items if items is not None else [{'articulo_id': 'ART-001', 'cantidad': 10}, {'articulo_id': 'ART-002', 'cantidad': 2}],
                'motivo': 'Stock bajo el mínimo', **extra}
        return self.insertar(rol, 'solicitudes_compra', fila)

    def post(self, rol, url, datos=None):
        self.as_role(rol)
        return self.client.post(url, datos or {}, format='json')

    def test_el_jefe_de_bodega_solicita_y_el_servidor_fija_el_estado(self):
        r = self.solicitar(estado='APROBADA', solicitante_id='U-999', orden_ids=['OC-0001'])
        self.assertEqual(r.status_code, 200, r.content)
        d = self.datos('solicitudes_compra', 'SC-0001')
        self.assertEqual((d['estado'], d['orden_ids'], d['resuelto_por']), ('PENDIENTE', [], None))
        self.assertNotEqual(d['solicitante_id'], 'U-999')

    def test_solo_bodega_solicita(self):
        for rol in ('FINANZAS', 'OPERACIONES', 'ADMIN', 'TECNICO', 'AUDITOR', 'COMERCIAL'):
            self.assertEqual(self.solicitar(rol=rol).status_code, 403, rol)

    def test_validaciones_de_la_solicitud(self):
        self.assertEqual(self.solicitar(items=[]).status_code, 422)
        self.assertEqual(self.solicitar(items=[{'articulo_id': 'ART-001', 'cantidad': 0}]).status_code, 422)
        self.assertEqual(self.solicitar(items=[{'articulo_id': 'ART-999', 'cantidad': 1}]).status_code, 422)
        self.assertEqual(self.solicitar(items=[{'articulo_id': 'ART-001', 'cantidad': 1}, {'articulo_id': 'ART-001', 'cantidad': 1}]).status_code, 422)
        self.assertEqual(self.solicitar(motivo='  ').status_code, 422)

    def test_crear_la_solicitud_avisa_a_finanzas(self):
        self.solicitar()
        n = Notification.objects.get()
        self.assertEqual((n.usuario_destino.role, n.tipo), ('FINANZAS', 'GENERAL'))
        self.assertIn('SC-0001', n.mensaje)

    def test_finanzas_aprueba_y_se_emite_una_orden_por_proveedor_al_ultimo_costo(self):
        self.solicitar()
        r = self.post('FINANZAS', '/api/erp/solicitudes-compra/SC-0001/emitir/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['ordenes'], ['OC-0001', 'OC-0002'])
        s = self.datos('solicitudes_compra', 'SC-0001')
        self.assertEqual((s['estado'], s['orden_ids']), ('APROBADA', ['OC-0001', 'OC-0002']))
        oc1, oc2 = self.datos('ordenes_compra', 'OC-0001'), self.datos('ordenes_compra', 'OC-0002')
        self.assertEqual((oc1['proveedor_id'], oc1['neto'], oc1['iva'], oc1['total']), ('PRV-001', 10000, 1900, 11900))  # 10 × 1.000
        self.assertEqual((oc2['proveedor_id'], oc2['neto'], oc2['total']), ('PRV-002', 10000, 11900))  # 2 × 5.000
        self.assertEqual(oc1['items'][0]['precio_unitario'], 1000)
        self.assertEqual((oc1['estado'], oc1['solicitud_id']), ('EMITIDA', 'SC-0001'))
        aviso = Notification.objects.filter(tipo='BODEGA_APROBADA').get()
        self.assertEqual(aviso.usuario_destino.role, 'JEFE_BODEGA')
        self.assertIn('OC-0001', aviso.mensaje)
        self.assertEqual(Registro.objects.filter(tabla='auditoria').last().datos['accion'], 'APROBAR_SOLICITUD_COMPRA')

    def test_solo_finanzas_aprueba_y_una_sola_vez(self):
        self.solicitar()
        for rol in ('JEFE_BODEGA', 'OPERACIONES', 'TECNICO', 'AUDITOR', 'COMERCIAL', 'ADMIN'):
            self.assertEqual(self.post(rol, '/api/erp/solicitudes-compra/SC-0001/emitir/').status_code, 403, rol)
        self.assertEqual(self.post('FINANZAS', '/api/erp/solicitudes-compra/SC-0001/emitir/').status_code, 200)
        self.assertEqual(self.post('FINANZAS', '/api/erp/solicitudes-compra/SC-0001/emitir/').status_code, 409)
        self.assertEqual(Registro.objects.filter(tabla='ordenes_compra').count(), 2)

    def test_no_se_emite_si_un_articulo_no_tiene_proveedor_ni_costo_y_no_deja_ordenes_a_medias(self):
        art = Registro.objects.get(tabla='articulos', rid='ART-002')
        art.datos = {**art.datos, 'proveedor_id': None}; art.save()
        self.solicitar()
        r = self.post('FINANZAS', '/api/erp/solicitudes-compra/SC-0001/emitir/')
        self.assertEqual(r.status_code, 422)
        self.assertIn('proveedor', r.json()['detail'])
        self.assertEqual(Registro.objects.filter(tabla='ordenes_compra').count(), 0)
        self.assertEqual(self.datos('solicitudes_compra', 'SC-0001')['estado'], 'PENDIENTE')

    def test_rechazar_exige_motivo_y_le_llega_a_bodega(self):
        self.solicitar()
        self.assertEqual(self.post('FINANZAS', '/api/erp/solicitudes-compra/SC-0001/rechazar/', {'motivo': ' '}).status_code, 422)
        self.assertEqual(self.post('JEFE_BODEGA', '/api/erp/solicitudes-compra/SC-0001/rechazar/', {'motivo': 'x'}).status_code, 403)
        self.assertEqual(self.post('FINANZAS', '/api/erp/solicitudes-compra/SC-0001/rechazar/', {'motivo': 'Hay stock en otra bodega'}).status_code, 200)
        s = self.datos('solicitudes_compra', 'SC-0001')
        self.assertEqual((s['estado'], s['motivo_rechazo']), ('RECHAZADA', 'Hay stock en otra bodega'))
        self.assertEqual(Registro.objects.filter(tabla='ordenes_compra').count(), 0)
        self.assertIn('Hay stock en otra bodega', Notification.objects.filter(usuario_destino__role='JEFE_BODEGA').get().mensaje)

    def test_nadie_fabrica_ordenes_ni_cambia_solicitudes_por_el_lote_generico(self):
        self.solicitar()
        orden = {'id': 'OC-0001', 'proveedor_id': 'PRV-001', 'items': [], 'neto': 1, 'iva': 0, 'total': 1}
        for rol in ('FINANZAS', 'JEFE_BODEGA', 'ADMIN'):
            self.assertEqual(self.insertar(rol, 'ordenes_compra', orden).status_code, 403, rol)
            self.assertEqual(self.parchar(rol, 'solicitudes_compra', 'SC-0001', {'estado': 'APROBADA'}).status_code, 403, rol)

    def test_lectura_por_rol(self):
        self.solicitar()
        for rol in ('FINANZAS', 'JEFE_BODEGA', 'ADMIN', 'AUDITOR'):
            self.assertEqual(len(self.snap(rol)['solicitudes_compra']), 1, rol)
        self.assertEqual(self.snap('RRHH')['solicitudes_compra'], [])
