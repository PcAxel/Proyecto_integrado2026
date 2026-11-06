from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from evidencias.mongo import ping


class Command(BaseCommand):
    help = 'Verifica la conexión a MySQL y a MongoDB.'

    def handle(self, *args, **options):
        fallas = []
        for nombre, fn in (('MySQL', lambda: connection.ensure_connection()), ('MongoDB', ping)):
            try:
                fn()
                self.stdout.write(self.style.SUCCESS(f'{nombre}: OK'))
            except Exception as e:
                fallas.append(nombre)
                self.stdout.write(self.style.ERROR(f'{nombre}: FALLÓ ({e})'))
        if fallas:
            raise CommandError('Sin conexión: ' + ', '.join(fallas))
