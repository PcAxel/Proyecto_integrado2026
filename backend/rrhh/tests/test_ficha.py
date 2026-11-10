from datetime import date

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase

from accounts.models import CustomUser
from accounts.tests.base import RoleTestCase
from rrhh.models import FichaTrabajador
from rrhh.validadores import digito_verificador, normalizar_rut, validar_rut


def dv_independiente(cuerpo):
    """Módulo 11 calculado de otra forma (con la lista de pesos explícita) para no probar la función contra sí misma."""
    pesos = [2, 3, 4, 5, 6, 7]
    suma = sum(int(d) * pesos[i % 6] for i, d in enumerate(reversed(cuerpo)))
    r = 11 - suma % 11
    return {11: '0', 10: 'K'}.get(r, str(r))


class RutTests(SimpleTestCase):
    def test_ruts_validos_con_y_sin_formato(self):
        for crudo, esperado in [('12.345.678-5', '12345678-5'), ('12345678-5', '12345678-5'), ('123456785', '12345678-5'), ('5.126.663-3', '5126663-3'),
                                ('11.111.111-1', '11111111-1'), (' 76.086.428-5 ', '76086428-5')]:
            self.assertEqual(validar_rut(crudo), esperado, crudo)

    def test_digito_verificador_incorrecto(self):
        for malo in ('12.345.678-9', '12345678-0', '11111111-2', '5126663-4'):
            with self.assertRaises(ValidationError, msg=malo):
                validar_rut(malo)

    def test_dv_k_y_cero(self):
        k = next(c for c in map(str, range(10_000_000, 10_001_000)) if dv_independiente(c) == 'K')
        cero = next(c for c in map(str, range(10_000_000, 10_001_000)) if dv_independiente(c) == '0')
        self.assertEqual(validar_rut(f'{k}-K'), f'{k}-K')
        self.assertEqual(validar_rut(f'{k}-k'), f'{k}-K')  # minúscula se normaliza
        self.assertEqual(validar_rut(f'{cero}-0'), f'{cero}-0')
        with self.assertRaises(ValidationError):
            validar_rut(f'{k}-0')

    def test_coincide_con_el_calculo_independiente(self):
        for n in range(1_000_000, 1_000_300):
            self.assertEqual(digito_verificador(str(n)), dv_independiente(str(n)))

    def test_formatos_y_largos_invalidos(self):
        for malo in ('', 'abc', '1-9', '123456-7', '123456789-0', '12.345.678-5; DROP TABLE', None, 12345678):
            with self.assertRaises(ValidationError, msg=repr(malo)):
                validar_rut(malo)

    def test_normalizar(self):
        self.assertEqual(normalizar_rut('012.345.678-5'), '12345678-5')
        self.assertEqual(normalizar_rut('x'), '')


