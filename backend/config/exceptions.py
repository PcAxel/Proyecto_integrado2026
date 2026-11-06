from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Agrega `code` al cuerpo de los errores de DRF para que el frontend distinga p. ej. `terms_not_accepted`."""
    response = exception_handler(exc, context)
    if response is not None and isinstance(exc, APIException) and isinstance(response.data, dict):
        response.data.setdefault('code', exc.get_codes() if isinstance(exc.get_codes(), str) else None)
    return response
