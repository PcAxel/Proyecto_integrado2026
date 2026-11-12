from django.test import TestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import CustomUser, Role, UsuariosNoSeEliminan

from .base import RoleTestCase


class DesactivacionDeUsuariosTests(RoleTestCase):
    """Regla de negocio: los usuarios NUNCA se eliminan (trazabilidad); el Administrador los desactiva o reactiva."""

    def url(self, rol, accion):
        return f'/api/users/{self.users[rol].pk}/{accion}/'

    def test_el_admin_desactiva_y_la_cuenta_conserva_su_historial(self):
        admin = self.as_role('ADMIN')
        r = self.client.post(self.url('FINANZAS', 'desactivar'))
        self.assertEqual(r.status_code, 200)
        u = CustomUser.objects.get(pk=self.users['FINANZAS'].pk)
        self.assertFalse(u.is_active)
        self.assertIsNotNone(u.deactivated_at)
        self.assertEqual(u.deactivated_by_id, admin.pk)
        self.assertEqual(r.data['is_active'], False)
        self.assertTrue(CustomUser.objects.filter(pk=u.pk).exists())  # el perfil sigue ahí

    def test_una_cuenta_desactivada_no_puede_iniciar_sesion(self):
        self.as_role('ADMIN')
        self.client.post(self.url('TECNICO', 'desactivar'))
        self.client.force_authenticate(None)
        r = self.client.post('/api/auth/login/', {'email': 'tecnico@fyag.cl', 'password': 'Clave-Segura-123'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['detail'], 'Credenciales inválidas.')

    def test_desactivar_corta_las_sesiones_abiertas(self):
        refresco = RefreshToken.for_user(self.users['OPERACIONES'])
        self.as_role('ADMIN')
        self.client.post(self.url('OPERACIONES', 'desactivar'))
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=refresco['jti']).exists())

    def test_reactivar_devuelve_el_acceso(self):
        self.as_role('ADMIN')
        self.client.post(self.url('RRHH', 'desactivar'))
        r = self.client.post(self.url('RRHH', 'reactivar'))
        self.assertEqual(r.status_code, 200)
        u = CustomUser.objects.get(pk=self.users['RRHH'].pk)
        self.assertTrue(u.is_active)
        self.assertIsNone(u.deactivated_at)

    def test_es_idempotente(self):
        self.as_role('ADMIN')
        self.assertEqual(self.client.post(self.url('TECNICO', 'desactivar')).status_code, 200)
        self.assertEqual(self.client.post(self.url('TECNICO', 'desactivar')).status_code, 200)
        self.assertEqual(self.client.post(self.url('FINANZAS', 'reactivar')).status_code, 200)  # ya estaba activa

    def test_nadie_se_desactiva_a_si_mismo(self):
        self.as_role('ADMIN')
        r = self.client.post(self.url('ADMIN', 'desactivar'))
        self.assertEqual((r.status_code, r.data['code']), (400, 'self_deactivation'))
        self.assertTrue(CustomUser.objects.get(pk=self.users['ADMIN'].pk).is_active)

    def test_siempre_queda_un_administrador_activo(self):
        segundo = CustomUser.objects.create_user('socio@fyag.cl', 'Clave-Segura-123', role=Role.ADMIN, terms_accepted_at=self.users['ADMIN'].terms_accepted_at)
        self.as_role('ADMIN')
        self.assertEqual(self.client.post(f'/api/users/{segundo.pk}/desactivar/').status_code, 200)  # queda el original
        self.client.force_authenticate(segundo)
        r = self.client.post(self.url('ADMIN', 'desactivar'))  # el otro ya no está activo: sería el último
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['code'], 'last_admin')

    def test_solo_el_admin_puede_desactivar_o_reactivar(self):
        for rol in ('FINANZAS', 'OPERACIONES', 'TECNICO', 'RRHH'):
            self.as_role(rol)
            for accion in ('desactivar', 'reactivar'):
                self.assertEqual(self.client.post(self.url('TECNICO' if rol != 'TECNICO' else 'RRHH', accion)).status_code, 403, f'{rol} {accion}')
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.url('TECNICO', 'desactivar')).status_code, 401)

    def test_usuario_inexistente_da_404(self):
        self.as_role('ADMIN')
        self.assertEqual(self.client.post('/api/users/999999/desactivar/').status_code, 404)

    def test_no_existe_ninguna_via_http_para_eliminar(self):
        self.as_role('ADMIN')
        pk = self.users['TECNICO'].pk
        for ruta in ('/api/users/', f'/api/users/{pk}/', f'/api/users/{pk}/desactivar/', f'/api/users/{pk}/eliminar/'):
            self.assertIn(self.client.delete(ruta).status_code, (404, 405), ruta)
        self.assertTrue(CustomUser.objects.filter(pk=pk).exists())


class LosUsuariosNoSeEliminanTests(TestCase):
    def test_delete_de_instancia_y_de_queryset_se_rechazan(self):
        u = CustomUser.objects.create_user('x@fyag.cl', 'Clave-Segura-123')
        with self.assertRaises(UsuariosNoSeEliminan):
            u.delete()
        with self.assertRaises(UsuariosNoSeEliminan):
            CustomUser.objects.filter(pk=u.pk).delete()
        self.assertTrue(CustomUser.objects.filter(pk=u.pk).exists())
