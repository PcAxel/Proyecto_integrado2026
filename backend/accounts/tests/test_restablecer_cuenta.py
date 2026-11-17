import os
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from accounts.models import CustomUser


class RestablecerCuentaTests(TestCase):
    def correr(self, email, clave='Clave-Nueva-2026', **kw):
        entorno = {'FYAG_CUENTA_PASSWORD': clave} if clave is not None else {}
        with patch.dict('os.environ', entorno):
            if clave is None:
                os.environ.pop('FYAG_CUENTA_PASSWORD', None)
            salida = StringIO()
            call_command('restablecer_cuenta', email, stdout=salida, **kw)
        return salida.getvalue()

    def test_crea_la_cuenta_si_no_existe_y_pide_el_rol(self):
        with self.assertRaises(CommandError):
            self.correr('ti@apexsystems.cl')
        self.assertIn('Cuenta creada', self.correr('ti@apexsystems.cl', rol='SUPERADMIN', nombre='Jefatura TI'))
        u = CustomUser.objects.get(email='ti@apexsystems.cl')
        self.assertEqual((u.role, u.is_active, u.otp_secret), ('SUPERADMIN', True, ''))
        self.assertTrue(u.check_password('Clave-Nueva-2026'))

    def test_devuelve_el_acceso_a_una_cuenta_bloqueada_con_clave_olvidada(self):
        u = CustomUser.objects.create_user('ti@apexsystems.cl', 'Clave-Vieja-123', role='SUPERADMIN', terms_accepted_at=timezone.now())
        CustomUser.objects.filter(pk=u.pk).update(is_active=False, intentos_fallidos=5, bloqueada_en=timezone.now(), bloqueo_hasta=timezone.now(), otp_secret='ABC', is_2fa_enabled=True)
        self.assertIn('Acceso restablecido', self.correr('TI@apexsystems.cl'))
        u.refresh_from_db()
        self.assertTrue(u.check_password('Clave-Nueva-2026'))
        self.assertEqual((u.is_active, u.intentos_fallidos, u.bloqueada_en, u.bloqueo_hasta), (True, 0, None, None))
        self.assertEqual((u.otp_secret, u.is_2fa_enabled), ('ABC', True))  # el autenticador no se toca

    def test_exige_contrasena_valida_por_entorno(self):
        for clave in (None, '123'):
            with self.assertRaises(CommandError):
                self.correr('x@fyag.cl', clave=clave, rol='RRHH')
        self.assertFalse(CustomUser.objects.filter(email='x@fyag.cl').exists())
