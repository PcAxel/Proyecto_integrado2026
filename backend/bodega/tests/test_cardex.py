from accounts.tests.base import RoleTestCase
from bodega.models import Articulo
from obras.models import Obra


class CardexTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.art = Articulo.objects.create(codigo='CU-12', nombre='Cañería cobre 1/2')
        self.obra = Obra.objects.create(codigo='O-1', nombre='Cámara fría', cliente='ACME')
        self.as_role('OPERACIONES')

    def mov(self, **kw):
        return self.client.post('/api/cardex/', {'articulo': self.art.pk, **kw}, format='json')

    def test_entrada_salida_y_saldo(self):
        self.assertEqual(self.mov(tipo='ENTRADA', cantidad='10').data['saldo'], '10.00')
        r = self.mov(tipo='SALIDA', cantidad='4', obra=self.obra.pk)
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['saldo'], '6.00')
        self.art.refresh_from_db()
        self.assertEqual(self.art.stock, 6)

    def test_salida_sin_stock_rechazada(self):
        r = self.mov(tipo='SALIDA', cantidad='1', obra=self.obra.pk)
        self.assertEqual(r.status_code, 400)

    def test_salida_exige_obra(self):
        self.mov(tipo='ENTRADA', cantidad='5')
        self.assertEqual(self.mov(tipo='SALIDA', cantidad='1').status_code, 400)

    def test_cardex_inmutable(self):
        mid = self.mov(tipo='ENTRADA', cantidad='5').data['id']
        self.assertEqual(self.client.delete(f'/api/cardex/{mid}/').status_code, 405)
        self.assertEqual(self.client.patch(f'/api/cardex/{mid}/', {'cantidad': 99}, format='json').status_code, 405)

    def test_stock_no_editable_por_api(self):
        self.client.patch(f'/api/articulos/{self.art.pk}/', {'stock': 999}, format='json')
        self.art.refresh_from_db()
        self.assertEqual(self.art.stock, 0)
