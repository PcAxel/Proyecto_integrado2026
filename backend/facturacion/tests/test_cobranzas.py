"""Cuentas por cobrar: pagos de clientes, saldo y paso de la factura a PAGADA."""
from datetime import timedelta

from django.utils import timezone

from accounts.tests.base import RoleTestCase
from erp.models import Registro
from facturacion.models import FacturaDTE, PagoCliente


class CobranzasTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        Registro.objects.create(tabla='obras', rid='OB-0001', datos={'nombre': 'Cámara 3', 'estado': 'FINALIZADA', 'etapa': 'FACTURADO', 'tecnicos': []})
        self.f = FacturaDTE.objects.create(
            orden_id='OB-0001', folio_sii=10001, estado_sii='ACEPTADO', pdf_archivo='x.pdf', receptor_rut='99.000.001-8', receptor_razon_social='Cliente Demo 01',
            glosa='Cámara', monto_neto=100_000, monto_iva=19_000, monto_total=119_000, emitido_en=timezone.now() - timedelta(days=3))
        FacturaDTE.objects.create(orden_id='OB-0002', estado_sii='RECHAZADO', monto_total=50)  # no cuenta: no está aceptada

    def pagar(self, rol='FINANZAS', orden='OB-0001', **datos):
        self.as_role(rol)
        cuerpo = {'fecha': timezone.localdate().isoformat(), 'monto': 50_000, 'metodo': 'TRANSFERENCIA', 'referencia': 'TR-1', **datos}
        return self.client.post(f'/api/facturacion/{orden}/pagos/', cuerpo, format='json')

    def test_la_factura_aceptada_nace_pendiente_de_pago(self):
        self.as_role('FINANZAS')
        d = self.client.get('/api/facturacion/cobranzas/').json()
        self.assertEqual((d['por_cobrar'], d['cobrado'], d['pendientes'], len(d['facturas'])), (119_000, 0, 1, 1))
        self.assertEqual((d['facturas'][0]['estado_cobro'], d['facturas'][0]['saldo'], d['facturas'][0]['cliente']), ('PENDIENTE_PAGO', 119_000, 'Cliente Demo 01'))

    def test_quien_ve_y_quien_registra(self):
        for rol in ('FINANZAS', 'ADMIN', 'AUDITOR'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/facturacion/cobranzas/').status_code, 200, rol)
        for rol in ('JEFE_BODEGA', 'OPERACIONES', 'TECNICO', 'RRHH', 'COMERCIAL'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/facturacion/cobranzas/').status_code, 403, rol)
        for rol in ('ADMIN', 'AUDITOR', 'OPERACIONES', 'JEFE_BODEGA', 'TECNICO'):
            self.assertEqual(self.pagar(rol=rol).status_code, 403, rol)  # solo Finanzas registra
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/facturacion/cobranzas/').status_code, 401)

    def test_pago_parcial_y_luego_total_deja_la_factura_pagada(self):
        r = self.pagar(monto=50_000)
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual((d['pagado'], d['saldo'], d['estado_cobro']), (50_000, 69_000, 'PENDIENTE_PAGO'))
        self.assertEqual(len(d['pagos']), 1)
        r = self.pagar(monto=69_000, metodo='CHEQUE')
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual((d['saldo'], d['estado_cobro'], d['pagada_en']), (0, 'PAGADA', timezone.localdate().isoformat()))
        self.f.refresh_from_db()
        self.assertEqual(self.f.estado_cobro, 'PAGADA')
        self.assertEqual(Registro.objects.get(tabla='obras', rid='OB-0001').datos['etapa'], 'PAGADA')
        self.assertEqual(Registro.objects.filter(tabla='auditoria').last().datos['accion'], 'PAGAR_FACTURA')
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get('/api/facturacion/cobranzas/').json()['pendientes'], 0)

    def test_una_factura_pagada_no_acepta_mas_pagos(self):
        self.pagar(monto=119_000)
        self.assertEqual(self.pagar(monto=1).status_code, 409)
        self.assertEqual(PagoCliente.objects.count(), 1)

    def test_validaciones(self):
        manana = (timezone.localdate() + timedelta(days=1)).isoformat()
        antes = (timezone.localdate() - timedelta(days=10)).isoformat()
        casos = [dict(monto=0), dict(monto=-5), dict(monto=1.5), dict(monto='100'), dict(monto=True), dict(monto=119_001),
                 dict(metodo='BITCOIN'), dict(metodo=None), dict(fecha='ayer'), dict(fecha=manana), dict(fecha=antes)]
        for c in casos:
            self.assertEqual(self.pagar(**c).status_code, 422, c)
        self.assertEqual(self.pagar(orden='OB-0002').status_code, 404)  # rechazada: sin factura aceptada
        self.assertEqual(self.pagar(orden='OB-9999').status_code, 404)
        self.assertEqual(PagoCliente.objects.count(), 0)

    def test_el_monto_no_puede_superar_el_saldo_restante(self):
        self.pagar(monto=100_000)
        r = self.pagar(monto=20_000)
        self.assertEqual(r.status_code, 422)
        self.assertIn('saldo', r.json()['detail'])
