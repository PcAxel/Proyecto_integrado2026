import datetime as dt

from django.utils import timezone

from accounts.tests.base import RoleTestCase
from asistencia.models import MarcaAsistencia
from personal.models import Trabajador


class RelojControlTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.tec = self.users['TECNICO']
        self.ficha = Trabajador.objects.create(rut='1-9', nombres='Tomás', apellidos='Vera', cargo='Técnico', usuario=self.tec)

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

    def test_tecnico_sin_ficha(self):
        otro = self.users['OPERACIONES']
        self.client.force_authenticate(self.users['TECNICO'])
        self.ficha.usuario = None
        self.ficha.save()
        self.assertEqual(self.marcar('ENTRADA').status_code, 403)

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
        fila = next(f for f in r.data if f['tecnico_id'] == self.ficha.pk)
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
    def test_rrhh_edita_tarifa_y_estado_vehiculo(self):
        t = Trabajador.objects.create(rut='2-7', nombres='Ana', apellidos='Soto', cargo='Técnico', tarifa_hora=7000)
        self.as_role('RRHH')
        r = self.client.patch(f'/api/trabajadores/{t.pk}/', {'costo_hora_hombre': 8200}, format='json')
        self.assertEqual((r.status_code, r.data['costo_hora_hombre'], r.data['nombre']), (200, 8200, 'Ana Soto'))

        from flota.models import Vehiculo
        v = Vehiculo.objects.create(patente='AB-1234', marca='Toyota', modelo='Hilux')
        r = self.client.patch(f'/api/vehiculos/{v.pk}/', {'estado': 'EN_TALLER'}, format='json')
        self.assertEqual((r.status_code, r.data['estado']), (200, 'EN_TALLER'))

    def test_finanzas_solo_lee_personal(self):
        t = Trabajador.objects.create(rut='3-5', nombres='Luis', apellidos='Mora', cargo='Ayudante')
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get('/api/trabajadores/').status_code, 200)
        self.assertEqual(self.client.patch(f'/api/trabajadores/{t.pk}/', {'costo_hora_hombre': 1}, format='json').status_code, 403)

    def test_operaciones_y_tecnico_no_ven_personal(self):
        for rol in ('OPERACIONES', 'TECNICO'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/trabajadores/').status_code, 403, rol)
