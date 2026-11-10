"""Paso 2: con las marcas y los vehículos ya apuntando a las cuentas, `Trabajador` deja de existir. La fuente de verdad de los datos laborales
y previsionales es `rrhh.FichaTrabajador`."""
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('personal', '0003_trabajadores_a_usuarios'),
        ('asistencia', '0002_marca_a_usuario'),
        ('flota', '0003_tecnico_a_usuario'),
    ]
    operations = [migrations.DeleteModel('Trabajador')]
