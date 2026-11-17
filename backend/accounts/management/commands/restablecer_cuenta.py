import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from accounts.models import CustomUser, Role
from accounts.views import _cortar_sesiones


class Command(BaseCommand):
    help = ('Devuelve el acceso a una cuenta: si no existe la crea (con --rol); si existe le fija la contraseña nueva, quita el bloqueo por intentos fallidos '
            'y la reactiva. La contraseña llega por la variable de entorno FYAG_CUENTA_PASSWORD (no por argumentos). No toca el autenticador: si también se '
            'perdió, usa reset_2fa. Uso: FYAG_CUENTA_PASSWORD=... python manage.py restablecer_cuenta ti@apexsystems.cl --rol SUPERADMIN')

    def add_arguments(self, parser):
        parser.add_argument('email')
        parser.add_argument('--rol', choices=Role.values, help='Obligatorio solo si la cuenta no existe')
        parser.add_argument('--nombre', default='')
        parser.add_argument('--apellido', default='')

    def handle(self, *args, email, rol, nombre, apellido, **opts):
        email = email.strip().lower()
        clave = os.environ.get('FYAG_CUENTA_PASSWORD', '')
        if not clave:
            raise CommandError('Falta la variable de entorno FYAG_CUENTA_PASSWORD con la contraseña nueva.')
        try:
            validate_password(clave)
        except ValidationError as e:
            raise CommandError('La contraseña no es válida: ' + ' '.join(e.messages))
        user = CustomUser.objects.filter(email=email).first()
        if user is None:
            if not rol:
                raise CommandError(f'{email} no existe: indica --rol para crearla.')
            CustomUser.objects.create_user(email, clave, role=rol, first_name=nombre, last_name=apellido, terms_accepted_at=timezone.now())
            self.stdout.write(self.style.SUCCESS(f'Cuenta creada: {email} ({Role(rol).label}). Al primer ingreso verá el QR del autenticador.'))
            return
        user.set_password(clave)
        user.is_active = True
        user.intentos_fallidos, user.ultimo_fallo_en, user.bloqueo_hasta, user.bloqueada_en = 0, None, None, None
        user.save()
        _cortar_sesiones(user)  # una sesión abierta con la clave anterior no debe seguir vigente
        self.stdout.write(self.style.SUCCESS(f'Acceso restablecido: {email} ({user.get_role_display()}): contraseña nueva, sin bloqueo y activa.'))
