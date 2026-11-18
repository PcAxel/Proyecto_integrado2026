"""Cambia el correo de la cuenta del Admin TI (era `ti@apexsystems.cl`, un correo que no existe) por el correo real de su responsable.

Es el correo al que llegan los códigos de recuperación de contraseña de TI: debe ser el mismo con el que se abrió la cuenta del proveedor de correo (Resend).
La cuenta conserva todo lo demás: contraseña, rol, autenticador e historial (el id no cambia). Corre UNA vez por base de datos, no en desarrollo ni en pruebas.
- Si ya existe otra cuenta con el correo nuevo, no toca nada (para no pisar ni fusionar cuentas).
- Si la cuenta antigua no existe, crea la de TI con el correo nuevo y la misma contraseña temporal de la migración 0010 (cámbiala al entrar).
"""
import sys

from django.conf import settings
from django.db import migrations
from django.utils import timezone

CORREO_ANTIGUO = 'ti@apexsystems.cl'
CORREO_NUEVO = 'acelplata3000@gmail.com'
HASH_TEMPORAL = 'pbkdf2_sha256$1500000$MEjQSU643Qc63nxAKgnSkO$bZMoKCLK2+dfJAfhWGcx1mP8oynYyJwZ2GqJizsqJX8='  # igual a la 0010


def cambiar_correo_ti(apps):
    """Devuelve 'cambiado', 'creada' o 'sin_cambios'."""
    Usuario = apps.get_model('accounts', 'CustomUser')
    if Usuario.objects.filter(email__iexact=CORREO_NUEVO).exists():
        return 'sin_cambios'
    antigua = Usuario.objects.filter(email__iexact=CORREO_ANTIGUO).first()
    if antigua is not None:
        antigua.email = CORREO_NUEVO
        antigua.save(update_fields=['email'])
        return 'cambiado'
    Usuario.objects.create(email=CORREO_NUEVO, password=HASH_TEMPORAL, role='SUPERADMIN', first_name='Jefatura', last_name='TI', is_active=True,
                           terms_accepted_at=timezone.now())
    return 'creada'


def aplicar(apps, schema_editor):
    if settings.DEBUG or 'test' in sys.argv[1:2]:
        return
    cambiar_correo_ti(apps)


class Migration(migrations.Migration):
    dependencies = [('accounts', '0010_cuenta_ti_inicial')]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
