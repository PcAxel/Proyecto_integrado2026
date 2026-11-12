import pyotp
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import CustomUser, Role


class AuthFlowTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = CustomUser.objects.create_user('tec@fyag.cl', 'Clave-Segura-123', role=Role.TECNICO)

    def login(self, password='Clave-Segura-123'):
        return self.client.post('/api/auth/login/', {'email': 'tec@fyag.cl', 'password': password}, format='json')

    def test_first_login_returns_setup_step_and_never_a_jwt(self):
        r = self.login()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['step'], 'setup_2fa')
        self.assertNotIn('access', r.data)
        uri = r.data['qr_uri']
        self.assertTrue(uri.startswith('otpauth://totp/FYAG-ERP:tec%40fyag.cl?secret='))
        self.assertTrue(uri.endswith('&issuer=FYAG'))
        self.assertIn(r.data['secret'], uri)
        self.assertTrue(r.data['temp_token'])

    def test_setup_secret_is_not_persisted_until_confirmed(self):
        self.login()
        self.user.refresh_from_db()
        self.assertEqual(self.user.otp_secret, '')
        self.assertFalse(self.user.is_2fa_enabled)

    def test_bad_credentials(self):
        self.assertEqual(self.login('mala').status_code, 400)

    def test_full_flow_setup_then_login_with_code(self):
        setup = self.login().data
        bad = self.client.post('/api/auth/verify-setup-2fa/', {'temp_token': setup['temp_token'], 'code': '000000'}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_2fa_enabled)  # un código erróneo no activa nada

        code = pyotp.TOTP(setup['secret']).now()
        ok = self.client.post('/api/auth/verify-setup-2fa/', {'temp_token': setup['temp_token'], 'code': code}, format='json')
        self.assertEqual(ok.status_code, 200)
        self.assertIn('access', ok.data)
        self.assertNotIn('refresh', ok.data)  # el refresh viaja solo en la cookie HttpOnly
        cookie = ok.cookies['fyag_refresh']
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Lax')
        self.assertEqual(cookie['path'], '/api/auth/')
        self.assertEqual(ok.data['user']['role'], 'TECNICO')
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_2fa_enabled)
        self.assertEqual(self.user.otp_secret, setup['secret'])

        # Siguiente login: ya no hay QR, se pide el código
        cache.clear()  # el límite de 5/min es compartido por todos los endpoints de login
        again = self.login().data
        self.assertEqual(again['step'], 'verify_2fa')
        self.assertNotIn('qr_uri', again)
        v = self.client.post('/api/auth/2fa/verify/', {'challenge_token': again['challenge_token'], 'code': pyotp.TOTP(setup['secret']).now()}, format='json')
        self.assertEqual(v.status_code, 200)
        self.assertIn('access', v.data)

        # Con el 2FA activo el flujo de vinculación queda cerrado
        replay = self.client.post('/api/auth/verify-setup-2fa/', {'temp_token': setup['temp_token'], 'code': pyotp.TOTP(setup['secret']).now()}, format='json')
        self.assertEqual(replay.status_code, 400)

    def test_each_first_login_gets_a_fresh_secret(self):
        self.assertNotEqual(self.login().data['secret'], self.login().data['secret'])

    def test_invalid_or_tampered_temp_token_rejected(self):
        r = self.client.post('/api/auth/verify-setup-2fa/', {'temp_token': 'basura', 'code': '123456'}, format='json')
        self.assertEqual(r.status_code, 401)
        token = self.login().data['temp_token']
        r = self.client.post('/api/auth/verify-setup-2fa/', {'temp_token': token[:-2] + 'xx', 'code': '123456'}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_code_must_be_six_digits(self):
        t = self.login().data['temp_token']
        self.assertEqual(self.client.post('/api/auth/verify-setup-2fa/', {'temp_token': t, 'code': '12ab'}, format='json').status_code, 400)

    def test_verify_with_unconfigured_challenge_rejected(self):
        """Un desafío de login de alguien sin 2FA no sirve para entrar por el camino de verificación normal."""
        from accounts.views import make_challenge
        r = self.client.post('/api/auth/2fa/verify/', {'challenge_token': make_challenge(self.user), 'code': '123456'}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_login_throttle_5_per_minute(self):
        codes = []
        for _ in range(7):
            CustomUser.objects.update(bloqueo_hasta=None)  # la espera entre intentos es otra defensa (ver test_bloqueo); aquí se prueba el límite por IP
            codes.append(self.login('mala').status_code)
        self.assertEqual(codes[:5], [400] * 5)
        self.assertEqual(codes[5:], [429, 429])


class OnboardingTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = CustomUser.objects.create_user('admin@fyag.cl', 'Clave-Segura-123', role=Role.ADMIN,
                                                terms_accepted_at=timezone.now())
        self.tecnico = CustomUser.objects.create_user('tec@fyag.cl', 'Clave-Segura-123', role=Role.TECNICO,
                                                  terms_accepted_at=timezone.now())
        self.payload = {'email': 'Nuevo@fyag.cl', 'first_name': 'Ana', 'last_name': 'Pérez', 'role': 'OPERACIONES'}

    def test_requires_auth(self):
        self.assertEqual(self.client.post('/api/users/', self.payload, format='json').status_code, 401)

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(self.tecnico)
        self.assertEqual(self.client.post('/api/users/', self.payload, format='json').status_code, 403)

    @override_settings(PWA_INSTALL_URL='https://erp.fyag.cl/app')
    def test_admin_creates_user_and_email_sent(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post('/api/users/', self.payload, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.data['email_sent'])
        self.assertNotIn('password', r.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['nuevo@fyag.cl'])
        self.assertIn('https://erp.fyag.cl/app', mail.outbox[0].body)
        self.assertIn('Contraseña temporal', mail.outbox[0].body)
        self.assertTrue(CustomUser.objects.get(email='nuevo@fyag.cl').has_usable_password())

    def test_duplicate_email(self):
        self.client.force_authenticate(self.admin)
        self.payload['email'] = 'tec@fyag.cl'
        self.assertEqual(self.client.post('/api/users/', self.payload, format='json').status_code, 400)
