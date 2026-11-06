from accounts.tests.base import RoleTestCase
from presupuestos.models import Presupuesto, PresupuestoItem


class AprobacionTests(RoleTestCase):
    def crear(self, costo):
        p = Presupuesto.objects.create(codigo=f'P-{costo}', cliente='ACME', estado='ENVIADO', costo_estimado=costo)
        PresupuestoItem.objects.create(presupuesto=p, descripcion='x', cantidad=1, precio_unitario=1000)
        return p

    def aprobar(self, p):
        return self.client.patch(f'/api/presupuestos/{p.pk}/', {'estado': 'APROBADO'}, format='json')

    def test_finanzas_aprueba_con_margen_suficiente(self):
        self.as_role('FINANZAS')
        self.assertEqual(self.aprobar(self.crear(700)).status_code, 200)  # margen 30 %

    def test_margen_bajo_solo_admin(self):
        p = self.crear(900)  # margen 10 %
        self.as_role('FINANZAS')
        self.assertEqual(self.aprobar(p).status_code, 400)
        self.as_role('ADMIN')
        self.assertEqual(self.aprobar(p).status_code, 200)

    def test_operaciones_no_puede_aprobar(self):
        self.as_role('OPERACIONES')
        self.assertEqual(self.aprobar(self.crear(700)).status_code, 403)
