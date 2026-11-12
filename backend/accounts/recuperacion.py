"""Recuperar la contraseña con un código enviado al correo (6 dígitos, 15 minutos, un solo uso)."""
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.utils import timezone

from .models import RecuperacionPassword

logger = logging.getLogger(__name__)
VIDA_MINUTOS = 15
MAX_INTENTOS_CODIGO = 5
MAX_SOLICITUDES_HORA = 3


def _huella(codigo):
    return hmac.new(settings.SECRET_KEY.encode(), codigo.encode(), hashlib.sha256).hexdigest()


def puede_solicitar(correo):
    """Máximo 3 códigos por hora y por correo (evita usar el sistema para llenar de correos a alguien)."""
    clave = f'recuperar_solicitudes:{correo}'
    n = cache.get(clave, 0)
    if n >= MAX_SOLICITUDES_HORA:
        return False
    cache.set(clave, n + 1, 3600)
    return True


def _correo_configurado():
    # Sin un servicio de correo real, la consola mostraría el código en los registros del servidor: en producción no se envía.
    return settings.DEBUG or not settings.EMAIL_BACKEND.endswith('console.EmailBackend')


def enviar_codigo(usuario):
    """Crea un código nuevo (invalida los anteriores) y lo manda al correo de la cuenta. No lanza: la respuesta al usuario es siempre la misma."""
    if not _correo_configurado():
        logger.warning('recuperacion_sin_correo: falta configurar BREVO_API_KEY o EMAIL_BACKEND; no se envió el código a user=%s', usuario.pk)
        return False
    usuario.recuperaciones.filter(usado_en__isnull=True).update(usado_en=timezone.now())
    codigo = f'{secrets.randbelow(10**6):06d}'
    RecuperacionPassword.objects.create(usuario=usuario, codigo_hash=_huella(codigo), expira_en=timezone.now() + timedelta(minutes=VIDA_MINUTOS))
    cuerpo = (f'Hola {usuario.first_name or usuario.email},\n\n'
              f'Tu código para recuperar la contraseña del ERP de FYAG es: {codigo}\n\n'
              f'Vence en {VIDA_MINUTOS} minutos y sirve una sola vez. Si no lo pediste tú, ignora este correo: tu contraseña sigue igual.\n')
    try:
        send_mail('Código para recuperar tu contraseña (FYAG)', cuerpo, settings.DEFAULT_FROM_EMAIL, [usuario.email], fail_silently=False)
    except Exception:  # un fallo del proveedor de correo no debe revelar nada ni tumbar la pantalla
        logger.exception('recuperacion_correo_error user=%s', usuario.pk)
        return False
    return True


def verificar_codigo(usuario, codigo):
    """True si el código es el vigente de esta cuenta. Cada intento fallido se cuenta; a los 5 el código se anula."""
    r = usuario.recuperaciones.filter(usado_en__isnull=True, expira_en__gt=timezone.now()).first()
    if r is None:
        return None
    if r.intentos >= MAX_INTENTOS_CODIGO:
        return None
    if hmac.compare_digest(r.codigo_hash, _huella(codigo)):
        return r
    r.intentos += 1
    if r.intentos >= MAX_INTENTOS_CODIGO:
        r.usado_en = timezone.now()
    r.save(update_fields=['intentos', 'usado_en'])
    return None
