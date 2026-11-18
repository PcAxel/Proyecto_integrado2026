from datetime import datetime, timezone

from erp import finanzas
from facturacion.models import FacturaDTE

from .test_autocompletar import ErpBase, crear


class ResumenTributarioTests(ErpBase):
    def setUp(self):
        super().setUp()
        # Compras de noviembre: 1.000.000 + 500.000 netos; nota de crédito de 100.000; una factura de octubre que no cuenta
        crear('facturas', 'FC-0001', numero='1', proveedor_id='PRV-001', fecha='2026-11-03', neto=1000000, iva=190000, items=[])
        crear('facturas', 'FC-0002', numero='2', proveedor_id='PRV-001', fecha='2026-11-20', neto=500000, iva=95000, items=[])
        crear('facturas', 'FC-0003', numero='3', proveedor_id='PRV-001', fecha='2026-10-31', neto=9000000, iva=1710000, items=[])
        crear('notas_credito', 'NC-0001', numero='n1', factura_id='FC-0001', fecha='2026-11-10', neto=100000, iva=19000, total=119000, motivo='x')
        # Ventas: dos aceptadas en noviembre, una rechazada y una de octubre que no cuentan
        def dte(orden, folio, estado, dia, mes, neto):
            FacturaDTE.objects.create(orden_id=orden, folio_sii=folio, estado_sii=estado, monto_neto=neto, monto_iva=round(neto * 0.19), monto_total=round(neto * 1.19), pdf_archivo='x.pdf',
                                      emitido_en=datetime(2026, mes, dia, 15, 0, tzinfo=timezone.utc))
        dte('OB-1', 1, 'ACEPTADO', 5, 11, 2000000)
        dte('OB-2', 2, 'ACEPTADO', 15, 11, 1000000)
        dte('OB-3', 3, 'RECHAZADO', 16, 11, 7000000)
        dte('OB-4', 4, 'ACEPTADO', 28, 10, 5000000)

    def test_ganancia_gastos_e_iva_del_mes(self):
        d = finanzas.resumen_tributario('2026-11')
        self.assertEqual(d['ventas'], {'cantidad': 2, 'neto': 3000000, 'iva': 570000})
        self.assertEqual((d['compras']['neto'], d['compras']['iva']), (1400000, 266000))  # (1.000.000+500.000−100.000) y (190.000+95.000−19.000)
        self.assertEqual(d['ganancia_neta'], 1600000)
        self.assertEqual(d['iva'], {'debito': 570000, 'credito': 266000, 'saldo': 304000, 'situacion': 'A_PAGAR'})
        self.assertEqual(d['margen_pct'], 53.3)

    def test_iva_a_favor_cuando_compras_superan_ventas(self):
        d = finanzas.resumen_tributario('2026-10')  # 5.000.000 vendidos vs 9.000.000 comprados
        self.assertEqual(d['iva']['saldo'], 950000 - 1710000)
        self.assertEqual(d['iva']['situacion'], 'A_FAVOR')
        self.assertEqual(d['ganancia_neta'], 5000000 - 9000000)

    def test_mes_sin_movimientos(self):
        d = finanzas.resumen_tributario('2025-01')
        self.assertEqual((d['ganancia_neta'], d['iva']['saldo'], d['iva']['situacion'], d['margen_pct']), (0, 0, 'SIN_SALDO', None))

    def test_endpoint_permisos_y_validacion(self):
        for rol in ('FINANZAS', 'ADMIN', 'AUDITOR'):
            self.as_role(rol)
            r = self.client.get('/api/erp/finanzas/resumen/', {'mes': '2026-11'})
            self.assertEqual(r.status_code, 200, rol)
            self.assertEqual(r.json()['ganancia_neta'], 1600000)
        for rol in ('JEFE_BODEGA', 'OPERACIONES', 'RRHH', 'COMERCIAL'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/erp/finanzas/resumen/').status_code, 403, rol)
        self.as_role('FINANZAS')
        for malo in ('2026-13', 'noviembre', '2026'):
            self.assertEqual(self.client.get('/api/erp/finanzas/resumen/', {'mes': malo}).status_code, 400, malo)
        self.assertEqual(self.client.get('/api/erp/finanzas/resumen/').json()['periodo'], finanzas.rango_del_mes()[0])
