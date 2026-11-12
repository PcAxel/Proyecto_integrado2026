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
            except (urllib.error.URLError, TimeoutError) as e:
                logger.error('brevo_error %s', getattr(e, 'code', type(e).__name__))  # nunca se registra el cuerpo: lleva el código
                if not self.fail_silently:
                    raise
        return enviados
