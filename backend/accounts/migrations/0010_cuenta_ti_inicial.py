"""Cuenta inicial del Admin TI (Super Admin), creada o rescatada por una migración.

Por qué una migración: corre sola en cada despliegue (el contenedor ejecuta `migrate` al arrancar) y solo UNA vez por base de datos, sin depender de
variables de entorno ni de pasos de build. Deja la cuenta `ti@apexsystems.cl` lista para entrar:
- si no existe, la crea (Super Admin, activa, sin autenticador: al primer ingreso se muestra el QR para vincularlo);
- si existe (olvidada, desactivada o bloqueada por intentos), le fija esta contraseña, la reactiva y le quita el bloqueo. No toca su autenticador.
La contraseña va como HASH (no en texto plano) y es temporal: cámbiala al entrar; esta migración no vuelve a correr, así que el cambio se conserva.
No corre en desarrollo (DEBUG) ni en las pruebas: ahí las cuentas las crean el seeder y los tests.
"""
import sys

from django.conf import settings
from django.db import migrations
from django.utils import timezone

EMAIL = 'ti@apexsystems.cl'
HASH_INICIAL = 'pbkdf2_sha256$1500000$MEjQSU643Qc63nxAKgnSkO$bZMoKCLK2+dfJAfhWGcx1mP8oynYyJwZ2GqJizsqJX8='


def restaurar_ti(apps):
    """Crea o rescata la cuenta TI. Devuelve 'creada' o 'rescatada'."""
    Usuario = apps.get_model('accounts', 'CustomUser')
    cuenta = Usuario.objects.filter(email__iexact=EMAIL).first()
    if cuenta is None:
        Usuario.objects.create(email=EMAIL, password=HASH_INICIAL, role='SUPERADMIN', first_name='Jefatura', last_name='TI', is_active=True,
                               terms_accepted_at=timezone.now())
        return 'creada'
    cuenta.password = HASH_INICIAL
    cuenta.role = 'SUPERADMIN'
    cuenta.is_active = True
    cuenta.intentos_fallidos, cuenta.ultimo_fallo_en, cuenta.bloqueo_hasta, cuenta.bloqueada_en = 0, None, None, None
    cuenta.deactivated_at, cuenta.deactivated_by = None, None
    cuenta.save()
    return 'rescatada'


def aplicar(apps, schema_editor):
    if settings.DEBUG or 'test' in sys.argv[1:2]:
        return
    restaurar_ti(apps)


class Migration(migrations.Migration):
    dependencies = [('accounts', '0009_alter_customuser_role')]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
