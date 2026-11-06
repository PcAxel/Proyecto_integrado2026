"""`seed_fyag --demo --force` en un servidor público: contraseñas seguras y RR. HH. de demostración."""
import io
import shutil
import tempfile
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import CustomUser
from rrhh.archivos import almacen_privado
from rrhh.models import Contrato, DocumentoLaboral, Finiquito


@override_settings(DEBUG=False)
class SeedDemoTest(TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        p = patch.object(almacen_privado, 'location', self.dir, create=True)
        p.start()
        self.addCleanup(p.stop)
        self.addCleanup(shutil.rmtree, self.dir, True)

    def sembrar(self, **env):
        salida = io.StringIO()
        with patch.dict('os.environ', env, clear=False):
            call_command('seed_fyag', '--demo', '--force', stdout=salida)
        return salida.getvalue()

    def test_sin_contrasena_definida_genera_aleatorias_y_no_usa_las_conocidas(self):
        with patch.dict('os.environ', {'FYAG_SEED_PASSWORD': ''}):
            texto = self.sembrar(FYAG_SEED_PASSWORD='')
        admin = CustomUser.objects.get(email='admin@fyag.cl')
        self.assertFalse(admin.check_password('Admin-FYAG-2026'))
        self.assertNotIn('Admin-FYAG-2026', texto)
        self.assertIn('no se vuelven a mostrar', texto)
        linea = next(l for l in texto.splitlines() if 'admin@fyag.cl' in l)
        self.assertTrue(admin.check_password(linea.split()[-1]))

    def test_con_contrasena_de_entorno_se_usa_y_no_se_imprime(self):
        texto = self.sembrar(FYAG_SEED_PASSWORD='Clave-Demo-Comision-2026')
        self.assertTrue(CustomUser.objects.get(email='rrhh@fyag.cl').check_password('Clave-Demo-Comision-2026'))
        self.assertNotIn('Clave-Demo-Comision-2026', texto)

    def test_contrasena_corta_se_rechaza(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self.sembrar(FYAG_SEED_PASSWORD='corta')

    def test_carga_rrhh_de_demostracion_y_es_idempotente(self):
        self.sembrar(FYAG_SEED_PASSWORD='Clave-Demo-Comision-2026')
        self.assertEqual(Contrato.objects.filter(estado='ACTIVO').count(), 7)  # 5 usuarios + 2 con finiquito en curso
        self.assertEqual(Finiquito.objects.filter(estado_pago='PENDIENTE').count(), 2)
        pagado = Finiquito.objects.get(estado_pago='PAGADO')
        self.assertEqual((pagado.contrato.estado, bool(pagado.comprobante_pago)), ('FINIQUITADO', True))
        self.assertGreater(pagado.monto_indemnizacion, 0)
        doc = DocumentoLaboral.objects.get()
        self.assertEqual((doc.estado, doc.trabajador.email), ('PENDIENTE', 'tecnico@fyag.cl'))
        self.assertFalse(CustomUser.objects.get(email='matias.ibanez@demo.fyag.cl').has_usable_password())
        self.sembrar(FYAG_SEED_PASSWORD='Clave-Demo-Comision-2026')
        self.assertEqual((Contrato.objects.count(), DocumentoLaboral.objects.count()), (8, 1))
