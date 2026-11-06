from rest_framework.throttling import UserRateThrottle


class IARafagaThrottle(UserRateThrottle):
    """Por usuario: máximo de consultas por minuto (settings: 'ai')."""
    scope = 'ai'


class IADiarioThrottle(UserRateThrottle):
    """Por usuario: tope diario de consultas (settings: 'ai_dia'). Cada llamada consume tokens de pago."""
    scope = 'ai_dia'
