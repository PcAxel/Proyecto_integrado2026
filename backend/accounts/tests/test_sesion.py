import pyotp
from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.models import CustomUser, Role

CLIENTE = {'HTTP_X_FYAG_CLIENT': 'web'}


class SesionCookieTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = CustomUser.objects.create_user('tec@fyag.cl', 'Clave-Segura-123', role=Role.TECNICO)
        self.user.otp_secret, self.user.is_2fa_enabled = pyotp.random_base32(), True
        self.user.save()

    def entrar(self):
        cache.clear()
        ch = self.client.post('/api/auth/login/', {'email': 'tec@fyag.cl', 'password': 'Clave-Segura-123'}, format='json').data['challenge_token']
        return self.client.post('/api/auth/2fa/verify/', {'challenge_token': ch, 'code': pyotp.TOTP(self.user.otp_secret).now()}, format='json')

    def test_login_no_entrega_refresh_en_el_cuerpo_y_si_en_cookie_httponly(self):
        r = self.entrar()
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('refresh', r.data)
        self.assertTrue(r.cookies['fyag_refresh']['httponly'])

    def test_refresh_renueva_y_rota_la_cookie(self):
        self.entrar()
        vieja = self.client.cookies['fyag_refresh'].value
        r = self.client.post('/api/auth/refresh/', **CLIENTE)
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)
        self.assertEqual(r.data['user']['email'], 'tec@fyag.cl')
        self.assertNotEqual(self.client.cookies['fyag_refresh'].value, vieja)

    def test_un_refresh_ya_usado_queda_anulado(self):
        self.entrar()
        vieja = self.client.cookies['fyag_refresh'].value
        self.client.post('/api/auth/refresh/', **CLIENTE)
        self.client.cookies['fyag_refresh'] = vieja  # un atacante reutiliza el token robado
        self.assertEqual(self.client.post('/api/auth/refresh/', **CLIENTE).status_code, 401)

    def test_refresh_exige_el_encabezado_del_cliente(self):
        self.entrar()
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 403)

    def test_sin_cookie_no_hay_sesion(self):
        self.assertEqual(self.client.post('/api/auth/refresh/', **CLIENTE).status_code, 401)

    def test_logout_invalida_el_refresh_y_borra_la_cookie(self):
        self.entrar()
        vieja = self.client.cookies['fyag_refresh'].value
        r = self.client.post('/api/auth/logout/', **CLIENTE)
        self.assertEqual(r.status_code, 204)
        self.assertEqual(r.cookies['fyag_refresh'].value, '')
        self.client.cookies['fyag_refresh'] = vieja
        self.assertEqual(self.client.post('/api/auth/refresh/', **CLIENTE).status_code, 401)

    def test_el_access_token_abre_la_api_pero_la_cookie_sola_no(self):
        r = self.entrar()
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)  # la cookie no autentica la API
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)
