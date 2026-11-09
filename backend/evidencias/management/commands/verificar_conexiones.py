from django.core.management.base import BaseCommand, CommandError

from evidencias import salud


class Command(BaseCommand):
    help = 'Prueba PostgreSQL, Valkey y MongoDB (lectura y escritura). No imprime URIs ni contraseñas.'

    def handle(self, *args, **options):
        pruebas = (
            ('PostgreSQL', salud.comprobar_postgresql, lambda r: f"vendor={r['vendor']} versión={r['version']} ssl={'sí' if r['ssl'] else 'no' if r['ssl'] is False else 'n/a'}"),
            ('Valkey', salud.comprobar_valkey, lambda r: f"caché={r['backend']}"),
            ('MongoDB', salud.comprobar_mongodb, lambda r: 'ping, documento y GridFS'),
        )
        fallas = []
        for nombre, fn, detalle in pruebas:
            try:
                self.stdout.write(self.style.SUCCESS(f'{nombre}: OK ({detalle(fn())})'))
            except Exception as e:
                fallas.append(nombre)
                self.stdout.write(self.style.ERROR(f'{nombre}: FALLO ({type(e).__name__})'))
        if fallas:
            raise CommandError('Sin respuesta: ' + ', '.join(fallas))
        self.stdout.write(self.style.SUCCESS('TODO OK: PostgreSQL, Valkey y MongoDB responden correctamente'))
