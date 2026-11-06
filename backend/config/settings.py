"""Configuración de Django para el backend del ERP de FYAG."""
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')


def env_list(name, default=''):
    return [v.strip() for v in os.getenv(name, default).split(',') if v.strip()]


SECRET_KEY = os.environ['DJANGO_SECRET_KEY']
DEBUG = os.getenv('DJANGO_DEBUG', 'False') == 'True'
ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework_simplejwt.token_blacklist',
    'rest_framework',
    'accounts',
    'presupuestos',
    'obras',
    'bodega',
    'personal',
    'flota',
    'evidencias',
    'asistencia',
    'erp',
    'ai_agent',
    'rrhh',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# --- Base de datos: MySQL por defecto; sqlite solo para pruebas locales sin servidor ---
if os.getenv('DB_ENGINE', 'mysql') == 'sqlite':
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': os.environ['DB_NAME'],
            'USER': os.environ['DB_USER'],
            'PASSWORD': os.environ['DB_PASSWORD'],
            'HOST': os.getenv('DB_HOST', '127.0.0.1'),
            'PORT': os.getenv('DB_PORT', '3306'),
            'OPTIONS': {'charset': 'utf8mb4'},
        }
    }

AUTH_USER_MODEL = 'accounts.CustomUser'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es-cl'
TIME_ZONE = 'America/Santiago'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- CORS: frontend React/Vite ---
CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173')
CORS_ALLOW_CREDENTIALS = True  # la cookie HttpOnly de renovación viaja con las peticiones del frontend
CORS_ALLOW_HEADERS = [*__import__('corsheaders.defaults', fromlist=['default_headers']).default_headers, 'x-fyag-client']
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS', '')

# --- DRF ---
REST_FRAMEWORK = {
    'NUM_PROXIES': int(os.getenv('PROXIES_DE_CONFIANZA', '0')),  # sin esto DRF confía en X-Forwarded-For y el límite de intentos se esquiva
    'EXCEPTION_HANDLER': 'config.exceptions.api_exception_handler',
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework_simplejwt.authentication.JWTAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
        'accounts.permissions.TermsAccepted',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '20/min',
        'user': '120/min',
        'login': '5/min',
        'refresh': '60/min',
        'ai': '15/min',      # ráfaga por usuario (una conversación hace varias consultas seguidas)
        'firma': '10/min',   # intentos de firma por usuario (cada uno exige un código 2FA)
        'ai_dia': '150/day',  # tope diario por usuario: cada llamada cuesta tokens
    },
}

if not DEBUG:
    # Producción: solo JSON (sin la interfaz navegable de DRF, que necesita archivos estáticos y expone el esquema).
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = ['rest_framework.renderers.JSONRenderer']

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,  # un refresh usado queda inválido: robarlo no sirve después
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# --- MongoDB (evidencia fotográfica de terreno) ---
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://127.0.0.1:27017')
MONGO_DB_NAME = os.getenv('MONGO_DB_NAME', 'fyag_evidencias')
EVIDENCIA_MAX_BYTES = int(os.getenv('EVIDENCIA_MAX_BYTES', str(8 * 1024 * 1024)))

# Versión vigente de los términos y condiciones; el cliente debe enviarla al aceptar
TERMS_VERSION = os.getenv('TERMS_VERSION', '2026-11-v1')

# --- Cookie de sesión (token de renovación): HttpOnly, no la puede leer ningún script de la página ---
REFRESH_COOKIE_NAME = 'fyag_refresh'
REFRESH_COOKIE_PATH = '/api/auth/'
# Lax sirve si la app y la API comparten sitio (app.fyag.cl y api.fyag.cl). Si estuvieran en dominios distintos haría falta 'None'.
REFRESH_COOKIE_SAMESITE = os.getenv('REFRESH_COOKIE_SAMESITE', 'Lax')

# --- Agente de IA (DeepSeek, compatible con la API de OpenAI) ---
DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY', '')  # sin clave el agente responde 503; nunca se envía al frontend
DEEPSEEK_BASE_URL = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
DEEPSEEK_MODEL = os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')
AI_TIMEOUT_SEGUNDOS = int(os.getenv('AI_TIMEOUT_SEGUNDOS', '30'))
AI_MAX_TOKENS_RESPUESTA = int(os.getenv('AI_MAX_TOKENS_RESPUESTA', '700'))
AI_SOPORTA_IMAGEN = os.getenv('AI_SOPORTA_IMAGEN', 'False') == 'True'  # deepseek-chat no lee imágenes: se envía texto OCR
AI_MAX_TOKENS_CHAT = int(os.getenv('AI_MAX_TOKENS_CHAT', '1200'))
AI_MAX_CHARS_RESPUESTA_CHAT = 8_000
AI_CHAT_MAX_MENSAJES = 20          # turnos que se reenvían al modelo en cada consulta
AI_CHAT_MAX_CHARS_MENSAJE = 4_000
AI_CHAT_MAX_CHARS_TOTAL = 20_000
AI_MAX_CHARS_TEXTO = 20_000
AI_MAX_CHARS_NOTAS = 2_000
AI_MAX_BYTES_IMAGEN = 5 * 1024 * 1024

# --- 2FA ---
OTP_ISSUER = 'FYAG ERP'
# Vigencia (segundos) del desafío entre el paso A (credenciales) y el paso B (código TOTP)
TWO_FA_CHALLENGE_MAX_AGE = 300

# --- Correo / onboarding ---
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'FYAG ERP <no-reply@fyag.cl>')
PWA_INSTALL_URL = os.getenv('PWA_INSTALL_URL', 'http://localhost:5173/instalar')

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True') == 'True'
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = 'same-origin'
    X_FRAME_OPTIONS = 'DENY'
    # Detrás de un proxy/balanceador de confianza que termina TLS: DJANGO_PROXY_SSL=True
    if os.getenv('DJANGO_PROXY_SSL', 'False') == 'True':
        SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# --- RR. HH.: archivos privados (contratos, amonestaciones, comprobantes). Nunca bajo una URL pública. ---
ARCHIVOS_PRIVADOS = Path(os.getenv('ARCHIVOS_PRIVADOS', BASE_DIR / '.datos' / 'archivos'))
VALOR_UF = os.getenv('VALOR_UF')  # opcional: aplica el tope legal de 90 UF a la indemnización

# Cantidad de proxies/balanceadores propios delante de Django (Vercel, nginx, etc.). 0 = conexión directa.
# Define de dónde se lee la IP real para la evidencia de firma, la aceptación de términos y los límites de uso.
PROXIES_DE_CONFIANZA = int(os.getenv('PROXIES_DE_CONFIANZA', '0'))
