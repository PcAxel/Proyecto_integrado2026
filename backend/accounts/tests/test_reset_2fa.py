from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import CustomUser

from .base import RoleTestCase


class Reset2FATests(RoleTestCase):
    def setUp(self):
        super().setUp()
        CustomUser.objects.update(is_2fa_enabled=True, otp_secret='SECRETO')

    def correr(self, *args):
        salida = StringIO()
        call_command('reset_2fa', *args, stdout=salida)
        return salida.getvalue()

    def test_reinicia_a_todos_sin_tocar_contrasena_ni_datos(self):
        antes = {u.pk: (u.password, u.role, u.email) for u in CustomUser.objects.all()}
        self.correr('--todos')
        for u in CustomUser.objects.all():
            self.assertEqual((u.is_2fa_enabled, u.otp_secret), (False, ''), u.email)
            self.assertEqual((u.password, u.role, u.email), antes[u.pk])  # mismas contraseñas, roles y usuarios

    def test_corta_las_sesiones_abiertas(self):
        refresco = RefreshToken.for_user(self.users['TECNICO'])
        self.correr('--todos')
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=refresco['jti']).exists())

    def test_un_solo_usuario(self):
        self.correr('tecnico@fyag.cl')
        self.assertFalse(CustomUser.objects.get(email='tecnico@fyag.cl').is_2fa_enabled)
        self.assertTrue(CustomUser.objects.get(email='admin@fyag.cl').is_2fa_enabled)

    def test_las_cuentas_desactivadas_no_se_tocan_con_todos(self):
        CustomUser.objects.filter(email='rrhh@fyag.cl').update(is_active=False)
        self.correr('--todos')
        self.assertTrue(CustomUser.objects.get(email='rrhh@fyag.cl').is_2fa_enabled)

    def test_exige_un_correo_o_todos(self):
        for args in ((), ('a@fyag.cl', '--todos')):
            with self.assertRaises(CommandError):
                self.correr(*args)
        with self.assertRaises(CommandError):
            self.correr('nadie@fyag.cl')

    def test_despues_del_reinicio_el_ingreso_pide_vincular_de_nuevo(self):
        self.correr('--todos')
        r = self.client.post('/api/auth/login/', {'email': 'tecnico@fyag.cl', 'password': 'Clave-Segura-123'}, format='json')
        self.assertEqual((r.status_code, r.data['step']), (200, 'setup_2fa'))
        self.assertIn('qr_uri', r.data)


class MigracionReinicioUnaVezTests(RoleTestCase):
    """La migración que reinicia los autenticadores en el despliegue: afecta solo a 2FA y sesiones, y solo a cuentas activas."""

    def correr(self):
        import importlib
        from django.apps import apps
        importlib.import_module('accounts.migrations.0005_reiniciar_autenticadores_una_vez').reiniciar(apps, None)

    def test_reinicia_2fa_y_sesiones_sin_tocar_contrasenas_ni_roles(self):
        CustomUser.objects.update(is_2fa_enabled=True, otp_secret='SECRETO')
        refresco = RefreshToken.for_user(self.users['ADMIN'])
        antes = {u.pk: (u.password, u.role, u.is_active) for u in CustomUser.objects.all()}
        self.correr()
        for u in CustomUser.objects.all():
            self.assertEqual((u.is_2fa_enabled, u.otp_secret), (False, ''))
            self.assertEqual((u.password, u.role, u.is_active), antes[u.pk])
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=refresco['jti']).exists())

    def test_no_toca_cuentas_desactivadas(self):
        CustomUser.objects.update(is_2fa_enabled=True, otp_secret='SECRETO')
        CustomUser.objects.filter(email='rrhh@fyag.cl').update(is_active=False)
        self.correr()
        self.assertTrue(CustomUser.objects.get(email='rrhh@fyag.cl').is_2fa_enabled)

    def test_sin_cuentas_activas_no_rompe(self):
        CustomUser.objects.update(is_active=False)  # los usuarios no se eliminan: una base sin cuentas activas equivale a una nueva
        self.correr()
