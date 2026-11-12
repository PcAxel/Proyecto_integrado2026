import logging
import secrets
from urllib.parse import quote

import pyotp
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.cache import cache
from django.core import signing
from django.utils import timezone
from django.db import connection
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from config.ip import ip_cliente

from . import bloqueo, recuperacion
from .emails import send_onboarding_email
from .models import CustomUser, Role
from .permissions import IsAdminRole
from .serializers import (
    AcceptTermsSerializer,
    LoginSerializer,
    OTPVerifySerializer,
    RecuperarConfirmarSerializer,
    RecuperarSolicitudSerializer,
    SetupConfirmSerializer,
    UserCreateSerializer,
    UserSerializer,
)
from .throttles import LoginRateThrottle, RecuperarRateThrottle, RefreshRateThrottle

logger = logging.getLogger(__name__)

CHALLENGE_SALT = 'fyag.2fa.challenge'
MENSAJE_BLOQUEADA = 'Tu cuenta fue bloqueada por demasiados intentos fallidos. Comunícate con el administrador para que la desbloquee.'


def make_challenge(user):
    return signing.dumps({'uid': user.pk}, salt=CHALLENGE_SALT)


def user_from_challenge(token):
    """Devuelve el usuario del desafío firmado, o None si es inválido/expirado."""
    try:
        data = signing.loads(token, salt=CHALLENGE_SALT, max_age=settings.TWO_FA_CHALLENGE_MAX_AGE)
        return CustomUser.objects.get(pk=data['uid'], is_active=True)
    except (signing.BadSignature, CustomUser.DoesNotExist, KeyError):
        return None


SETUP_SALT = 'fyag.2fa.setup'
SETUP_MAX_AGE = 600  # 10 min para escanear el QR y confirmar el primer código


def invalid_challenge():
    return Response(
        {'detail': 'Sesión de verificación inválida o expirada. Inicia sesión nuevamente.'},
        status=status.HTTP_401_UNAUTHORIZED,
    )


def provisioning_uri(email, secret):
    """URI estándar para Google Authenticator / Authy."""
    return f'otpauth://totp/FYAG-ERP:{quote(email)}?secret={secret}&issuer=FYAG'


def poner_cookie_refresh(response, refresh):
    """El token de renovación viaja solo en una cookie HttpOnly: JavaScript nunca lo ve (ni lo puede robar un XSS)."""
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME, str(refresh), max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        path=settings.REFRESH_COOKIE_PATH, httponly=True, secure=not settings.DEBUG, samesite=settings.REFRESH_COOKIE_SAMESITE,
    )
    return response


def sesion_response(user):
    """Respuesta de un inicio de sesión exitoso: access en el cuerpo, refresh en cookie HttpOnly."""
    refresh = RefreshToken.for_user(user)
    return poner_cookie_refresh(Response({'access': str(refresh.access_token), 'user': UserSerializer(user).data}), refresh)