class FichaTrabajadorApiTests(RoleTestCase):
    URL = '/api/rrhh/fichas/'

    def datos(self, usuario, **extra):
        return {'usuario': usuario.pk, 'rut': '12.345.678-5', 'afp': 'HABITAT', 'sistema_salud': 'FONASA', 'tipo_contrato': 'INDEFINIDO',
                'fecha_ingreso': '2026-03-01', **extra}

    def crear(self, como='RRHH', **extra):
        self.as_role(como)
        return self.client.post(self.URL, self.datos(self.users['TECNICO'], **extra), format='json')

    def test_rrhh_y_admin_completan_la_ficha(self):
        for como in ('RRHH', 'ADMIN'):
            FichaTrabajador.objects.all().delete()
            r = self.crear(como)
            self.assertEqual(r.status_code, 201, como)
            self.assertEqual(r.data['rut'], '12345678-5')
            f = FichaTrabajador.objects.get()
            self.assertEqual(f.actualizado_por_id, self.users[como].pk)
            self.assertEqual((f.afp, f.sistema_salud, f.isapre, f.tipo_contrato, f.fecha_ingreso), ('HABITAT', 'FONASA', '', 'INDEFINIDO', date(2026, 3, 1)))

    def test_otros_roles_no_ven_ni_tocan_las_fichas(self):
        self.crear()
        pk = FichaTrabajador.objects.get().pk
        for rol in ('FINANZAS', 'OPERACIONES', 'TECNICO'):
            self.as_role(rol)
            self.assertEqual(self.client.get(self.URL).status_code, 403, rol)
            self.assertEqual(self.client.get(f'{self.URL}{pk}/').status_code, 403, rol)
            self.assertEqual(self.client.post(self.URL, self.datos(self.users['RRHH']), format='json').status_code, 403, rol)
            self.assertEqual(self.client.patch(f'{self.URL}{pk}/', {'afp': 'CUPRUM'}, format='json').status_code, 403, rol)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.URL).status_code, 401)

    def test_rut_con_digito_verificador_malo_se_rechaza(self):
        r = self.crear(rut='12.345.678-9')
        self.assertEqual(r.status_code, 400)
        self.assertIn('rut', r.data)
        self.assertFalse(FichaTrabajador.objects.exists())

    def test_rut_duplicado_y_una_ficha_por_cuenta(self):
        self.crear()
        self.as_role('RRHH')
        r = self.client.post(self.URL, self.datos(self.users['OPERACIONES']), format='json')  # mismo RUT, otra persona
        self.assertEqual(r.status_code, 400)
        self.assertIn('rut', r.data)
        r = self.client.post(self.URL, self.datos(self.users['TECNICO'], rut='5.126.663-3'), format='json')  # misma cuenta, otro RUT
        self.assertEqual(r.status_code, 400)
        self.assertIn('usuario', r.data)

    def test_isapre_obligatoria_si_el_sistema_es_isapre(self):
        self.assertEqual(self.crear(sistema_salud='ISAPRE').status_code, 400)
        r = self.crear(sistema_salud='ISAPRE', isapre='CONSALUD')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['isapre'], 'CONSALUD')

    def test_fonasa_no_lleva_isapre(self):
        r = self.crear(sistema_salud='FONASA', isapre='CONSALUD')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['isapre'], '')

    def test_listas_cerradas(self):
        for campo, valor in (('afp', 'INVENTADA'), ('sistema_salud', 'PARTICULAR'), ('tipo_contrato', 'HONORARIOS')):
            self.assertEqual(self.crear(**{campo: valor}).status_code, 400, campo)
        for tipo in ('PLAZO_FIJO', 'INDEFINIDO', 'OBRA_FAENA'):
            FichaTrabajador.objects.all().delete()
            self.assertEqual(self.crear(tipo_contrato=tipo).status_code, 201, tipo)

    def test_no_se_puede_crear_para_una_cuenta_desactivada(self):
        CustomUser.objects.filter(pk=self.users['TECNICO'].pk).update(is_active=False)
        self.assertEqual(self.crear().status_code, 400)

    def test_rrhh_edita_y_la_ficha_no_cambia_de_persona(self):
        self.crear()
        f = FichaTrabajador.objects.get()
        self.as_role('RRHH')
        r = self.client.patch(f'{self.URL}{f.pk}/', {'afp': 'CUPRUM', 'sistema_salud': 'ISAPRE', 'isapre': 'COLMENA'}, format='json')
        self.assertEqual(r.status_code, 200)
        f.refresh_from_db()
        self.assertEqual((f.afp, f.sistema_salud, f.isapre), ('CUPRUM', 'ISAPRE', 'COLMENA'))
        otro = self.client.patch(f'{self.URL}{f.pk}/', {'usuario': self.users['RRHH'].pk}, format='json')
        self.assertEqual(otro.status_code, 400)
        self.assertEqual(self.client.patch(f'{self.URL}{f.pk}/', {'rut': '12.345.678-9'}, format='json').status_code, 400)
        # pasar a Fonasa limpia la isapre que quedó guardada
        self.client.patch(f'{self.URL}{f.pk}/', {'sistema_salud': 'FONASA'}, format='json')
        f.refresh_from_db()
        self.assertEqual(f.isapre, '')

    def test_las_fichas_no_se_eliminan(self):
        self.crear()
        pk = FichaTrabajador.objects.get().pk
        self.as_role('ADMIN')
        self.assertIn(self.client.delete(f'{self.URL}{pk}/').status_code, (403, 405))
        self.assertTrue(FichaTrabajador.objects.filter(pk=pk).exists())

    def test_opciones_para_los_formularios(self):
        self.as_role('RRHH')
        r = self.client.get(f'{self.URL}opciones/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual({o['value'] for o in r.data['tipo_contrato']}, {'PLAZO_FIJO', 'INDEFINIDO', 'OBRA_FAENA'})
        self.assertEqual({o['value'] for o in r.data['sistema_salud']}, {'FONASA', 'ISAPRE'})
        self.assertIn('HABITAT', {o['value'] for o in r.data['afp']})
        self.assertIn('CONSALUD', {o['value'] for o in r.data['isapre']})
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get(f'{self.URL}opciones/').status_code, 403)

    def test_la_tabla_de_personal_indica_quien_tiene_ficha(self):
        self.crear()
        self.as_role('RRHH')
        filas = {f['email']: f for f in self.client.get('/api/rrhh/personal/').data}
        self.assertIsNotNone(filas['tecnico@fyag.cl']['ficha_id'])
        self.assertIsNone(filas['operaciones@fyag.cl']['ficha_id'])
        self.assertEqual(filas['tecnico@fyag.cl']['tipo_contrato'], 'INDEFINIDO')
        self.assertIsNone(filas['operaciones@fyag.cl']['tipo_contrato'])

    def test_la_base_rechaza_isapre_incoherente(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            FichaTrabajador.objects.create(usuario=self.users['TECNICO'], rut='12345678-5', afp='HABITAT', sistema_salud='ISAPRE', isapre='',
                                           tipo_contrato='INDEFINIDO', fecha_ingreso=date(2026, 1, 1))
