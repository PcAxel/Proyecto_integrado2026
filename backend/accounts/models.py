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


class UsuariosNoSeEliminan(Exception):
    """Los perfiles de usuario son parte de la trazabilidad y la auditoría: se desactivan, nunca se borran."""


class UserQuerySet(models.QuerySet):
    def delete(self):
        raise UsuariosNoSeEliminan('Los usuarios no se eliminan: se desactivan (is_active = False).')


class CustomUserManager(BaseUserManager.from_queryset(UserQuerySet)):
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

    # Desactivación (borrado lógico): quién y cuándo cortó el acceso. El perfil y su historial se conservan siempre.
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    # Defensa contra adivinar contraseñas (ver accounts/bloqueo.py). Se reinician con un ingreso correcto, al recuperar la contraseña
    # o cuando el Administrador reactiva la cuenta.
    intentos_fallidos = models.PositiveSmallIntegerField(default=0)
    ultimo_fallo_en = models.DateTimeField(null=True, blank=True)
    bloqueo_hasta = models.DateTimeField(null=True, blank=True)  # espera entre intentos
    bloqueada_en = models.DateTimeField(null=True, blank=True)   # cuenta de oficina bloqueada por intentos: solo el Administrador la reactiva

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email

    def delete(self, *args, **kwargs):
        raise UsuariosNoSeEliminan('Los usuarios no se eliminan: se desactivan (is_active = False).')

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


class RecuperacionPassword(models.Model):
    """Código de 6 dígitos enviado al correo para elegir una contraseña nueva. Se guarda solo su huella, vence a los 15 minutos y sirve una vez."""
    usuario = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='recuperaciones')
    codigo_hash = models.CharField(max_length=64)
    creado_en = models.DateTimeField(auto_now_add=True)
    expira_en = models.DateTimeField()
    intentos = models.PositiveSmallIntegerField(default=0)
    usado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-creado_en']
