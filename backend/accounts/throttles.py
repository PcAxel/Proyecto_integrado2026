from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Máximo 5 intentos por minuto por IP (scope 'login') en login y verificación 2FA."""
    scope = 'login'


class RefreshRateThrottle(AnonRateThrottle):
    scope = 'refresh'


class RecuperarRateThrottle(AnonRateThrottle):
    scope = 'recuperar'
