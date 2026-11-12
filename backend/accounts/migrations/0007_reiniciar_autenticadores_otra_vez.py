"""OTRA VEZ, UNA SOLA VEZ: reinicia el autenticador (2FA) de todas las cuentas activas y cierra sus sesiones.

Igual que 0005: no toca contraseñas, roles ni datos, y se aplica una sola vez por base de datos (los despliegues siguientes no lo repiten).
Quien ya hubiera vinculado su teléfono con el reinicio anterior verá el QR de primer ingreso de nuevo. No editar ni reutilizar.
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
    dependencies = [('accounts', '0006_bloqueo_y_recuperacion'), ('token_blacklist', '0013_alter_blacklistedtoken_options_and_more')]
    operations = [migrations.RunPython(reiniciar, migrations.RunPython.noop)]
