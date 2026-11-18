"""Diagnóstico del correo: manda un mensaje de prueba y traduce la respuesta de Brevo a algo que TI pueda arreglar sin leer los registros del servidor."""
from django.conf import settings
from django.core.mail import send_mail

from anymail.exceptions import AnymailAPIError, AnymailError

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


def _mensaje_resend(error):
    """El texto que devolvió Resend (su campo `message`), recortado; vacío si no se puede leer."""
    try:
        return str(error.response.json().get('message', ''))[:240]
    except Exception:
        return ''


def explicar_resend(error):
    """Causa probable y qué hacer según lo que respondió Resend."""
    s = getattr(error, 'status_code', None)
    m = _mensaje_resend(error).lower()
    if s in (401, 400) and ('api key' in m or 'api_key' in m or s == 401):
        return 'Resend no aceptó la clave: revisa RESEND_API_KEY en Render (debe empezar con «re_», sin espacios ni saltos de línea) y que no esté revocada.'
    if 'own email' in m or 'testing emails' in m:
        return ('Resend aún está en modo de pruebas: sin un dominio verificado solo puede enviar a la cuenta dueña de Resend. En resend.com → Domains verifica '
                f'un dominio tuyo y usa un remitente de ese dominio en DEFAULT_FROM_EMAIL (hoy: {remitente()}).')
    if 'domain' in m and ('verif' in m or 'not found' in m):
        return f'El dominio del remitente {remitente()} no está verificado en Resend. En resend.com → Domains agrégalo y verifícalo (registros DNS), o cambia DEFAULT_FROM_EMAIL a un dominio ya verificado.'
    if s == 403:
        return f'Resend rechazó el envío (403): normalmente es un dominio sin verificar. Remitente en uso: {remitente()}. {_mensaje_resend(error)}'.strip()
    if s == 429:
        return 'Resend limitó los envíos por exceso de solicitudes. Espera unos minutos.'
    if s == 422:
        return f'Resend no aceptó los datos del correo (422). {_mensaje_resend(error)}'.strip()
    return f'Resend rechazó el envío (código {s}). {_mensaje_resend(error)}'.strip()


def probar(destinatario):
    """Envía un correo de prueba. Devuelve {ok, motivo, remitente}; nunca la clave."""
    if settings.EMAIL_BACKEND.endswith('console.EmailBackend'):
        return {'ok': False, 'remitente': remitente(), 'motivo': 'No hay servicio de correo: falta la variable RESEND_API_KEY en el servidor (Render → Environment). Sin ella no se envía ningún correo.'}
    try:
        send_mail('Prueba de correo del ERP de FYAG', 'Si lees esto, el envío de correos del sistema funciona.', settings.DEFAULT_FROM_EMAIL, [destinatario], fail_silently=False)
    except CorreoError as e:
        return {'ok': False, 'remitente': remitente(), 'motivo': explicar(e)}
    except AnymailAPIError as e:
        return {'ok': False, 'remitente': remitente(), 'motivo': explicar_resend(e)}
    except AnymailError:
        return {'ok': False, 'remitente': remitente(), 'motivo': 'El servicio de correo no pudo completar el envío (revisa la clave, el remitente y la conexión).'}
    except Exception:
        return {'ok': False, 'remitente': remitente(), 'motivo': 'No se pudo enviar por un error inesperado del servidor de correo.'}
    return {'ok': True, 'remitente': remitente(), 'motivo': f'Enviado a {destinatario}. Si no llega en un minuto, revisa spam o el remitente verificado en Brevo.'}
