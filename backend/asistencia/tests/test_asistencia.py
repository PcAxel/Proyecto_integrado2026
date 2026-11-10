import datetime as dt

from django.utils import timezone

from accounts.tests.base import RoleTestCase
from asistencia.models import MarcaAsistencia


class RelojControlTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.tec = self.users['TECNICO']

    def marcar(self, tipo, **extra):
        return self.client.post('/api/asistencia/marcar/', {'tipo': tipo, 'lat': -36.6, 'lng': -72.1, **extra}, format='json')

    def test_secuencia_estricta_entrada_salida(self):
        self.as_role('TECNICO')
        self.assertEqual(self.marcar('SALIDA').status_code, 409)  # sin entrada
        self.assertEqual(self.marcar('ENTRADA').status_code, 201)
        r = self.marcar('ENTRADA')
        self.assertEqual((r.status_code, r.data['detail']), (409, 'Acción inválida: Ya registraste tu entrada. Debes marcar salida.'))
        self.assertEqual(self.marcar('SALIDA').status_code, 201)
        r = self.marcar('SALIDA')
        self.assertEqual((r.status_code, r.data['detail']), (409, 'Acción inválida: Ya registraste tu salida. Debes marcar entrada.'))

    def test_idempotente_por_client_id(self):
        self.as_role('TECNICO')
        a = self.marcar('ENTRADA', client_id='abc')
        b = self.marcar('ENTRADA', client_id='abc')
        self.assertEqual((a.status_code, b.status_code, a.data['id']), (201, 200, b.data['id']))
        self.assertEqual(MarcaAsistencia.objects.count(), 1)

    def test_hora_futura_rechazada(self):
        self.as_role('TECNICO')
        futura = (timezone.now() + dt.timedelta(hours=2)).isoformat()
        self.assertEqual(self.marcar('ENTRADA', fecha=futura).status_code, 400)

    def test_gps_invalido_rechazado(self):
        self.as_role('TECNICO')
        r = self.client.post('/api/asistencia/marcar/', {'tipo': 'ENTRADA', 'lat': 95, 'lng': 0}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_solo_el_tecnico_marca(self):
        for rol in ('FINANZAS', 'OPERACIONES', 'RRHH'):
            self.as_role(rol)
            self.assertEqual(self.marcar('ENTRADA').status_code, 403, rol)

    def test_una_cuenta_desactivada_no_aparece_en_la_asistencia_de_hoy(self):
        from accounts.models import CustomUser
        self.as_role('RRHH')
        CustomUser.objects.filter(pk=self.tec.pk).update(is_active=False)
        self.assertNotIn(self.tec.pk, [f['tecnico_id'] for f in self.client.get('/api/asistencia/hoy/').data])

    def test_mi_dia(self):
        self.as_role('TECNICO')
        self.marcar('ENTRADA')
        r = self.client.get('/api/asistencia/mi-dia/')
        self.assertEqual([m['tipo'] for m in r.data['marcas']], ['ENTRADA'])

    def test_rrhh_ve_asistencia_de_hoy_y_otros_no(self):
        self.as_role('TECNICO')
        self.marcar('ENTRADA')
        self.as_role('RRHH')
        r = self.client.get('/api/asistencia/hoy/')
        self.assertEqual(r.status_code, 200)
        fila = next(f for f in r.data if f['tecnico_id'] == self.tec.pk)
        self.assertEqual(fila['estado'], 'EN_JORNADA')
        self.assertIsNotNone(fila['entrada'])
        for rol in ('FINANZAS', 'OPERACIONES', 'TECNICO'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/asistencia/hoy/').status_code, 403, rol)

    def test_sin_marca_es_pendiente_o_ausente(self):
        self.as_role('RRHH')
        fila = self.client.get('/api/asistencia/hoy/').data[0]
        self.assertIn(fila['estado'], ('PENDIENTE', 'AUSENTE'))


class PersonalFlotaTests(RoleTestCase):
    def test_rrhh_edita_estado_vehiculo(self):
        self.as_role('RRHH')
        from flota.models import Vehiculo
        v = Vehiculo.objects.create(patente='AB-1234', marca='Toyota', modelo='Hilux', tecnico=self.users['TECNICO'])
        r = self.client.patch(f'/api/vehiculos/{v.pk}/', {'estado': 'EN_TALLER'}, format='json')
        self.assertEqual((r.status_code, r.data['estado'], r.data['tecnico']), (200, 'EN_TALLER', self.users['TECNICO'].pk))
        self.assertEqual(r.data['tecnico_nombre'], self.users['TECNICO'].email)

    def test_el_endpoint_antiguo_de_trabajadores_ya_no_existe(self):
        self.as_role('ADMIN')
        self.assertEqual(self.client.get('/api/trabajadores/').status_code, 404)
