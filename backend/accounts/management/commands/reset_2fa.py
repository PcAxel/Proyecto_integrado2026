from django.core.management.base import BaseCommand, CommandError

from accounts.models import CustomUser
from accounts.views import _cortar_sesiones


class Command(BaseCommand):
    help = ('Desvincula el autenticador (celular perdido o cambio de equipo): en su próximo ingreso la persona verá el QR de primer ingreso. '
            'La contraseña NO cambia. Uso: reset_2fa correo@fyag.cl  |  reset_2fa --todos')

    def add_arguments(self, parser):
        parser.add_argument('email', nargs='?', help='Correo de la persona')
        parser.add_argument('--todos', action='store_true', help='Reinicia a todas las cuentas activas')

    def handle(self, *args, email=None, todos=False, **opts):
        if bool(email) == bool(todos):
            raise CommandError('Indica un correo o usa --todos (una de las dos).')
        if todos:
            usuarios = list(CustomUser.objects.filter(is_active=True).order_by('email'))
        else:
            try:
                usuarios = [CustomUser.objects.get(email=email.lower())]
            except CustomUser.DoesNotExist:
                raise CommandError('Usuario no encontrado.')
        for user in usuarios:
            user.otp_secret, user.is_2fa_enabled = '', False
            user.save(update_fields=['otp_secret', 'is_2fa_enabled'])
            _cortar_sesiones(user)  # una sesión abierta con el autenticador anterior no debe seguir vigente
            self.stdout.write(self.style.SUCCESS(f'2FA reiniciado: {user.email}'))
