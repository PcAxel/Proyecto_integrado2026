"""Diagnóstico del correo: manda un mensaje de prueba y traduce la respuesta de Brevo a algo que TI pueda arreglar sin leer los registros del servidor."""
from django.conf import settings
from django.core.mail import send_mail

from .email_backend import CorreoError


def remitente():
    from email.utils import parseaddr
    return parseaddr(settings.DEFAULT_FROM_EMAIL)[1]


def explicar(error):
    """Causa probable y qué hacer, según el código HTTP y el mensaje de Brevo."""
    s, m = error.status, error.mensaje.lower()
    if s == 0:
        return 'El servidor no pudo comunicarse con Brevo (red o tiempo de espera). Reintenta; si persiste, revisa el estado de Brevo.'
    if s == 401 or 'ip' in m and ('unrecogni' in m or 'authori' in m):
        return ('Brevo no aceptó la clave: puede estar mal copiada en BREVO_API_KEY (sin espacios ni saltos de línea), o la dirección IP de Render no está '
                'autorizada. En Brevo, revisa Seguridad → Direcciones IP autorizadas y desactiva la restricción (las IP de Render cambian).')
    if 'sender' in m or 'from' in m or s == 400 and 'valid' in m:
        return (f'El remitente {remitente()} no está verificado en Brevo. En Brevo: Remitentes y dominios → agrega y verifica ese correo, '
                'o cambia DEFAULT_FROM_EMAIL en Render por un remitente que ya esté verificado.')
    if s in (402, 403):
        return 'La cuenta de Brevo no está activa para enviar (activación pendiente, suspendida o sin cuota). Revisa el panel de Brevo.'
    if s == 429:
        return 'Brevo limitó los envíos por exceso de solicitudes. Espera unos minutos.'
    return f'Brevo rechazó el envío (código {s}). {error.mensaje}'.strip()


def probar(destinatario):
    """Envía un correo de prueba. Devuelve {ok, motivo, remitente}; nunca la clave."""
    if settings.EMAIL_BACKEND.endswith('console.EmailBackend'):
        return {'ok': False, 'remitente': remitente(), 'motivo': 'No hay servicio de correo: falta la variable BREVO_API_KEY en el servidor (Render → Environment). Sin ella no se envía ningún correo.'}
    try:
        send_mail('Prueba de correo del ERP de FYAG', 'Si lees esto, el envío de correos del sistema funciona.', settings.DEFAULT_FROM_EMAIL, [destinatario], fail_silently=False)
    except CorreoError as e:
        return {'ok': False, 'remitente': remitente(), 'motivo': explicar(e)}
    except Exception:
        return {'ok': False, 'remitente': remitente(), 'motivo': 'No se pudo enviar por un error inesperado del servidor de correo.'}
    return {'ok': True, 'remitente': remitente(), 'motivo': f'Enviado a {destinatario}. Si no llega en un minuto, revisa spam o el remitente verificado en Brevo.'}
