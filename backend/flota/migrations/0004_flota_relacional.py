"""La flota pasa a tablas relacionales propias.

- Nuevos modelos: DocumentoVehiculo (revisión técnica, permiso, seguro, con historial) y LecturaOdometro.
- Los vencimientos dejan de ser columnas del vehículo: cada uno se convierte en un documento (sin «día en que se hizo», dato que nunca se guardó).
- Los vehículos que hoy viven como JSON en la tabla genérica del ERP (`erp_registro`, tabla «flota») se trasladan a `Vehiculo` conservando su id público
  (VH-01…); después se borran de ahí, para que exista una sola fuente de verdad.
"""
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def _fecha(valor):
    from datetime import date
    try:
        return date.fromisoformat(str(valor)[:10]) if valor else None
    except ValueError:
        return None


def trasladar(apps, schema_editor):
    Vehiculo = apps.get_model('flota', 'Vehiculo')
    Documento = apps.get_model('flota', 'DocumentoVehiculo')
    Lectura = apps.get_model('flota', 'LecturaOdometro')
    Registro = apps.get_model('erp', 'Registro')
    # {'T-01': <usuario_id>} para traducir el técnico asignado de la ficha del ERP a su cuenta
    usuario_de_ficha = {}
    for r in Registro.objects.filter(tabla='personal'):
        u = str(r.datos.get('usuario_id') or '')
        if u.startswith('U-') and u[2:].isdigit():
            usuario_de_ficha[r.rid] = int(u[2:])

    def vencimientos(v, rev, per, seg):
        for tipo, fecha in (('REVISION_TECNICA', rev), ('PERMISO_CIRCULACION', per), ('SEGURO', seg)):
            if fecha and not Documento.objects.filter(vehiculo=v, tipo=tipo, fecha_vencimiento=fecha).exists():
                Documento.objects.create(vehiculo=v, tipo=tipo, fecha_vencimiento=fecha)

    # 1) Vehículos que ya estaban en la tabla relacional (datos antiguos): sus vencimientos pasan a documentos.
    for v in Vehiculo.objects.all():
        vencimientos(v, v.venc_revision_tecnica, v.venc_permiso_circulacion, v.venc_seguro)
        if v.kilometraje and not Lectura.objects.filter(vehiculo=v).exists():
            Lectura.objects.create(vehiculo=v, km=v.kilometraje, origen='INICIAL')

    # 2) Vehículos del ERP (JSON): se crean con su id público, o se completan si la patente ya existía.
    for r in Registro.objects.filter(tabla='flota').order_by('id'):
        d = r.datos
        patente = str(d.get('patente') or '').strip().upper()
        v = Vehiculo.objects.filter(patente=patente).first() or Vehiculo.objects.filter(codigo=r.rid).first()
        if v is None:
            v = Vehiculo(codigo=r.rid, patente=patente, marca=d.get('marca') or '', modelo=d.get('modelo') or '', anio=d.get('anio'))
        v.codigo = r.rid
        v.estado = d.get('estado') or 'ACTIVO'
        v.activo = bool(d.get('activo', True))
        v.kilometraje = int(d.get('km_actual') or v.kilometraje or 0)
        if usuario_de_ficha.get(d.get('tecnico_id')):
            v.tecnico_id = usuario_de_ficha[d['tecnico_id']]
        v.save()
        vencimientos(v, _fecha(d.get('vencimiento_revision')), _fecha(d.get('vencimiento_permiso')), _fecha(d.get('vencimiento_seguro')))
        if v.kilometraje and not Lectura.objects.filter(vehiculo=v).exists():
            Lectura.objects.create(vehiculo=v, km=v.kilometraje, origen='INICIAL')
    Registro.objects.filter(tabla='flota').delete()

    # 3) Los vehículos antiguos sin id público reciben el siguiente VH-NN.
    usados = {v.codigo for v in Vehiculo.objects.exclude(codigo='')}
    mayor = max([int(c[3:]) for c in usados if c.startswith('VH-') and c[3:].isdigit()] or [0])
    for v in Vehiculo.objects.filter(codigo='').order_by('id'):
        mayor += 1
        v.codigo = f'VH-{mayor:02d}'
        v.save(update_fields=['codigo'])


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('flota', '0003_tecnico_a_usuario'),
        ('erp', '0001_initial'),
    ]
    operations = [
        migrations.AddField('vehiculo', 'codigo', models.CharField(blank=True, default='', max_length=10, help_text='Id público del ERP: «VH-01». Se asigna solo.')),
        migrations.AddField('vehiculo', 'creado_en', models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now), preserve_default=False),
        migrations.AlterField('vehiculo', 'kilometraje', models.PositiveIntegerField(default=0, help_text='Última lectura del odómetro. Solo cambia al registrar una lectura.')),
        migrations.CreateModel(
            name='DocumentoVehiculo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(choices=[('REVISION_TECNICA', 'Revisión técnica'), ('PERMISO_CIRCULACION', 'Permiso de circulación'), ('SEGURO', 'Seguro obligatorio (SOAP)')], max_length=20)),
                ('fecha_realizacion', models.DateField(blank=True, null=True, help_text='Día en que se hizo o se emitió. Vacío en datos antiguos que solo tenían el vencimiento.')),
                ('fecha_vencimiento', models.DateField()),
                ('referencia', models.CharField(blank=True, max_length=80, help_text='N.º de certificado, de póliza o aseguradora')),
                ('observacion', models.CharField(blank=True, max_length=300)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('registrado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('vehiculo', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='documentos', to='flota.vehiculo')),
            ],
            options={'ordering': ['-fecha_vencimiento', '-id']},
        ),
        migrations.CreateModel(
            name='LecturaOdometro',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('km', models.PositiveIntegerField()),
                ('fecha', models.DateTimeField(default=django.utils.timezone.now)),
                ('origen', models.CharField(choices=[('INICIAL', 'Lectura inicial'), ('HOJA_SERVICIO', 'Hoja de servicio'), ('MANUAL', 'Registro manual')], max_length=14)),
                ('referencia', models.CharField(blank=True, max_length=60)),
                ('registrado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('vehiculo', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='lecturas', to='flota.vehiculo')),
            ],
            options={'ordering': ['-fecha', '-id'], 'verbose_name_plural': 'lecturas de odómetro'},
        ),
        migrations.AddIndex('documentovehiculo', models.Index(fields=['vehiculo', 'tipo', '-fecha_vencimiento'], name='flota_docum_vehicul_9d8194_idx')),
        migrations.AddConstraint('documentovehiculo', models.CheckConstraint(condition=models.Q(('fecha_realizacion__isnull', True), ('fecha_vencimiento__gte', models.F('fecha_realizacion')), _connector='OR'), name='vencimiento_no_anterior_a_realizacion')),
        migrations.RunPython(trasladar, migrations.RunPython.noop),
        migrations.RemoveField('vehiculo', 'venc_revision_tecnica'),
        migrations.RemoveField('vehiculo', 'venc_permiso_circulacion'),
        migrations.RemoveField('vehiculo', 'venc_seguro'),
        migrations.AlterField('vehiculo', 'codigo', models.CharField(blank=True, max_length=10, unique=True, help_text='Id público del ERP: «VH-01». Se asigna solo.')),
    ]
