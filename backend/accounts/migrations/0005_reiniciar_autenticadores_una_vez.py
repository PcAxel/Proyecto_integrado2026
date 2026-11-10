"""UNA SOLA VEZ: reinicia el autenticador (2FA) de todas las cuentas activas y cierra sus sesiones.

Sirve para entregar el sistema a otro teléfono: en el próximo ingreso cada persona ve el QR de primer ingreso y vincula el autenticador nuevo.
No toca contraseñas, roles ni datos. Una migración se aplica una sola vez por base de datos, así que los despliegues siguientes NO repiten el reinicio.
Para reiniciar de nuevo más adelante se usa el comando `python manage.py reset_2fa --todos`; esta migración no debe editarse ni reutilizarse.
"""
from django.db import migrations


def reiniciar(apps, schema_editor):
    User = apps.get_model('accounts', 'CustomUser')
    Outstanding = apps.get_model('token_blacklist', 'OutstandingToken')
    Blacklisted = apps.get_model('token_blacklist', 'BlacklistedToken')
    activos = User.objects.filter(is_active=True)
    ids = list(activos.values_list('pk', flat=True))
    activos.update(is_2fa_enabled=False, otp_secret='')
    for token in Outstanding.objects.filter(user_id__in=ids):
        Blacklisted.objects.get_or_create(token=token)


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0004_usuarios_desactivacion'),
        ('token_blacklist', '0013_alter_blacklistedtoken_options_and_more'),
    ]
    operations = [migrations.RunPython(reiniciar, migrations.RunPython.noop)]
