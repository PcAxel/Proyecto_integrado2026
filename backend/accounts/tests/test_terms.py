from django.test import override_settings
from django.utils import timezone

from accounts.models import CustomUser, Role

from .base import RoleTestCase


@override_settings(TERMS_VERSION='v-test')
class TermsTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.nuevo = CustomUser.objects.create_user('nuevo@fyag.cl', 'Clave-Segura-123', role=Role.TECNICO)

    def accept(self, version='v-test', **kw):
        return self.client.post('/api/auth/accept-terms/', {'version': version}, format='json', **kw)

    def test_requires_authentication(self):
        self.assertEqual(self.accept().status_code, 401)

    def test_accept_records_time_ip_and_version(self):
        self.client.force_authenticate(self.nuevo)
        antes = timezone.now()
        r = self.accept(REMOTE_ADDR='203.0.113.7')
        self.assertEqual(r.status_code, 200)
        self.nuevo.refresh_from_db()
        self.assertGreaterEqual(self.nuevo.terms_accepted_at, antes)
        self.assertEqual(self.nuevo.terms_accepted_ip, '203.0.113.7')
        self.assertEqual(self.nuevo.terms_version, 'v-test')
        self.assertIsNotNone(r.data['terms_accepted_at'])

    def test_client_cannot_spoof_ip_with_header(self):
        self.client.force_authenticate(self.nuevo)
        self.accept(REMOTE_ADDR='203.0.113.7', HTTP_X_FORWARDED_FOR='1.2.3.4')
        self.nuevo.refresh_from_db()
        self.assertEqual(self.nuevo.terms_accepted_ip, '203.0.113.7')

    def test_accept_is_idempotent_and_keeps_first_evidence(self):
        self.client.force_authenticate(self.nuevo)
        self.accept(REMOTE_ADDR='203.0.113.7')
        self.nuevo.refresh_from_db()
        primera = self.nuevo.terms_accepted_at
        self.accept(REMOTE_ADDR='198.51.100.9')
        self.nuevo.refresh_from_db()
        self.assertEqual(self.nuevo.terms_accepted_at, primera)
        self.assertEqual(self.nuevo.terms_accepted_ip, '203.0.113.7')

    def test_outdated_version_rejected(self):
        self.client.force_authenticate(self.nuevo)
        r = self.accept(version='vieja')
        self.assertEqual(r.status_code, 409)
        self.nuevo.refresh_from_db()
        self.assertIsNone(self.nuevo.terms_accepted_at)

    def test_blocks_every_operational_endpoint_until_accepted(self):
        self.client.force_authenticate(self.nuevo)
        for url in ('/api/obras/', '/api/reportes/', '/api/articulos/', '/api/presupuestos/',
                    '/api/vehiculos/', '/api/trabajadores/', '/api/cardex/'):
            r = self.client.get(url)
            self.assertEqual(r.status_code, 403, url)
            self.assertEqual(r.data['detail'].code, 'terms_not_accepted', url)
        self.assertEqual(self.client.post('/api/evidencias/', {}, format='multipart').status_code, 403)
        self.assertEqual(self.client.get('/api/evidencias/abc/foto/').status_code, 403)

    def test_otros_roles_no_necesitan_aceptar_terminos(self):
        """Solo el Técnico acepta términos: Administrador, Finanzas, Operaciones y RR. HH. entran al ERP sin esa pantalla."""
        for rol in (Role.ADMIN, Role.FINANZAS, Role.OPERACIONES, Role.RRHH):
            u = CustomUser.objects.create_user(f'{rol.lower()}-sin-terminos@fyag.cl', 'Clave-Segura-123', role=rol)
            self.assertIsNone(u.terms_accepted_at)
            self.client.force_authenticate(u)
            self.assertEqual(self.client.get('/api/erp/snapshot/').status_code, 200, rol)

    def test_el_tecnico_sigue_bloqueado_hasta_aceptar(self):
        self.client.force_authenticate(self.nuevo)
        r = self.client.get('/api/erp/snapshot/')
        self.assertEqual((r.status_code, r.data['detail'].code), (403, 'terms_not_accepted'))
        self.assertEqual(self.accept().status_code, 200)  # al aceptar, el Técnico entra
        self.assertEqual(self.client.get('/api/erp/snapshot/').status_code, 200)


class ErrorCodeAndHealthTests(RoleTestCase):
    def test_403_body_carries_machine_readable_code(self):
        nuevo = CustomUser.objects.create_user('n2@fyag.cl', 'Clave-Segura-123', role=Role.TECNICO)
        self.client.force_authenticate(nuevo)
        r = self.client.get('/api/obras/')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()['code'], 'terms_not_accepted')

    def test_role_403_has_permission_denied_code(self):
        self.as_role('TECNICO')
        r = self.client.get('/api/presupuestos/')
        self.assertEqual((r.status_code, r.json()['code']), (403, 'permission_denied'))

    def test_health_is_public_and_ok(self):
        r = self.client.get('/api/health/')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'ok'}))

    def test_user_list_is_admin_only(self):
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get('/api/users/').status_code, 403)
        self.as_role('ADMIN')
        r = self.client.get('/api/users/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual({u['role'] for u in r.json()}, set(Role.values))
        self.assertTrue(all('otp_secret' not in u and 'password' not in u for u in r.json()))
