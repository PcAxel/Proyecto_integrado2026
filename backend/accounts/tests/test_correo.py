import io
import json
import urllib.error
from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings

from accounts import correo
from accounts.email_backend import BrevoEmailBackend, CorreoError
from accounts.tests.base import RoleTestCase


def http_error(codigo, mensaje):
    return urllib.error.HTTPError('https://api.brevo.com/v3/smtp/email', codigo, 'x', {}, io.BytesIO(json.dumps({'message': mensaje}).encode()))


@override_settings(BREVO_API_KEY='clave-falsa', EMAIL_BACKEND='accounts.email_backend.BrevoEmailBackend', DEFAULT_FROM_EMAIL='FYAG ERP <no-reply@fyag.cl>')
class BackendBrevoTests(TestCase):
    def enviar(self, error=None):
        with patch('urllib.request.urlopen', side_effect=error) as u:
            return BrevoEmailBackend().send_messages([mail.EmailMessage('Asunto', 'Cuerpo con código 123456', 'FYAG ERP <no-reply@fyag.cl>', ['a@b.cl'])]), u

    def test_envio_ok(self):
        class R:
            def __enter__(self): return self
            def __exit__(self, *a): return False
        with patch('urllib.request.urlopen', return_value=R()):
            self.assertEqual(BrevoEmailBackend().send_messages([mail.EmailMessage('A', 'B', 'x <no-reply@fyag.cl>', ['a@b.cl'])]), 1)

    def test_el_rechazo_trae_el_motivo_de_brevo_y_el_log_no_filtra_el_codigo(self):
        with self.assertLogs('accounts.email_backend', 'ERROR') as log, self.assertRaises(CorreoError) as c:
            self.enviar(http_error(400, 'Sender is not valid'))
        self.assertEqual((c.exception.status, c.exception.mensaje), (400, 'Sender is not valid'))
        self.assertNotIn('123456', ' '.join(log.output))
        self.assertNotIn('clave-falsa', ' '.join(log.output))

    def test_sin_red_se_distingue_de_un_rechazo(self):
        with self.assertRaises(CorreoError) as c:
            self.enviar(urllib.error.URLError('sin red'))
        self.assertEqual(c.exception.status, 0)


@override_settings(DEFAULT_FROM_EMAIL='FYAG ERP <no-reply@fyag.cl>')
class ExplicarTests(TestCase):
    def test_cada_causa_tiene_su_explicacion_accionable(self):
        self.assertIn('no-reply@fyag.cl', correo.explicar(CorreoError(400, 'Sender is not valid')))
        self.assertIn('verificado en Brevo', correo.explicar(CorreoError(400, 'sender not valid')))
        self.assertIn('Direcciones IP autorizadas', correo.explicar(CorreoError(401, 'unrecognised IP address')))
        self.assertIn('clave', correo.explicar(CorreoError(401, 'Key not found')))
        self.assertIn('no está activa', correo.explicar(CorreoError(403, 'Account not activated')))
        self.assertIn('comunicarse', correo.explicar(CorreoError(0, 'URLError')))
        self.assertIn('espera', correo.explicar(CorreoError(429, '')).lower())


class ProbarCorreoVistaTests(RoleTestCase):
    def probar(self, rol='SUPERADMIN', **datos):
        self.as_role(rol)
        return self.client.post('/api/sistema/probar-correo/', datos, format='json')

    def test_solo_ti(self):
        for rol in ('ADMIN', 'FINANZAS', 'OPERACIONES', 'JEFE_BODEGA', 'TECNICO', 'AUDITOR'):
            self.assertEqual(self.probar(rol=rol).status_code, 403, rol)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.console.EmailBackend')
    def test_sin_servicio_de_correo_lo_dice(self):
        d = self.probar().json()
        self.assertFalse(d['ok'])
        self.assertIn('BREVO_API_KEY', d['motivo'])

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_con_servicio_envia_al_destinatario(self):
        d = self.probar(destinatario='ti@apexsystems.cl').json()
        self.assertTrue(d['ok'])
        self.assertEqual(mail.outbox[-1].to, ['ti@apexsystems.cl'])

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_valida_el_correo_y_limita_las_pruebas(self):
        self.assertEqual(self.probar(destinatario='no-es-correo').status_code, 400)
        for _ in range(5):
            self.assertEqual(self.probar().status_code, 200)
        self.assertEqual(self.probar().status_code, 429)
