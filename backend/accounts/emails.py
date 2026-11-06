from django.conf import settings
from django.core.mail import send_mail


def send_onboarding_email(user, temp_password):
    body = (
        f'Hola {user.first_name or user.email},\n\n'
        'Se creó tu cuenta en el ERP de Frío y Agroindustria SpA (FYAG).\n\n'
        f'Correo: {user.email}\n'
        f'Contraseña temporal: {temp_password}\n\n'
        f'Instala la aplicación desde aquí: {settings.PWA_INSTALL_URL}\n\n'
        'Al ingresar por primera vez deberás vincular Google Authenticator o Authy '
        'escaneando un código QR. Cambia tu contraseña apenas puedas.\n'
    )
    send_mail('Tu acceso al ERP de FYAG', body, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
