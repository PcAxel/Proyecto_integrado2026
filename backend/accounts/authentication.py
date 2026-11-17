from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Role


class JWTConAuditorSoloLectura(JWTAuthentication):
    """JWT de siempre + una garantía transversal: el Auditor Externo solo puede leer (GET, HEAD, OPTIONS).

    Va en la autenticación, y no en cada permiso, para que valga en TODOS los endpoints, también en los que se agreguen
    después: una cuenta de auditoría no puede crear, editar, aprobar ni firmar nada aunque una vista lo permita por error.
    Cerrar sesión y renovarla no pasan por aquí (esas vistas no usan autenticación por token).
    """

    def authenticate(self, request):
        resultado = super().authenticate(request)
        if resultado and resultado[0].role == Role.AUDITOR and request.method not in SAFE_METHODS:
            raise PermissionDenied('La cuenta de auditoría es de solo lectura: no puede modificar registros.', code='solo_lectura')
        return resultado
