from django.core.management.base import BaseCommand, CommandError

from accounts.models import CustomUser


class Command(BaseCommand):
    help = 'Desvincula el autenticador de un usuario (celular perdido): en su próximo ingreso verá el QR de primer ingreso.'

    def add_arguments(self, parser):
        parser.add_argument('email')

    def handle(self, *args, email, **opts):
        try:
            user = CustomUser.objects.get(email=email.lower())
        except CustomUser.DoesNotExist:
            raise CommandError('Usuario no encontrado.')
        user.otp_secret, user.is_2fa_enabled = '', False
        user.save(update_fields=['otp_secret', 'is_2fa_enabled'])
        self.stdout.write(self.style.SUCCESS(f'2FA reiniciado para {user.email}.'))
