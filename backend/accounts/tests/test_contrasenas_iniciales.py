from unittest.mock import patch

from accounts.models import CustomUser

from .base import RoleTestCase

CLAVE = 'Clave-Segura-2026'


class ContrasenaInicialTests(RoleTestCase):
    def crear(self, rol='SUPERADMIN', **extra):
        self.as_role(rol)
        return self.client.post('/api/users/', {'email': 'nuevo@fyag.cl', 'first_name': 'Nuevo', 'last_name': 'Usuario', 'role': 'JEFE_BODEGA', **extra}, format='json')

    def test_ti_fija_la_contrasena_y_se_le_devuelve_una_vez(self):
        with patch('accounts.views.send_onboarding_email') as correo:
            r = self.crear(password=CLAVE)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()['password_temporal'], r.json()['email_sent']), (CLAVE, True))
        u = CustomUser.objects.get(email='nuevo@fyag.cl')
        self.assertTrue(u.check_password(CLAVE))
        correo.assert_called_once()
        # nunca queda en las lecturas posteriores
        self.as_role('SUPERADMIN')
        self.assertNotIn('password_temporal', self.client.get('/api/users/').json()[0])

    def test_sin_contrasena_el_servidor_genera_una_y_se_la_muestra_aunque_el_correo_falle(self):
        with patch('accounts.views.send_onboarding_email', side_effect=RuntimeError('SMTP bloqueado')):
            r = self.crear()
        self.assertEqual(r.status_code, 201)
        d = r.json()
        self.assertFalse(d['email_sent'])
        self.assertGreaterEqual(len(d['password_temporal']), 10)
        self.assertTrue(CustomUser.objects.get(email='nuevo@fyag.cl').check_password(d['password_temporal']))

    def test_no_enviar_correo_si_no_se_quiere(self):
        with patch('accounts.views.send_onboarding_email') as correo:
            r = self.crear(password=CLAVE, enviar_correo=False)
        self.assertEqual((r.status_code, r.json()['email_sent']), (201, False))
        correo.assert_not_called()

    def test_la_contrasena_debe_cumplir_las_reglas(self):
        for mala in ('corta', '1234567890', 'password123', 'nuevo@fyag.cl', 12345):
            r = self.crear(password=mala)
            self.assertEqual(r.status_code, 400, mala)
            self.assertIn('password', r.json())
        self.assertFalse(CustomUser.objects.filter(email='nuevo@fyag.cl').exists())

    def test_quien_no_administra_accesos_no_crea(self):
        for rol in ('FINANZAS', 'OPERACIONES', 'JEFE_BODEGA', 'TECNICO', 'RRHH', 'COMERCIAL', 'AUDITOR'):
            self.assertEqual(self.crear(rol=rol, password=CLAVE).status_code, 403, rol)


class RestablecerContrasenaTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.objetivo = self.users['JEFE_BODEGA']

    def restablecer(self, rol='SUPERADMIN', pk=None, **datos):
        self.as_role(rol)
        return self.client.post(f'/api/users/{pk or self.objetivo.pk}/password/', datos, format='json')

    def test_ti_restablece_y_se_la_devuelve_una_vez(self):
        CustomUser.objects.filter(pk=self.objetivo.pk).update(intentos_fallidos=3)
        r = self.restablecer(password=CLAVE)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['password_temporal'], r.json()['email_sent']), (CLAVE, False))  # por defecto no manda correo
        self.objetivo.refresh_from_db()
        self.assertTrue(self.objetivo.check_password(CLAVE))
        self.assertEqual(self.objetivo.intentos_fallidos, 0)

    def test_sin_contrasena_genera_una_valida(self):
        d = self.restablecer().json()
        self.objetivo.refresh_from_db()
        self.assertTrue(self.objetivo.check_password(d['password_temporal']))

    def test_cierra_las_sesiones_abiertas_de_esa_cuenta(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
        from rest_framework_simplejwt.tokens import RefreshToken
        RefreshToken.for_user(self.objetivo)
        self.restablecer(password=CLAVE)
        self.assertEqual(BlacklistedToken.objects.filter(token__user=self.objetivo).count(), OutstandingToken.objects.filter(user=self.objetivo).count())

    def test_solo_ti_y_nunca_la_propia_cuenta(self):
        for rol in ('ADMIN', 'FINANZAS', 'OPERACIONES', 'JEFE_BODEGA', 'TECNICO', 'AUDITOR'):
            self.assertEqual(self.restablecer(rol=rol, password=CLAVE).status_code, 403, rol)
        self.assertEqual(self.restablecer(pk=self.users['SUPERADMIN'].pk, password=CLAVE).status_code, 403)
        self.assertEqual(self.restablecer(pk=999999, password=CLAVE).status_code, 404)
        self.assertFalse(CustomUser.objects.get(pk=self.objetivo.pk).check_password(CLAVE))

    def test_contrasena_invalida_no_cambia_nada(self):
        antes = CustomUser.objects.get(pk=self.objetivo.pk).password
        self.assertEqual(self.restablecer(password='123').status_code, 400)
        self.assertEqual(CustomUser.objects.get(pk=self.objetivo.pk).password, antes)
