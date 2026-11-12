"""Espera creciente entre intentos, bloqueo de oficina a los 5 fallos, técnico sin bloqueo y desbloqueo por el Administrador."""
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts import bloqueo
from accounts.models import CustomUser, Role

BUENA = 'Clave-Segura-123'


class BloqueoBase(APITestCase):
    def setUp(self):
        cache.clear()
        self.of = CustomUser.objects.create_user('of@fyag.cl', BUENA, role=Role.FINANZAS)
        self.tec = CustomUser.objects.create_user('tec@fyag.cl', BUENA, role=Role.TECNICO)

    def intento(self, correo, clave='mala', esperar=True):
        """`esperar=True` salta la espera entre intentos (y el límite por IP) para probar la cuenta, no el reloj."""
        if esperar:
            CustomUser.objects.update(bloqueo_hasta=None)
            d = cache.get(f'login_fallos:{correo}')
            if d:  # correos sin cuenta: la espera vive en la caché
                cache.set(f'login_fallos:{correo}', {**d, 'hasta': None}, 3600)
            cache.delete('throttle_login_127.0.0.1')
        return self.client.post('/api/auth/login/', {'email': correo, 'password': clave}, format='json')


class EsperaTests(BloqueoBase):
    def test_tabla_de_esperas(self):
        self.assertEqual([bloqueo.espera_segundos(Role.FINANZAS, n) for n in (1, 2, 3, 4)], [5, 15, 30, 60])
        self.assertEqual([bloqueo.espera_segundos(Role.TECNICO, n) for n in (1, 2, 3, 4, 5, 6, 9, 30)], [5, 30, 60, 300, 600, 900, 1800, 3600])

    def test_cada_fallo_pide_esperar_mas_y_dice_cuantos_quedan(self):
        r = [self.intento('of@fyag.cl').data for _ in range(4)]
        self.assertEqual([x['intentos_restantes'] for x in r], [4, 3, 2, 1])
        self.assertEqual([x['espera_segundos'] for x in r], [5, 15, 30, 60])
        self.assertEqual([x['sugerir_recuperar'] for x in r], [False, False, True, True])  # desde el 3.º aparece «recuperar contraseña»
        self.assertEqual(r[0]['code'], 'invalid_credentials')

    def test_durante_la_espera_no_se_revisa_la_contrasena_ni_con_la_buena(self):
        self.intento('of@fyag.cl')
        r = self.intento('of@fyag.cl', BUENA, esperar=False)
        self.assertEqual((r.status_code, r.data['code']), (429, 'wait'))
        self.assertGreater(r.data['espera_segundos'], 0)
        self.assertLessEqual(r.data['espera_segundos'], 5)
        self.of.refresh_from_db()
        self.assertEqual(self.of.intentos_fallidos, 1)  # el intento bloqueado por espera no suma

    def test_cuando_la_espera_termina_se_puede_entrar(self):
        self.intento('of@fyag.cl')
        CustomUser.objects.update(bloqueo_hasta=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.intento('of@fyag.cl', BUENA, esperar=False).status_code, 200)

    def test_un_ingreso_correcto_reinicia_el_contador(self):
        for _ in range(4):
            self.intento('of@fyag.cl')
        self.assertEqual(self.intento('of@fyag.cl', BUENA).status_code, 200)
        self.of.refresh_from_db()
        self.assertEqual((self.of.intentos_fallidos, self.of.bloqueo_hasta), (0, None))
        self.assertEqual(self.intento('of@fyag.cl').data['intentos_restantes'], 4)

    def test_los_fallos_se_olvidan_tras_12_horas(self):
        for _ in range(4):
            self.intento('of@fyag.cl')
        CustomUser.objects.update(ultimo_fallo_en=timezone.now() - timedelta(hours=13), bloqueo_hasta=None)
        self.assertEqual(self.intento('of@fyag.cl').data['intentos_restantes'], 4)


