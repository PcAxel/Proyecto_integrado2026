"""Las marcas de asistencia dejan de apuntar a `personal.Trabajador` y pasan a apuntar a la cuenta de la persona."""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def copiar(apps, schema_editor):
    Marca = apps.get_model('asistencia', 'MarcaAsistencia')
    for m in Marca.objects.select_related('trabajador'):
        m.usuario_id = m.trabajador.usuario_id  # todo Trabajador tiene cuenta tras personal.0003
        m.save(update_fields=['usuario'])


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('asistencia', '0001_initial'),
        ('personal', '0003_trabajadores_a_usuarios'),
    ]
    operations = [
        migrations.AddField('marcaasistencia', 'usuario', models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name='marcas', to=settings.AUTH_USER_MODEL)),
        migrations.RunPython(copiar, migrations.RunPython.noop),
        migrations.RemoveField('marcaasistencia', 'trabajador'),
        migrations.AlterField('marcaasistencia', 'usuario', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='marcas', to=settings.AUTH_USER_MODEL)),
    ]
