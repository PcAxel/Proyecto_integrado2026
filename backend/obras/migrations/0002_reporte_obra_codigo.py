from django.db import migrations, models


class Migration(migrations.Migration):
    """El reporte de terreno referencia la obra por su id del ERP («OB-0004») en vez de una clave foránea."""

    dependencies = [('obras', '0001_initial')]

    operations = [
        migrations.RemoveField(model_name='reporteterreno', name='obra'),
        migrations.AddField(model_name='reporteterreno', name='obra_id',
                            field=models.CharField(default='', max_length=30), preserve_default=False),
    ]