class BloqueoOficinaTests(BloqueoBase):
    def bloquear(self):
        return [self.intento('of@fyag.cl') for _ in range(5)]

    def test_el_quinto_fallo_bloquea_y_manda_con_el_administrador(self):
        r = self.bloquear()
        self.assertEqual([x.status_code for x in r], [400, 400, 400, 400, 423])
        self.assertEqual(r[-1].data['code'], 'account_locked')
        self.assertIn('administrador', r[-1].data['detail'])
        self.of.refresh_from_db()
        self.assertFalse(self.of.is_active)
        self.assertIsNotNone(self.of.bloqueada_en)

    def test_bloqueada_ni_con_la_contrasena_correcta_entra(self):
        self.bloquear()
        r = self.intento('of@fyag.cl', BUENA)
        self.assertEqual((r.status_code, r.data['code']), (423, 'account_locked'))

    def test_la_cuenta_bloqueada_se_ve_bloqueada_para_el_admin(self):
        self.bloquear()
        admin = CustomUser.objects.create_user('adm@fyag.cl', BUENA, role=Role.ADMIN)
        self.client.force_authenticate(admin)
        fila = next(u for u in self.client.get('/api/users/').data if u['email'] == 'of@fyag.cl')
        self.assertEqual((fila['is_active'], fila['bloqueada']), (False, True))

    def test_el_admin_la_reactiva_con_el_boton_de_siempre_y_vuelve_a_entrar(self):
        self.bloquear()
        admin = CustomUser.objects.create_user('adm@fyag.cl', BUENA, role=Role.ADMIN)
        self.client.force_authenticate(admin)
        r = self.client.post(f'/api/users/{self.of.pk}/reactivar/')
        self.assertEqual((r.status_code, r.data['is_active'], r.data['bloqueada']), (200, True, False))
        self.client.force_authenticate(None)
        self.assertEqual(self.intento('of@fyag.cl', BUENA).status_code, 200)
        self.of.refresh_from_db()
        self.assertEqual(self.of.intentos_fallidos, 0)  # y empieza de cero

    def test_reactivar_tambien_limpia_una_espera_en_curso(self):
        self.intento('of@fyag.cl'); self.intento('of@fyag.cl')
        admin = CustomUser.objects.create_user('adm@fyag.cl', BUENA, role=Role.ADMIN)
        self.client.force_authenticate(admin)
        self.client.post(f'/api/users/{self.of.pk}/reactivar/')
        self.of.refresh_from_db()
        self.assertEqual((self.of.intentos_fallidos, self.of.bloqueo_hasta), (0, None))

    def test_una_cuenta_desactivada_por_el_admin_no_acumula_fallos(self):
        CustomUser.objects.filter(pk=self.of.pk).update(is_active=False)
        r = [self.intento('of@fyag.cl') for _ in range(5)]
        self.assertEqual([x.status_code for x in r], [400, 400, 400, 400, 423])  # igual que un correo sin cuenta: el mensaje manda con el administrador
        self.of.refresh_from_db()
        self.assertEqual((self.of.intentos_fallidos, self.of.bloqueada_en), (0, None))  # pero la cuenta no se marca como bloqueada por intentos

    def test_oficina_aplica_a_los_cuatro_roles(self):
        for rol in (Role.ADMIN, Role.OPERACIONES, Role.RRHH):
            u = CustomUser.objects.create_user(f'{rol.lower()}@fyag.cl', BUENA, role=rol)
            ultimo = [self.intento(u.email) for _ in range(5)][-1]
            self.assertEqual(ultimo.status_code, 423, rol)


class TerrenoNoSeBloqueaTests(BloqueoBase):
    def test_el_tecnico_nunca_se_bloquea_solo_espera_mas(self):
        r = [self.intento('tec@fyag.cl') for _ in range(8)]
        self.assertTrue(all(x.status_code == 400 for x in r))
        self.assertEqual([x.data['espera_segundos'] for x in r], [5, 30, 60, 300, 600, 900, 1200, 1500])
        self.assertTrue(all(x.data['intentos_restantes'] is None for x in r))  # sin tope de intentos
        self.tec.refresh_from_db()
        self.assertTrue(self.tec.is_active)
        self.assertIsNone(self.tec.bloqueada_en)

    def test_despues_de_esperar_el_tecnico_entra_con_su_contrasena(self):
        for _ in range(8):
            self.intento('tec@fyag.cl')
        self.assertEqual(self.intento('tec@fyag.cl', BUENA).status_code, 200)

    def test_durante_la_espera_el_tecnico_tampoco_puede_intentar(self):
        self.intento('tec@fyag.cl')
        self.assertEqual(self.intento('tec@fyag.cl', BUENA, esperar=False).status_code, 429)


class CorreoInexistenteTests(BloqueoBase):
    def test_un_correo_que_no_existe_recibe_la_misma_respuesta_que_uno_real(self):
        real = self.intento('of@fyag.cl').data
        falso = self.intento('nadie@fyag.cl').data
        self.assertEqual(set(real), set(falso))
        self.assertEqual((real['intentos_restantes'], real['espera_segundos']), (falso['intentos_restantes'], falso['espera_segundos']))

    def test_al_quinto_intento_tambien_se_dice_bloqueada(self):
        ultimo = [self.intento('nadie@fyag.cl') for _ in range(5)][-1]
        self.assertEqual(ultimo.status_code, 423)
        self.assertFalse(CustomUser.objects.filter(email='nadie@fyag.cl').exists())
