import pyotp
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import CustomUser


class Command(BaseCommand):
    help = 'Imprime el código TOTP vigente de un usuario (solo desarrollo, DEBUG=True).'

    def add_arguments(self, parser):
        parser.add_argument('email')

    def handle(self, *args, email, **opts):
        if not settings.DEBUG:
            raise CommandError('Este comando solo funciona con DJANGO_DEBUG=True.')
        try:
            user = CustomUser.objects.get(email=email.lower())
        except CustomUser.DoesNotExist:
            raise CommandError('Usuario no encontrado.')
        if not user.otp_secret:
            raise CommandError('El usuario aún no vinculó su autenticador.')
        self.stdout.write(pyotp.TOTP(user.otp_secret).now())
