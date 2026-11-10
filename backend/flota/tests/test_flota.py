from datetime import date, timedelta

from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from django.utils import timezone

from accounts.models import CustomUser, Role
from accounts.tests.base import RoleTestCase
from flota import servicio
from flota.models import DocumentoVehiculo, LecturaOdometro, Vehiculo
from flota.servicio import FlotaError

URL = '/api/vehiculos/'


class PatenteTests(SimpleTestCase):
    def test_normaliza_formato_antiguo_y_vigente(self):
        for crudo, esperado in [('ab1234', 'AB-1234'), ('AB-1234', 'AB-1234'), ('abcd12', 'ABCD-12'), ('ab cd-12', 'ABCD-12'), ('KLRT 42', 'KLRT-42')]:
            self.assertEqual(servicio.normalizar_patente(crudo), esperado, crudo)

    def test_rechaza_lo_que_no_es_una_patente(self):
        for malo in ('', 'A1', '1234', 'ABC123', 'ABCDE1', 'AB-12345', None, 'AB--'):
            with self.assertRaises(FlotaError, msg=repr(malo)):
                servicio.normalizar_patente(malo)


class FlotaApiTests(RoleTestCase):
    def crear(self, como='RRHH', **extra):
        self.as_role(como)
        return self.client.post(URL, {'patente': 'abcd12', 'marca': 'Toyota', 'modelo': 'Hilux', 'anio': 2022, **extra}, format='json')

    def vehiculo(self, **extra):
        self.crear(**extra)
        return Vehiculo.objects.latest('id')

    # --- altas y permisos ---
    def test_rrhh_y_admin_crean_vehiculos_con_codigo_automatico(self):
        r = self.crear('RRHH')
        self.assertEqual((r.status_code, r.data['patente'], r.data['codigo']), (201, 'ABCD-12', 'VH-01'))
        r = self.crear('ADMIN', patente='ef-3456')
        self.assertEqual((r.status_code, r.data['codigo']), (201, 'VH-02'))

    def test_finanzas_lee_pero_no_modifica_y_el_resto_no_entra(self):
        v = self.vehiculo()
        self.as_role('FINANZAS')
        self.assertEqual(self.client.get(URL).status_code, 200)
        self.assertEqual(self.client.post(URL, {'patente': 'ZZ-9999', 'marca': 'x', 'modelo': 'y'}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'{URL}{v.pk}/', {'estado': 'EN_TALLER'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'{URL}{v.pk}/documentos/', {}, format='json').status_code, 403)
        for rol in ('OPERACIONES', 'TECNICO'):
            self.as_role(rol)
            self.assertEqual(self.client.get(URL).status_code, 403, rol)

    def test_patente_invalida_o_repetida(self):
        self.assertEqual(self.crear(patente='123').status_code, 400)
        self.crear()
        r = self.crear(patente='ABCD 12')
        self.assertEqual(r.status_code, 400)
        self.assertIn('patente', r.data)

    def test_el_tecnico_asignado_debe_ser_un_tecnico_activo(self):
        self.assertEqual(self.crear(tecnico=self.users['TECNICO'].pk).status_code, 201)
        self.assertEqual(self.crear(patente='EF-3456', tecnico=self.users['FINANZAS'].pk).status_code, 400)
        CustomUser.objects.filter(pk=self.users['TECNICO'].pk).update(is_active=False)
        self.assertEqual(self.crear(patente='GH-7890', tecnico=self.users['TECNICO'].pk).status_code, 400)

    def test_anio_fuera_de_rango(self):
        self.assertEqual(self.crear(anio=1950).status_code, 400)
        self.assertEqual(self.crear(anio=timezone.localdate().year + 5).status_code, 400)

    def test_no_se_elimina_ni_se_reemplaza(self):
        v = self.vehiculo()
        for metodo in ('delete', 'put'):
            self.assertEqual(getattr(self.client, metodo)(f'{URL}{v.pk}/', {}, format='json').status_code, 405, metodo)
        self.assertTrue(Vehiculo.objects.filter(pk=v.pk).exists())

    def test_taller_y_desactivar_se_hacen_editando_el_vehiculo(self):
        v = self.vehiculo()
        r = self.client.patch(f'{URL}{v.pk}/', {'estado': 'EN_TALLER', 'activo': False}, format='json')
        self.assertEqual((r.status_code, r.data['estado'], r.data['activo']), (200, 'EN_TALLER', False))

    # --- kilometraje ---
    def test_km_inicial_deja_una_lectura_y_el_km_no_se_edita_a_mano(self):
        r = self.crear(km_inicial=48250)
        v = Vehiculo.objects.get(pk=r.data['id'])
        self.assertEqual((r.data['km_actual'], v.kilometraje), (48250, 48250))
        self.assertEqual(v.lecturas.get().origen, 'INICIAL')
        r = self.client.patch(f'{URL}{v.pk}/', {'km_actual': 1, 'kilometraje': 1, 'km_inicial': 1}, format='json')
        v.refresh_from_db()
        self.assertEqual(v.kilometraje, 48250)

    def test_lecturas_manuales_solo_avanzan_y_quedan_en_el_historial(self):
        v = self.vehiculo(km_inicial=1000)
        r = self.client.post(f'{URL}{v.pk}/lecturas/', {'km': 1500}, format='json')
        self.assertEqual((r.status_code, r.data['km_actual']), (201, 1500))
        baja = self.client.post(f'{URL}{v.pk}/lecturas/', {'km': 1400}, format='json')
        self.assertEqual(baja.status_code, 400)
        self.assertIn('solo avanza', baja.data['km'][0])
        igual = self.client.post(f'{URL}{v.pk}/lecturas/', {'km': 1500}, format='json')
        self.assertEqual(igual.status_code, 201)
        self.assertEqual(v.lecturas.count(), 2)  # la inicial y la de 1500; la repetida no suma
        hist = self.client.get(f'{URL}{v.pk}/lecturas/').data
        self.assertEqual([(l['km'], l['origen']) for l in hist], [(1500, 'MANUAL'), (1000, 'INICIAL')])

    def test_lectura_invalida(self):
        v = self.vehiculo()
        for km in (-5, 'abc', 3_000_000, None):
            self.assertEqual(self.client.post(f'{URL}{v.pk}/lecturas/', {'km': km}, format='json').status_code, 400, km)

    # --- documentos y vencimientos ---
    def doc(self, v, **extra):
        return self.client.post(f'{URL}{v.pk}/documentos/', {'tipo': 'REVISION_TECNICA', 'fecha_realizacion': '2026-10-01', 'fecha_vencimiento': '2027-10-01', **extra}, format='json')

    def test_registrar_una_revision_guarda_cuando_se_hizo_y_cuando_vence(self):
        v = self.vehiculo()
        r = self.doc(v, referencia='Cert. 123')
        self.assertEqual(r.status_code, 201)
        self.assertEqual((r.data['ultima_revision'], r.data['vencimiento_revision']), (date(2026, 10, 1), date(2027, 10, 1)))
        self.assertIsNone(r.data['vencimiento_seguro'])
        self.assertEqual(r.data['estado_vencimientos']['seguro'], 'SIN_DATO')
        d = v.documentos.get()
        self.assertEqual((d.referencia, d.registrado_por_id), ('Cert. 123', self.users['RRHH'].pk))

    def test_cada_renovacion_es_un_registro_nuevo_y_manda_la_vigente(self):
        v = self.vehiculo()
        self.doc(v, fecha_realizacion='2025-10-01', fecha_vencimiento='2026-10-01')
        r = self.doc(v, fecha_realizacion='2026-10-02', fecha_vencimiento='2027-10-01')
        self.assertEqual(v.documentos.count(), 2)  # el historial no se pisa
        self.assertEqual(r.data['vencimiento_revision'], date(2027, 10, 1))
        hist = self.client.get(f'{URL}{v.pk}/documentos/').data
        self.assertEqual([str(d['fecha_vencimiento']) for d in hist], ['2027-10-01', '2026-10-01'])

    def test_estado_del_vencimiento(self):
        v = self.vehiculo()
        hoy = timezone.localdate()
        for tipo, dias in (('REVISION_TECNICA', -3), ('PERMISO_CIRCULACION', 10), ('SEGURO', 200)):
            self.doc(v, tipo=tipo, fecha_realizacion=None, fecha_vencimiento=(hoy + timedelta(days=dias)).isoformat())
        e = self.client.get(f'{URL}{v.pk}/').data['estado_vencimientos']
        self.assertEqual(e, {'revision': 'VENCIDO', 'permiso': 'POR_VENCER', 'seguro': 'VIGENTE'})

    def test_fechas_incoherentes_se_rechazan(self):
        v = self.vehiculo()
        self.assertEqual(self.doc(v, fecha_realizacion='2026-10-01', fecha_vencimiento='2026-09-01').status_code, 400)
        futura = (timezone.localdate() + timedelta(days=5)).isoformat()
        self.assertEqual(self.doc(v, fecha_realizacion=futura, fecha_vencimiento=futura).status_code, 400)
        self.assertEqual(self.doc(v, tipo='LICENCIA').status_code, 400)
        self.assertEqual(self.client.post(f'{URL}{v.pk}/documentos/', {'tipo': 'SEGURO'}, format='json').status_code, 400)
        self.assertFalse(v.documentos.exists())

    def test_la_base_tambien_rechaza_un_vencimiento_anterior_a_la_realizacion(self):
        v = self.vehiculo()
        with self.assertRaises(IntegrityError), transaction.atomic():
            DocumentoVehiculo.objects.create(vehiculo=v, tipo='SEGURO', fecha_realizacion=date(2026, 5, 1), fecha_vencimiento=date(2026, 4, 1))

    def test_un_vehiculo_con_historial_no_se_puede_borrar(self):
        v = self.vehiculo(km_inicial=10)
        with self.assertRaises(Exception), transaction.atomic():
            v.delete()
        self.assertTrue(Vehiculo.objects.filter(pk=v.pk).exists())


class ServicioTests(RoleTestCase):
    def test_codigos_consecutivos_aunque_haya_huecos(self):
        Vehiculo.objects.create(codigo='VH-05', patente='AA-1111', marca='a', modelo='b')
        self.assertEqual(Vehiculo.objects.create(patente='BB-2222', marca='a', modelo='b').codigo, 'VH-06')

    def test_registrar_km_rechaza_tipos_raros(self):
        v = Vehiculo.objects.create(patente='AA-1111', marca='a', modelo='b')
        for km in (True, 1.5, '10', None, -1):
            with self.assertRaises(FlotaError, msg=repr(km)):
                servicio.registrar_km(v, km, LecturaOdometro.Origen.MANUAL)
