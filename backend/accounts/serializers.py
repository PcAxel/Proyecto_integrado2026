from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import CustomUser


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            username=attrs['email'].lower(),
            password=attrs['password'],
        )
        # Mensaje único para no revelar si el correo existe.
        if user is None or not user.is_active:
            raise serializers.ValidationError('Credenciales inválidas.', code='authorization')
        attrs['user'] = user
        return attrs


class ChallengeSerializer(serializers.Serializer):
    challenge_token = serializers.CharField()


CODE_FIELD = dict(regex=r'^\d{6}$', error_messages={'invalid': 'El código debe tener 6 dígitos.'})


class OTPVerifySerializer(ChallengeSerializer):
    code = serializers.RegexField(**CODE_FIELD)


class SetupConfirmSerializer(serializers.Serializer):
    temp_token = serializers.CharField()
    code = serializers.RegexField(**CODE_FIELD)


class AcceptTermsSerializer(serializers.Serializer):
    version = serializers.CharField(max_length=30)


class UserSerializer(serializers.ModelSerializer):
    role_label = serializers.CharField(source='get_role_display', read_only=True)
    bloqueada = serializers.SerializerMethodField()  # bloqueada por intentos fallidos: el Administrador la reactiva

    def get_bloqueada(self, u):
        return u.bloqueada_en is not None

    class Meta:
        model = CustomUser
        fields = ('id', 'email', 'first_name', 'last_name', 'role', 'role_label', 'is_active', 'is_2fa_enabled',
                  'terms_accepted_at', 'date_joined', 'deactivated_at', 'bloqueada')
        read_only_fields = fields


class UserCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ('id', 'email', 'first_name', 'last_name', 'role')

    def validate_email(self, value):
        value = value.lower()
        if CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError('Ya existe un usuario con este correo.')
        return value


class RecuperarSolicitudSerializer(serializers.Serializer):
    email = serializers.EmailField()


class RecuperarConfirmarSerializer(serializers.Serializer):
    email = serializers.EmailField()
    codigo = serializers.RegexField(**CODE_FIELD)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
