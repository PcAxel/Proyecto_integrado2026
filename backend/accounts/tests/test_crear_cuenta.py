from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from accounts.models import CustomUser


class CrearCuentaTests(TestCase):
    def crear(self, email='bodega@fyag.cl', clave='Clave-Segura-2026', **kw):
        salida = StringIO()
        with patch.dict('os.environ', {'FYAG_CUENTA_PASSWORD': clave}):
            call_command('crear_cuenta', email, '--rol', 'JEFE_BODEGA', '--nombre', 'Jefe de Bodega', stdout=salida, **kw)
        return salida.getvalue()

    def test_crea_la_cuenta_con_su_rol_y_sin_autenticador(self):
        self.assertIn('Cuenta creada', self.crear())
        u = CustomUser.objects.get(email='bodega@fyag.cl')
        self.assertEqual((u.role, u.is_active, u.otp_secret, u.is_2fa_enabled), ('JEFE_BODEGA', True, '', False))
        self.assertTrue(u.check_password('Clave-Segura-2026'))

    def test_una_cuenta_existente_no_se_toca(self):
        self.crear()
        antes = CustomUser.objects.get(email='bodega@fyag.cl').password
        self.assertIn('ya existe', self.crear(clave='Otra-Clave-Distinta-9'))
        self.assertEqual(CustomUser.objects.get(email='bodega@fyag.cl').password, antes)
        CustomUser.objects.filter(email='bodega@fyag.cl').update(is_active=False)
        self.crear()  # tampoco reactiva una cuenta desactivada a propósito
        self.assertFalse(CustomUser.objects.get(email='bodega@fyag.cl').is_active)

    def test_exige_contrasena_valida_por_variable_de_entorno(self):
        with patch.dict('os.environ', {}, clear=False), self.assertRaises(CommandError):
            import os
            os.environ.pop('FYAG_CUENTA_PASSWORD', None)
            call_command('crear_cuenta', 'x@fyag.cl', '--rol', 'JEFE_BODEGA')
        with self.assertRaises(CommandError):
            self.crear(email='y@fyag.cl', clave='123')
        self.assertFalse(CustomUser.objects.filter(email__in=['x@fyag.cl', 'y@fyag.cl']).exists())
