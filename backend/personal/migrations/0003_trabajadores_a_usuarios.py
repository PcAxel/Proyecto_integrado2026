"""Paso 1 de la unificación: toda persona que figuraba como `Trabajador` pasa a tener una cuenta (CustomUser).

Quien ya tenía cuenta no cambia. Quien no (registros antiguos) recibe una cuenta DESACTIVADA, sin contraseña utilizable y con un correo
`legado-<id>@sin-cuenta.fyag.invalid`: no puede iniciar sesión, pero conserva su nombre y sus marcas de asistencia y vehículos asignados.
Los usuarios nunca se eliminan, así que esto es coherente con la regla de trazabilidad.
"""
from django.contrib.auth.hashers import make_password
from django.db import migrations
from django.utils import timezone


def trabajadores_a_usuarios(apps, schema_editor):
    Trabajador = apps.get_model('personal', 'Trabajador')
    User = apps.get_model('accounts', 'CustomUser')
    for t in Trabajador.objects.filter(usuario__isnull=True):
        t.usuario = User.objects.create(
            email=f'legado-{t.pk}@sin-cuenta.fyag.invalid', first_name=t.nombres[:150], last_name=t.apellidos[:150], role='TECNICO',
            is_active=False, password=make_password(None), deactivated_at=timezone.now())
        t.save(update_fields=['usuario'])


class Migration(migrations.Migration):
    dependencies = [('personal', '0002_trabajador_vencimiento_licencia'), ('accounts', '0004_usuarios_desactivacion')]
    operations = [migrations.RunPython(trabajadores_a_usuarios, migrations.RunPython.noop)]
