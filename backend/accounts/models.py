from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone


class Role(models.TextChoices):
    ADMIN = 'ADMIN', 'Admin'
    FINANZAS = 'FINANZAS', 'Finanzas'
    OPERACIONES = 'OPERACIONES', 'Operaciones'
    TECNICO = 'TECNICO', 'Técnico'
    RRHH = 'RRHH', 'Recursos Humanos'


class CustomUserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, email, password, **extra):
        if not email:
            raise ValueError('El correo es obligatorio')
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault('role', Role.TECNICO)
        return self._create(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault('role', Role.ADMIN)
        extra['is_staff'] = True
        extra['is_superuser'] = True
        return self._create(email, password, **extra)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.TECNICO)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    # 2FA (TOTP). El secreto se genera en el primer login y se activa al verificar el primer código.
    is_2fa_enabled = models.BooleanField(default=False)
    otp_secret = models.CharField(max_length=64, blank=True)

    # Aceptación de términos y condiciones (evidencia: cuándo, desde qué IP y qué versión)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    terms_accepted_ip = models.GenericIPAddressField(null=True, blank=True)
    terms_version = models.CharField(max_length=30, blank=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()
