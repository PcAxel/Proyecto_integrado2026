"""El técnico asignado a un vehículo pasa de `personal.Trabajador` a la cuenta de la persona."""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def copiar(apps, schema_editor):
    Vehiculo = apps.get_model('flota', 'Vehiculo')
    for v in Vehiculo.objects.exclude(tecnico__isnull=True).select_related('tecnico'):
        v.tecnico_usuario_id = v.tecnico.usuario_id
        v.save(update_fields=['tecnico_usuario'])


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('flota', '0002_vehiculo_activo_vehiculo_tecnico_and_more'),
        ('personal', '0003_trabajadores_a_usuarios'),
    ]
    operations = [
        migrations.AddField('vehiculo', 'tecnico_usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='vehiculos_asignados', to=settings.AUTH_USER_MODEL)),
        migrations.RunPython(copiar, migrations.RunPython.noop),
        migrations.RemoveField('vehiculo', 'tecnico'),
        migrations.RenameField('vehiculo', 'tecnico_usuario', 'tecnico'),
        migrations.AlterField('vehiculo', 'tecnico', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='vehiculos', to=settings.AUTH_USER_MODEL)),
    ]
