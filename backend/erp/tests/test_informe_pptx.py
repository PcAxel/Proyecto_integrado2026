import io

from pptx import Presentation
from pptx.enum.chart import XL_CHART_TYPE

from erp import informes
from erp.models import Registro

from .test_autocompletar import ErpBase, crear


class InformeEjecutivoTests(ErpBase):
    def setUp(self):
        super().setUp()
        crear('facturas', 'FC-0001', numero='1', proveedor_id='PRV-001', fecha='2026-10-05', neto=1000000, iva=190000, items=[])
        crear('presupuestos', 'PRE-0090', titulo='P', cliente_id='CLI-001', estado='APROBADO', precio_venta_neto=2000000,
              materiales=[{'articulo_id': 'ART-001', 'cantidad': 10, 'costo_unitario': 100000}], mano_obra=[], adicionales=[])
        o = Registro.objects.get(tabla='obras', rid='OB-0001')
        o.datos = {**o.datos, 'presupuesto_id': 'PRE-0090'}; o.save()
        crear('cardex', 'MOV-900001', tipo='ENTRADA_COMPRA', signo=1, cantidad=10, articulo_id='ART-001', costo_unitario=100000, obra_id=None, fecha='2026-10-05T10:00:00')
        crear('cardex', 'MOV-900002', tipo='SALIDA_OBRA', signo=-1, cantidad=4, articulo_id='ART-001', costo_unitario=100000, obra_id='OB-0001', fecha='2026-10-06T10:00:00')
        crear('facturas', 'FC-0002', numero='2', proveedor_id='PRV-001', fecha='2026-11-05', neto=3000000, iva=570000, items=[])

    def _pptx(self, rol):
        self.as_role(rol)
        return self.client.get('/api/erp/informe-ejecutivo/')

    def test_descarga_con_cuatro_diapositivas_y_graficos_nativos(self):
        r = self._pptx('FINANZAS')
        self.assertEqual(r.status_code, 200)
        self.assertIn('presentationml', r['Content-Type'])
        self.assertIn('attachment', r['Content-Disposition'])
        prs = Presentation(io.BytesIO(r.content))
        self.assertEqual(len(prs.slides), 4)
        tipos = [sh.chart.chart_type for sl in prs.slides for sh in sl.shapes if sh.has_chart]
        self.assertEqual(tipos, [XL_CHART_TYPE.COLUMN_CLUSTERED, XL_CHART_TYPE.PIE])

    def test_solo_roles_con_acceso_financiero(self):
        for rol in ('ADMIN', 'AUDITOR', 'OPERACIONES'):  # los que ya pueden leer compras, bodega, presupuestos y obras
            self.assertEqual(self._pptx(rol).status_code, 200, rol)
        for rol in ('JEFE_BODEGA', 'RRHH', 'COMERCIAL'):
            self.assertEqual(self._pptx(rol).status_code, 403, rol)
        self.client.credentials()
        self.assertIn(self.client.get('/api/erp/informe-ejecutivo/').status_code, (401, 403))

    def test_cifras_calculadas_por_el_orm(self):
        d = informes.informe_ejecutivo()
        facturas = [f.datos['neto'] for f in Registro.objects.filter(tabla='facturas')]
        self.assertEqual(d['compras']['total'], round(sum(facturas)))
        self.assertEqual(d['compras']['promedio'], round(sum(facturas) / len(facturas)))
        stock = informes.stock_por_articulo()
        esperado = sum(stock.get(a.rid, 0) * a.datos.get('costo_unitario', 0) for a in Registro.objects.filter(tabla='articulos') if stock.get(a.rid, 0) > 0)
        self.assertEqual(d['inventario']['total'], round(esperado))
        self.assertEqual(sum(v for _, v in d['inventario']['por_categoria']), d['inventario']['total'])
        self.assertEqual(d['obras'][0], {'obra': 'OB-0001', 'nombre': Registro.objects.get(tabla='obras', rid='OB-0001').datos['nombre'], 'presupuesto': 1000000, 'real': 400000})
        self.assertEqual(d['ejecucion_materiales']['ejecucion_pct'], 40.0)
