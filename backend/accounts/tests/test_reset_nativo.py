import re
from unittest.mock import Mock, patch

from anymail.exceptions import AnymailAPIError
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse

from accounts import correo
from accounts.models import CustomUser

CLAVE_VIEJA = 'Clave-Vieja-2026'
CLAVE_NUEVA = 'Clave-Nueva-Segura-9'


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', DEFAULT_FROM_EMAIL='FYAG ERP <no-reply@fyag.cl>')
class ResetNativoTests(TestCase):
    def setUp(self):
        cache.clear()
        self.u = CustomUser.objects.create_user('ana@fyag.cl', CLAVE_VIEJA, role='FINANZAS', first_name='Ana')

    def pedir(self, correo='ana@fyag.cl'):
        return self.client.post(reverse('password_reset'), {'email': correo})

    def test_las_cuatro_urls_estan_enlazadas(self):
        self.assertEqual(reverse('password_reset'), '/api/auth/reset/')
        self.assertEqual(reverse('password_reset_done'), '/api/auth/reset/done/')
        self.assertEqual(reverse('password_reset_complete'), '/api/auth/reset/complete/')
        self.assertTrue(reverse('password_reset_confirm', args=['abc', 'tok']).startswith('/api/auth/reset/confirm/'))
        for nombre in ('password_reset', 'password_reset_done', 'password_reset_complete'):
            r = self.client.get(reverse(nombre))
            self.assertEqual(r.status_code, 200, nombre)
            self.assertContains(r, 'FYAG')

    def test_flujo_completo_pedir_enlace_cambiar_clave_y_entrar(self):
        r = self.pedir()
        self.assertRedirects(r, reverse('password_reset_done'))
        self.assertEqual(len(mail.outbox), 1)
        m = mail.outbox[0]
        self.assertEqual((m.to, m.subject), (['ana@fyag.cl'], 'Crea tu contraseña nueva del ERP de FYAG'))
        enlace = re.search(r'https?://[^\s]+/api/auth/reset/confirm/[^\s]+', m.body).group(0)
        ruta = enlace.split('testserver')[-1] if 'testserver' in enlace else '/' + enlace.split('/', 3)[3]
        r = self.client.get(ruta, follow=True)  # Django guarda el token en sesión y redirige a /set-password/
        self.assertContains(r, 'Nueva contraseña')
        url_form = r.redirect_chain[-1][0]
        r = self.client.post(url_form, {'new_password1': '123', 'new_password2': '123'})
        self.assertContains(r, 'caracteres')  # las reglas de siempre
        r = self.client.post(url_form, {'new_password1': CLAVE_NUEVA, 'new_password2': CLAVE_NUEVA})
        self.assertRedirects(r, reverse('password_reset_complete'))
        self.u.refresh_from_db()
        self.assertTrue(self.u.check_password(CLAVE_NUEVA))
        # y el enlace no sirve dos veces
        self.assertContains(self.client.get(ruta, follow=True), 'Enlace no válido')

    def test_no_revela_si_el_correo_existe(self):
        a = self.pedir('ana@fyag.cl')
        b = self.pedir('nadie@fyag.cl')
        self.assertEqual((a.status_code, a.url), (b.status_code, b.url))
        self.assertEqual(len(mail.outbox), 1)  # solo salió el de la cuenta real

    def test_limite_de_tres_por_hora_y_cuenta_inactiva_no_recibe(self):
        for _ in range(5):
            self.assertRedirects(self.pedir(), reverse('password_reset_done'))
        self.assertEqual(len(mail.outbox), 3)
        mail.outbox.clear()
        cache.clear()
        CustomUser.objects.filter(pk=self.u.pk).update(is_active=False)
        self.pedir()
        self.assertEqual(len(mail.outbox), 0)

    def test_un_fallo_del_proveedor_no_tumba_la_pantalla_ni_delata(self):
        with patch('django.contrib.auth.forms.PasswordResetForm.send_mail', side_effect=RuntimeError('proveedor caído')):
            self.assertRedirects(self.pedir(), reverse('password_reset_done'))

    def test_al_cambiar_la_clave_se_quita_el_bloqueo_y_se_cierran_las_sesiones(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
        from rest_framework_simplejwt.tokens import RefreshToken
        RefreshToken.for_user(self.u)
        CustomUser.objects.filter(pk=self.u.pk).update(intentos_fallidos=3)
        self.pedir()
        enlace = re.search(r'/api/auth/reset/confirm/[^\s]+', mail.outbox[0].body).group(0)
        r = self.client.get(enlace, follow=True)
        self.client.post(r.redirect_chain[-1][0], {'new_password1': CLAVE_NUEVA, 'new_password2': CLAVE_NUEVA})
        self.u.refresh_from_db()
        self.assertEqual(self.u.intentos_fallidos, 0)
        self.assertEqual(BlacklistedToken.objects.filter(token__user=self.u).count(), OutstandingToken.objects.filter(user=self.u).count())


class ProveedorResendTests(TestCase):
    def error(self, codigo, mensaje):
        resp = Mock(status_code=codigo)
        resp.json.return_value = {'message': mensaje}
        e = AnymailAPIError('x', response=resp)
        e.status_code = codigo
        return e

    @override_settings(DEFAULT_FROM_EMAIL='FYAG ERP <no-reply@fyag.cl>')
    def test_cada_rechazo_de_resend_tiene_su_explicacion(self):
        self.assertIn('RESEND_API_KEY', correo.explicar_resend(self.error(401, 'API key is invalid')))
        self.assertIn('modo de pruebas', correo.explicar_resend(self.error(403, 'You can only send testing emails to your own email address (a@b.cl)')))
        self.assertIn('no está verificado', correo.explicar_resend(self.error(403, 'The fyag.cl domain is not verified.')))
        self.assertIn('no-reply@fyag.cl', correo.explicar_resend(self.error(403, 'otro motivo')))
        self.assertIn('espera', correo.explicar_resend(self.error(429, '')).lower())

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_probar_traduce_el_error_de_anymail(self):
        with patch('accounts.correo.send_mail', side_effect=self.error(403, 'The fyag.cl domain is not verified.')):
            d = correo.probar('a@b.cl')
        self.assertFalse(d['ok'])
        self.assertIn('Domains', d['motivo'])
