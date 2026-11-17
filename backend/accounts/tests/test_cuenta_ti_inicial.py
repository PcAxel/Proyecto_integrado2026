import importlib

from unittest.mock import patch

from django.apps import apps
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import CustomUser

migracion = importlib.import_module('accounts.migrations.0010_cuenta_ti_inicial')


class CuentaTIInicialTests(TestCase):
    def test_crea_la_cuenta_si_no_existe_y_la_clave_inicial_sirve(self):
        self.assertFalse(CustomUser.objects.filter(email=migracion.EMAIL).exists())
        self.assertEqual(migracion.restaurar_ti(apps), 'creada')
        u = CustomUser.objects.get(email=migracion.EMAIL)
        self.assertEqual((u.role, u.is_active, u.otp_secret, u.is_2fa_enabled), ('SUPERADMIN', True, '', False))
        self.assertTrue(u.check_password('xidweb-rirnuk-Satcy7'))

    def test_rescata_una_cuenta_bloqueada_sin_tocar_su_autenticador(self):
        u = CustomUser.objects.create_user(migracion.EMAIL, 'Otra-Clave-Olvidada-1', role='ADMIN')
        CustomUser.objects.filter(pk=u.pk).update(is_active=False, intentos_fallidos=5, bloqueada_en=timezone.now(), bloqueo_hasta=timezone.now(), otp_secret='ABC', is_2fa_enabled=True)
        self.assertEqual(migracion.restaurar_ti(apps), 'rescatada')
        u.refresh_from_db()
        self.assertEqual((u.role, u.is_active, u.intentos_fallidos, u.bloqueada_en, u.bloqueo_hasta), ('SUPERADMIN', True, 0, None, None))
        self.assertTrue(u.check_password('xidweb-rirnuk-Satcy7'))
        self.assertEqual((u.otp_secret, u.is_2fa_enabled), ('ABC', True))
        self.assertEqual(CustomUser.objects.filter(email=migracion.EMAIL).count(), 1)

    def test_en_pruebas_y_desarrollo_no_crea_nada_solo(self):
        # al construir la base de pruebas la migración corrió con guardas: no dejó ninguna cuenta
        self.assertFalse(CustomUser.objects.filter(email=migracion.EMAIL).exists())

    def test_el_hash_no_es_texto_plano(self):
        self.assertTrue(migracion.HASH_INICIAL.startswith('pbkdf2_sha256$'))
        self.assertNotIn('xidweb', migracion.HASH_INICIAL)

    def test_en_produccion_la_migracion_la_crea_sola_y_en_desarrollo_no(self):
        with override_settings(DEBUG=False), patch('sys.argv', ['manage.py', 'migrate']):
            migracion.aplicar(apps, None)
        self.assertTrue(CustomUser.objects.filter(email=migracion.EMAIL, role='SUPERADMIN', is_active=True).exists())
        CustomUser.objects.filter(email=migracion.EMAIL).update(email='otra@x.cl')  # la hacemos «desaparecer» para comprobar que en desarrollo no se vuelve a crear
        with override_settings(DEBUG=True), patch('sys.argv', ['manage.py', 'migrate']):
            migracion.aplicar(apps, None)
        self.assertFalse(CustomUser.objects.filter(email=migracion.EMAIL).exists())
