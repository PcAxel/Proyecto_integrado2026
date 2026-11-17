"""Envío de correo por la API HTTP de Brevo. Render (plan gratis) bloquea los puertos SMTP, así que no se puede usar SMTP desde allí.
Se activa con BREVO_API_KEY; el remitente (DEFAULT_FROM_EMAIL) debe estar verificado en Brevo."""
import json
import logging
import urllib.error
import urllib.request
from email.utils import parseaddr

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)
URL = 'https://api.brevo.com/v3/smtp/email'
MAX_MENSAJE = 200


class CorreoError(Exception):
    """El proveedor de correo rechazó el envío. `status` es el código HTTP (0 = sin respuesta) y `mensaje` lo que Brevo dijo (nunca la clave ni el cuerpo del correo)."""

    def __init__(self, status, mensaje=''):
        super().__init__(f'Brevo {status}: {mensaje}')
        self.status, self.mensaje = status, mensaje


def _mensaje_de(e):
    """Lo que Brevo respondió (su campo `message`), recortado. Vacío si no se puede leer."""
    try:
        return str(json.loads(e.read().decode('utf-8', 'replace')).get('message', ''))[:MAX_MENSAJE]
    except Exception:
        return ''


class BrevoEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        enviados = 0
        for m in email_messages:
            nombre, remitente = parseaddr(m.from_email or settings.DEFAULT_FROM_EMAIL)
            cuerpo = {'sender': {'email': remitente, **({'name': nombre} if nombre else {})}, 'to': [{'email': a} for a in m.to],
                      'subject': m.subject, 'textContent': m.body}
            req = urllib.request.Request(URL, data=json.dumps(cuerpo).encode(), method='POST',
                                         headers={'api-key': settings.BREVO_API_KEY, 'content-type': 'application/json', 'accept': 'application/json'})
            try:
                with urllib.request.urlopen(req, timeout=10):
                    enviados += 1
            except urllib.error.HTTPError as e:
                mensaje = _mensaje_de(e)
                logger.error('brevo_error status=%s mensaje=%s', e.code, mensaje)  # nunca se registra el cuerpo del correo: lleva el código
                if not self.fail_silently:
                    raise CorreoError(e.code, mensaje) from e
            except (urllib.error.URLError, TimeoutError) as e:
                logger.error('brevo_error sin respuesta (%s)', type(e).__name__)
                if not self.fail_silently:
                    raise CorreoError(0, type(e).__name__) from e
        return enviados
