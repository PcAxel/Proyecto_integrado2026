from accounts.tests.base import RoleTestCase
from notificaciones.models import Notification, notificar


class NotificacionesTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        notificar([self.users['FINANZAS']], 'Obra A lista para facturar.', Notification.Tipo.FACTURACION_LISTA)
        notificar([self.users['FINANZAS']], 'Obra B lista para facturar.', Notification.Tipo.FACTURACION_LISTA)
        notificar([self.users['OPERACIONES']], 'Aviso de otra persona.')

    def test_anonimo_no_accede(self):
        self.assertEqual(self.client.get('/api/notificaciones/').status_code, 401)
        self.assertEqual(self.client.post('/api/notificaciones/marcar-leidas/', {}, format='json').status_code, 401)

    def test_cada_persona_ve_solo_las_suyas_con_el_conteo(self):
        self.as_role('FINANZAS')
        d = self.client.get('/api/notificaciones/').json()
        self.assertEqual(d['no_leidas'], 2)
        self.assertEqual([n['mensaje'] for n in d['resultados']], ['Obra B lista para facturar.', 'Obra A lista para facturar.'])
        self.assertEqual({'id', 'mensaje', 'tipo', 'leida', 'fecha_creacion'}, set(d['resultados'][0]))
        self.as_role('RRHH')
        self.assertEqual(self.client.get('/api/notificaciones/').json(), {'no_leidas': 0, 'resultados': []})

    def test_marcar_algunas_o_todas_como_leidas(self):
        self.as_role('FINANZAS')
        primera = self.client.get('/api/notificaciones/').json()['resultados'][0]['id']
        r = self.client.post('/api/notificaciones/marcar-leidas/', {'ids': [primera]}, format='json').json()
        self.assertEqual((r['marcadas'], r['no_leidas']), (1, 1))
        r = self.client.post('/api/notificaciones/marcar-leidas/', {}, format='json').json()
        self.assertEqual((r['marcadas'], r['no_leidas']), (1, 0))
        solo = self.client.get('/api/notificaciones/?solo_no_leidas=1').json()
        self.assertEqual(solo['resultados'], [])

    def test_nadie_marca_las_de_otra_persona(self):
        ajena = Notification.objects.get(mensaje='Aviso de otra persona.')
        self.as_role('FINANZAS')
        r = self.client.post('/api/notificaciones/marcar-leidas/', {'ids': [ajena.id]}, format='json').json()
        self.assertEqual(r['marcadas'], 0)
        ajena.refresh_from_db()
        self.assertFalse(ajena.leida)

    def test_ids_invalidos(self):
        self.as_role('FINANZAS')
        for malo in ('x', [1, 'a'], [True], list(range(101))):
            self.assertEqual(self.client.post('/api/notificaciones/marcar-leidas/', {'ids': malo}, format='json').status_code, 400, malo)
