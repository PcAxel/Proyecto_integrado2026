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


class LibroIvaTests(ErpBase):
    def setUp(self):
        super().setUp()
        def dte(folio, mes, neto):
            FacturaDTE.objects.create(orden_id=f'OB-{folio}', folio_sii=folio, estado_sii='ACEPTADO', monto_neto=neto, monto_iva=round(neto * 0.19), monto_total=round(neto * 1.19),
                                      pdf_archivo='x.pdf', receptor_razon_social='Cliente SA', receptor_rut='76.000.000-0', emitido_en=datetime(2026, mes, 10, 15, 0, tzinfo=timezone.utc))
        crear('proveedores', 'PRV-009', razon_social='Frío Sur', rut='77.777.777-7', activo=True)
        # Septiembre: compras 1.000.000 (IVA 190.000), sin ventas → remanente 190.000
        crear('facturas', 'FC-0101', numero='s1', proveedor_id='PRV-009', fecha='2026-09-12', neto=1000000, iva=190000, total=1190000, items=[])
        # Octubre: ventas 2.000.000 (IVA 380.000), compras 500.000 (IVA 95.000) → débito−crédito = 285.000; menos remanente 190.000 = 95.000 a pagar
        dte(11, 10, 2000000)
        crear('facturas', 'FC-0102', numero='o1', proveedor_id='PRV-009', fecha='2026-10-05', neto=500000, iva=95000, total=595000, items=[])
        # Noviembre: solo compras 300.000 (IVA 57.000) y una nota de crédito de 100.000 (IVA 19.000) → crédito 38.000 → remanente 38.000
        crear('facturas', 'FC-0103', numero='n1', proveedor_id='PRV-009', fecha='2026-11-02', neto=300000, iva=57000, total=357000, items=[])
        crear('notas_credito', 'NC-0101', numero='nc1', factura_id='FC-0103', fecha='2026-11-04', neto=100000, iva=19000, total=119000, motivo='Devolución')

    def test_el_remanente_se_arrastra_y_reduce_el_iva_a_pagar(self):
        libro = {f['mes']: f for f in finanzas.libro_iva('2026-11')}
        self.assertEqual((libro['2026-09']['a_pagar'], libro['2026-09']['remanente_final']), (0, 190000))
        self.assertEqual((libro['2026-10']['remanente_anterior'], libro['2026-10']['a_pagar'], libro['2026-10']['remanente_final']), (190000, 95000, 0))
        self.assertEqual((libro['2026-11']['credito'], libro['2026-11']['a_pagar'], libro['2026-11']['remanente_final']), (38000, 0, 38000))

    def test_detalle_del_mes_con_documentos(self):
        d = finanzas.impuestos_del_mes('2026-10')
        self.assertEqual(d['iva'], {'debito': 380000, 'credito': 95000, 'saldo': 285000, 'remanente_anterior': 190000, 'a_pagar': 95000, 'remanente_siguiente': 0, 'situacion': 'A_PAGAR'})
        self.assertEqual([v['folio'] for v in d['ventas']['documentos']], [11])
        self.assertEqual(d['ventas']['documentos'][0]['cliente'], 'Cliente SA')
        self.assertEqual([(c['numero'], c['proveedor'], c['rut'], c['iva']) for c in d['compras']['documentos']], [('o1', 'Frío Sur', '77.777.777-7', 95000)])
        n = finanzas.impuestos_del_mes('2026-11')
        self.assertEqual([(x['numero'], x['factura'], x['iva']) for x in n['compras']['notas_credito']], [('nc1', 'n1', 19000)])
        self.assertEqual(n['iva']['situacion'], 'REMANENTE')
        self.assertEqual(len(n['historial']), 3)

    def test_mes_sin_movimiento_conserva_el_remanente(self):
        d = finanzas.impuestos_del_mes('2026-12')
        self.assertEqual((d['iva']['remanente_anterior'], d['iva']['remanente_siguiente'], d['iva']['situacion']), (38000, 38000, 'REMANENTE'))

    def test_endpoint_permisos(self):
        for rol, esperado in (('FINANZAS', 200), ('ADMIN', 200), ('AUDITOR', 200), ('JEFE_BODEGA', 403), ('RRHH', 403), ('OPERACIONES', 403)):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/erp/finanzas/impuestos/', {'mes': '2026-10'}).status_code, esperado, rol)
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get('/api/erp/finanzas/impuestos/', {'mes': 'x'}).status_code, 400)
