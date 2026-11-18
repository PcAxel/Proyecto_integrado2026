import importlib
from unittest.mock import patch

from django.apps import apps
from django.test import TestCase, override_settings

from accounts.models import CustomUser

m = importlib.import_module('accounts.migrations.0011_correo_real_de_ti')


class CorreoRealDeTITests(TestCase):
    def antigua(self, **extra):
        return CustomUser.objects.create_user(m.CORREO_ANTIGUO, 'Clave-Segura-2026', role='SUPERADMIN', **extra)

    def test_cambia_el_correo_y_conserva_todo_lo_demas(self):
        u = self.antigua()
        CustomUser.objects.filter(pk=u.pk).update(otp_secret='ABC', is_2fa_enabled=True)
        self.assertEqual(m.cambiar_correo_ti(apps), 'cambiado')
        u.refresh_from_db()
        self.assertEqual((u.email, u.role, u.otp_secret, u.is_2fa_enabled, u.is_active), (m.CORREO_NUEVO, 'SUPERADMIN', 'ABC', True, True))
        self.assertTrue(u.check_password('Clave-Segura-2026'))
        self.assertFalse(CustomUser.objects.filter(email=m.CORREO_ANTIGUO).exists())
        self.assertEqual(CustomUser.objects.filter(role='SUPERADMIN').count(), 1)

    def test_si_el_correo_nuevo_ya_existe_no_toca_nada(self):
        self.antigua()
        CustomUser.objects.create_user('ACELPLATA3000@gmail.com', 'Otra-Clave-2026', role='RRHH')
        self.assertEqual(m.cambiar_correo_ti(apps), 'sin_cambios')
        self.assertTrue(CustomUser.objects.filter(email=m.CORREO_ANTIGUO).exists())

    def test_si_no_hay_cuenta_antigua_crea_la_de_ti_con_el_correo_nuevo(self):
        self.assertEqual(m.cambiar_correo_ti(apps), 'creada')
        u = CustomUser.objects.get(email=m.CORREO_NUEVO)
        self.assertEqual((u.role, u.is_active), ('SUPERADMIN', True))
        self.assertTrue(u.check_password('xidweb-rirnuk-Satcy7'))

    def test_es_idempotente_y_en_produccion_corre_sola_pero_no_en_desarrollo(self):
        self.antigua()
        with override_settings(DEBUG=True), patch('sys.argv', ['manage.py', 'migrate']):
            m.aplicar(apps, None)
        self.assertTrue(CustomUser.objects.filter(email=m.CORREO_ANTIGUO).exists())  # en desarrollo no hace nada
        with override_settings(DEBUG=False), patch('sys.argv', ['manage.py', 'migrate']):
            m.aplicar(apps, None)
            m.aplicar(apps, None)  # una segunda vez no cambia nada más
        self.assertEqual(CustomUser.objects.filter(email=m.CORREO_NUEVO).count(), 1)

    def test_el_correo_esta_bien_escrito(self):
        self.assertEqual(m.CORREO_NUEVO, 'acelplata3000@gmail.com')
