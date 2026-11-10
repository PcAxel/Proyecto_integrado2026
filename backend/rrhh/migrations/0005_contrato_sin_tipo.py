"""El tipo de contrato deja de guardarse en `Contrato`: la fuente de verdad es `FichaTrabajador.tipo_contrato`."""
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('rrhh', '0004_ficha_trabajador')]
    operations = [migrations.RemoveField('contrato', 'tipo_contrato')]
