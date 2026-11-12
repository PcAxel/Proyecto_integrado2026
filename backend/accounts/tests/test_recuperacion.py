"""Recuperar la contraseña con un código por correo."""
import re
from datetime import timedelta

from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import CustomUser, RecuperacionPassword, Role

NUEVA = 'Otra-Clave-Mas-Larga-9'


class RecuperacionTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.u = CustomUser.objects.create_user('a@fyag.cl', 'Clave-Segura-123', role=Role.FINANZAS, first_name='Ana')

    def pedir(self, correo='a@fyag.cl'):
        return self.client.post('/api/auth/recuperar/', {'email': correo}, format='json')

    def codigo(self):
        return re.search(r'es: (\d{6})', mail.outbox[-1].body).group(1)

    def confirmar(self, codigo, password=NUEVA, correo='a@fyag.cl'):
        return self.client.post('/api/auth/recuperar/confirmar/', {'email': correo, 'codigo': codigo, 'password': password}, format='json')

    def test_flujo_completo_cambia_la_contrasena_y_reinicia_los_fallos(self):
        CustomUser.objects.filter(pk=self.u.pk).update(intentos_fallidos=4, bloqueo_hasta=timezone.now() + timedelta(minutes=1))
        self.assertEqual(self.pedir().status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['a@fyag.cl'])
        self.assertEqual(self.confirmar(self.codigo()).status_code, 200)
        self.u.refresh_from_db()
        self.assertTrue(self.u.check_password(NUEVA))
        self.assertEqual((self.u.intentos_fallidos, self.u.bloqueo_hasta), (0, None))
        self.assertEqual(self.client.post('/api/auth/login/', {'email': 'a@fyag.cl', 'password': NUEVA}, format='json').status_code, 200)

    def test_la_respuesta_es_la_misma_exista_o_no_el_correo(self):
        a, b = self.pedir(), self.pedir('nadie@fyag.cl')
        self.assertEqual((a.status_code, a.data), (b.status_code, b.data))
        self.assertEqual(len(mail.outbox), 1)  # solo a la cuenta real

    def test_el_codigo_no_se_guarda_en_claro(self):
        self.pedir()
        self.assertNotIn(self.codigo(), RecuperacionPassword.objects.get().codigo_hash)

    def test_el_codigo_sirve_una_sola_vez(self):
        self.pedir()
        c = self.codigo()
        self.assertEqual(self.confirmar(c).status_code, 200)
        self.assertEqual(self.confirmar(c, 'Y-otra-clave-larga-77').status_code, 400)

    def test_codigo_vencido_o_incorrecto(self):
        self.pedir()
        c = self.codigo()
        malo = '000000' if c != '000000' else '111111'
        self.assertEqual(self.confirmar(malo).data['code'], 'invalid_code')
        RecuperacionPassword.objects.update(expira_en=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.confirmar(c).status_code, 400)
        self.u.refresh_from_db()
        self.assertTrue(self.u.check_password('Clave-Segura-123'))

    def test_cinco_codigos_malos_anulan_el_codigo_bueno(self):
        self.pedir()
        c = self.codigo()
        malo = '000000' if c != '000000' else '111111'
        for _ in range(5):
            cache.delete('throttle_login_127.0.0.1')
            self.confirmar(malo)
        cache.delete('throttle_login_127.0.0.1')
        self.assertEqual(self.confirmar(c).status_code, 400)

    def test_una_contrasena_debil_se_rechaza_sin_gastar_el_codigo(self):
        self.pedir()
        c = self.codigo()
        r = self.confirmar(c, '12345678')
        self.assertEqual((r.status_code, r.data['code']), (400, 'weak_password'))
        self.assertEqual(self.confirmar(c).status_code, 200)

    def test_un_codigo_nuevo_anula_el_anterior(self):
        self.pedir()
        primero = self.codigo()
        self.pedir()
        segundo = self.codigo()
        if primero != segundo:
            self.assertEqual(self.confirmar(primero).status_code, 400)
        self.assertEqual(self.confirmar(segundo).status_code, 200)

    def test_maximo_tres_codigos_por_hora_por_correo(self):
        for _ in range(5):
            self.pedir()
        self.assertEqual(len(mail.outbox), 3)

    def test_cuenta_bloqueada_o_desactivada_no_recibe_codigo(self):
        CustomUser.objects.filter(pk=self.u.pk).update(is_active=False, bloqueada_en=timezone.now())
        self.assertEqual(self.pedir().status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_recuperar_cierra_las_sesiones_abiertas(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
        from rest_framework_simplejwt.tokens import RefreshToken
        RefreshToken.for_user(self.u)
        self.pedir()
        self.confirmar(self.codigo())
        self.assertEqual(BlacklistedToken.objects.filter(token__user=self.u).count(), 1)

    def test_recuperar_no_toca_el_autenticador(self):
        CustomUser.objects.filter(pk=self.u.pk).update(is_2fa_enabled=True, otp_secret='ABC')
        self.pedir()
        self.confirmar(self.codigo())
        self.u.refresh_from_db()
        self.assertEqual((self.u.is_2fa_enabled, self.u.otp_secret), (True, 'ABC'))

    def test_el_tecnico_tambien_puede_recuperar(self):
        t = CustomUser.objects.create_user('t@fyag.cl', 'Clave-Segura-123', role=Role.TECNICO)
        CustomUser.objects.filter(pk=t.pk).update(intentos_fallidos=7, bloqueo_hasta=timezone.now() + timedelta(minutes=20))
        self.pedir('t@fyag.cl')
        self.assertEqual(self.confirmar(self.codigo(), correo='t@fyag.cl').status_code, 200)
        t.refresh_from_db()
        self.assertEqual((t.intentos_fallidos, t.bloqueo_hasta), (0, None))

    def test_sin_servicio_de_correo_en_produccion_no_se_imprime_el_codigo(self):
        from django.test import override_settings
        with override_settings(DEBUG=False, EMAIL_BACKEND='django.core.mail.backends.console.EmailBackend'):
            self.assertEqual(self.pedir().status_code, 200)
        self.assertEqual(RecuperacionPassword.objects.count(), 0)