class LoginView(APIView):
    """Paso A: valida correo y contraseña. Nunca entrega JWT.

    - 2FA activo   → {"step": "verify_2fa", "challenge_token"}: pedir el código de 6 dígitos.
    - 2FA inactivo → {"step": "setup_2fa", "qr_uri", "secret", "temp_token"}: primer ingreso, vincular el autenticador.
      El secreto es temporal: solo se guarda en el usuario cuando confirma su primer código válido.
    """
    authentication_classes = []
    permission_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        correo = str(request.data.get('email', '')).strip().lower()
        cuenta = CustomUser.objects.filter(email__iexact=correo).first() if correo else None
        if (cuenta and cuenta.bloqueada_en) or (not cuenta and correo and bloqueo.bloqueada_sin_cuenta(correo)):
            return Response({'detail': MENSAJE_BLOQUEADA, 'code': 'account_locked', 'bloqueada': True}, status=status.HTTP_423_LOCKED)
        contable = cuenta if cuenta and cuenta.is_active else None  # una cuenta desactivada por el admin no acumula fallos
        espera = bloqueo.espera_restante(contable, correo)
        if espera:
            # Mientras dura la espera ni siquiera se mira la contraseña: así no hay intentos «gratis» insistiendo.
            return Response({'detail': f'Espera {espera} s antes de volver a intentarlo.', 'code': 'wait', **bloqueo.estado_actual(contable, correo)},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        s = LoginSerializer(data=request.data, context={'request': request})
        if not s.is_valid():
            estado = bloqueo.registrar_fallo(contable, correo)
            if estado['bloqueada']:
                if contable:
                    bloqueo.bloquear_cuenta(contable)
                    logger.warning('cuenta_bloqueada id=%s por intentos fallidos', contable.pk)
                return Response({'detail': MENSAJE_BLOQUEADA, 'code': 'account_locked', **estado}, status=status.HTTP_423_LOCKED)
            return Response({'detail': 'Credenciales inválidas.', 'code': 'invalid_credentials', **estado}, status=status.HTTP_400_BAD_REQUEST)
        bloqueo.limpiar(s.validated_data['user'], correo)
        user = s.validated_data['user']
        if user.is_2fa_enabled:
            return Response({'step': 'verify_2fa', 'challenge_token': make_challenge(user)})
        secret = pyotp.random_base32()
        return Response({
            'step': 'setup_2fa',
            'qr_uri': provisioning_uri(user.email, secret),
            'secret': secret,
            'temp_token': signing.dumps({'uid': user.pk, 'secret': secret}, salt=SETUP_SALT),
        })


class TwoFactorVerifyView(APIView):
    """Paso B (usuarios con 2FA activo): valida el código TOTP y recién entonces entrega access/refresh."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        s = OTPVerifySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = user_from_challenge(s.validated_data['challenge_token'])
        if user is None or not user.is_2fa_enabled or not user.otp_secret:
            return invalid_challenge()
        if not pyotp.TOTP(user.otp_secret).verify(s.validated_data['code'], valid_window=1):
            return Response({'detail': 'Código incorrecto.'}, status=status.HTTP_400_BAD_REQUEST)
        return sesion_response(user)


class VerifySetup2FAView(APIView):
    """Confirma la vinculación inicial: valida el primer código contra el secreto temporal y, si es correcto,
    guarda el secreto, activa el 2FA y emite los JWT definitivos."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        s = SetupConfirmSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            data = signing.loads(s.validated_data['temp_token'], salt=SETUP_SALT, max_age=SETUP_MAX_AGE)
            user = CustomUser.objects.get(pk=data['uid'], is_active=True)
            secret = data['secret']
        except (signing.BadSignature, CustomUser.DoesNotExist, KeyError):
            return invalid_challenge()
        if user.is_2fa_enabled:
            return Response({'detail': 'El 2FA ya está activado para este usuario.'}, status=status.HTTP_400_BAD_REQUEST)
        if not pyotp.TOTP(secret).verify(s.validated_data['code'], valid_window=1):
            return Response({'detail': 'Código incorrecto. Revisa que tu aplicación muestre el código de FYAG.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.otp_secret = secret
        user.is_2fa_enabled = True
        user.save(update_fields=['otp_secret', 'is_2fa_enabled'])
        return sesion_response(user)


class UserCreateView(APIView):
    """El Administrador registra un trabajador; se le envía un correo con credenciales temporales."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(UserSerializer(CustomUser.objects.order_by('email'), many=True).data)

    def post(self, request):
        s = UserCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        temp_password = secrets.token_urlsafe(9)
        user = CustomUser.objects.create_user(password=temp_password, **s.validated_data)

        try:
            send_onboarding_email(user, temp_password)
            email_sent = True
        except Exception:
            email_sent = False
        return Response({**UserSerializer(user).data, 'email_sent': email_sent}, status=status.HTTP_201_CREATED)


def _cortar_sesiones(user):
    """Invalida todos los refresh tokens de la persona (el access token ya deja de servir porque la cuenta queda inactiva)."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
    for t in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=t)


class UserDesactivarView(APIView):
    """POST /api/users/<id>/desactivar/ — solo el Administrador. Borrado lógico: la cuenta pierde el acceso y se conserva todo su historial.
    No existe ningún endpoint para eliminar usuarios."""
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(CustomUser, pk=pk)
        if user.pk == request.user.pk:
            return Response({'detail': 'No puedes desactivar tu propia cuenta.', 'code': 'self_deactivation'}, status=status.HTTP_400_BAD_REQUEST)
        if user.is_active and user.role == Role.ADMIN and not CustomUser.objects.filter(role=Role.ADMIN, is_active=True).exclude(pk=user.pk).exists():
            return Response({'detail': 'Debe quedar al menos un Administrador activo.', 'code': 'last_admin'}, status=status.HTTP_409_CONFLICT)
        if user.is_active:
            user.is_active = False
            user.deactivated_at = timezone.now()
            user.deactivated_by = request.user
            user.save(update_fields=['is_active', 'deactivated_at', 'deactivated_by'])
            _cortar_sesiones(user)
            logger.info('usuario_desactivado id=%s por=%s', user.pk, request.user.pk)
        return Response(UserSerializer(user).data)


class UserReactivarView(APIView):
    """POST /api/users/<id>/reactivar/ — solo el Administrador. Devuelve el acceso (también a una cuenta bloqueada por intentos fallidos); su 2FA y su historial siguen como estaban."""
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        user = get_object_or_404(CustomUser, pk=pk)
        if not user.is_active:
            user.is_active = True
            user.deactivated_at = None
            user.deactivated_by = None
            user.save(update_fields=['is_active', 'deactivated_at', 'deactivated_by'])
            logger.info('usuario_reactivado id=%s por=%s', user.pk, request.user.pk)
        bloqueo.limpiar(user)  # reactivar también devuelve a cero los intentos fallidos y la espera (cuenta bloqueada o no)
        return Response(UserSerializer(user).data)


class MeView(APIView):
    """Estado actual del usuario (incluye terms_accepted_at). Disponible aunque no haya aceptado términos."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class AcceptTermsView(APIView):
    """Registra la aceptación (fecha/hora exactas, IP y versión). Idempotente: no pisa una aceptación previa."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = AcceptTermsSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if s.validated_data['version'] != settings.TERMS_VERSION:
            return Response({'detail': 'Versión de términos desactualizada. Recarga la página.',
                             'current_version': settings.TERMS_VERSION}, status=status.HTTP_409_CONFLICT)

        user = request.user
        if user.terms_accepted_at is None:
            # La IP sale de config.ip: REMOTE_ADDR, o X-Forwarded-For solo de los proxies propios (PROXIES_DE_CONFIANZA).
            user.terms_accepted_at = timezone.now()
            user.terms_accepted_ip = ip_cliente(request)
            user.terms_version = settings.TERMS_VERSION
            user.save(update_fields=['terms_accepted_at', 'terms_accepted_ip', 'terms_version'])
        return Response(UserSerializer(user).data)


class HealthView(APIView):
    """Latido del servidor central: el frontend lo consulta para bloquearse si Django o la base no responden."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request):
        try:
            connection.ensure_connection()
        except Exception:
            return Response({'status': 'db_down'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'status': 'ok'})


def _exigir_cliente(request):
    """Defensa CSRF de los endpoints que usan la cookie: solo el frontend (que manda este encabezado propio) puede llamarlos.
    Un formulario de otro sitio no puede fijarlo, y CORS bloquea al resto."""
    return request.headers.get('X-FYAG-Client') == 'web'


class RefreshView(APIView):
    """Renueva la sesión con la cookie HttpOnly: entrega un access nuevo y rota la cookie (el refresh usado queda anulado)."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [RefreshRateThrottle]

    def post(self, request):
        from rest_framework_simplejwt.exceptions import TokenError
        if not _exigir_cliente(request):
            return Response({'detail': 'Solicitud no permitida.'}, status=status.HTTP_403_FORBIDDEN)
        crudo = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not crudo:
            return Response({'detail': 'No hay sesión.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            viejo = RefreshToken(crudo)
            user = CustomUser.objects.get(pk=viejo['user_id'], is_active=True)
            viejo.blacklist()
        except (TokenError, CustomUser.DoesNotExist, KeyError):
            resp = Response({'detail': 'Sesión expirada.'}, status=status.HTTP_401_UNAUTHORIZED)
            resp.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)
            return resp
        return sesion_response(user)


class LogoutView(APIView):
    """Cierra la sesión en el servidor: invalida el refresh y borra la cookie."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [RefreshRateThrottle]

    def post(self, request):
        from rest_framework_simplejwt.exceptions import TokenError
        if _exigir_cliente(request):
            try:
                RefreshToken(request.COOKIES.get(settings.REFRESH_COOKIE_NAME, '')).blacklist()
            except TokenError:
                pass
        resp = Response(status=status.HTTP_204_NO_CONTENT)
        resp.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)
        return resp


RESPUESTA_RECUPERAR = {'detail': 'Si el correo está registrado, te enviamos un código de 6 dígitos. Vence en 15 minutos.'}


class RecuperarSolicitarView(APIView):
    """POST /api/auth/recuperar/ — pide el código por correo. La respuesta es SIEMPRE la misma: no revela qué correos existen.
    No se envía nada a cuentas desactivadas o bloqueadas (esas las devuelve el Administrador) ni a quien ya pidió 3 códigos en la última hora."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [RecuperarRateThrottle]

    def post(self, request):
        s = RecuperarSolicitudSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        correo = s.validated_data['email'].lower()
        cuenta = CustomUser.objects.filter(email__iexact=correo, is_active=True, bloqueada_en__isnull=True).first()
        if cuenta and recuperacion.puede_solicitar(correo):
            recuperacion.enviar_codigo(cuenta)
        return Response(RESPUESTA_RECUPERAR)


class RecuperarConfirmarView(APIView):
    """POST /api/auth/recuperar/confirmar/ — {email, codigo, password}: con el código correcto fija la contraseña nueva, cierra todas las sesiones
    y reinicia los intentos fallidos. No toca el autenticador (2FA): quien entra sigue necesitando su celular."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        s = RecuperarConfirmarSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        correo = s.validated_data['email'].lower()
        cuenta = CustomUser.objects.filter(email__iexact=correo, is_active=True, bloqueada_en__isnull=True).first()
        r = recuperacion.verificar_codigo(cuenta, s.validated_data['codigo']) if cuenta else None
        if r is None:
            return Response({'detail': 'El código es incorrecto o ya venció. Pide uno nuevo.', 'code': 'invalid_code'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(s.validated_data['password'], cuenta)
        except DjangoValidationError as e:
            return Response({'detail': ' '.join(e.messages), 'code': 'weak_password'}, status=status.HTTP_400_BAD_REQUEST)  # el código no se gasta
        cuenta.set_password(s.validated_data['password'])
        cuenta.save(update_fields=['password'])
        r.usado_en = timezone.now()
        r.save(update_fields=['usado_en'])
        bloqueo.limpiar(cuenta, correo)
        _cortar_sesiones(cuenta)
        logger.info('password_recuperada id=%s', cuenta.pk)
        return Response({'detail': 'Contraseña actualizada. Ya puedes iniciar sesión.'})
