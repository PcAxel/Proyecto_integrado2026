import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from accounts.models import CustomUser, Role


class Command(BaseCommand):
    help = ('Crea UNA cuenta si todavía no existe (nunca modifica ni reactiva una existente). La contraseña llega por la variable de entorno '
            'FYAG_CUENTA_PASSWORD, no por argumentos, para que no quede en el historial de la terminal. Al primer ingreso la persona vincula su autenticador. '
            'Uso: FYAG_CUENTA_PASSWORD=... python manage.py crear_cuenta bodega@fyag.cl --rol JEFE_BODEGA --nombre "Jefe de Bodega"')

    def add_arguments(self, parser):
        parser.add_argument('email')
        parser.add_argument('--rol', required=True, choices=Role.values)
        parser.add_argument('--nombre', default='')
        parser.add_argument('--apellido', default='')

    def handle(self, *args, email, rol, nombre, apellido, **opts):
        email = email.strip().lower()
        if CustomUser.objects.filter(email=email).exists():
            self.stdout.write(f'{email} ya existe: no se modifica.')
            return
        clave = os.environ.get('FYAG_CUENTA_PASSWORD', '')
        if not clave:
            raise CommandError('Falta la variable de entorno FYAG_CUENTA_PASSWORD con la contraseña inicial.')
        try:
            validate_password(clave)
        except ValidationError as e:
            raise CommandError('La contraseña no es válida: ' + ' '.join(e.messages))
        CustomUser.objects.create_user(email, clave, role=rol, first_name=nombre, last_name=apellido, terms_accepted_at=timezone.now())
        self.stdout.write(self.style.SUCCESS(f'Cuenta creada: {email} ({Role(rol).label}). Al primer ingreso verá el QR del autenticador.'))
