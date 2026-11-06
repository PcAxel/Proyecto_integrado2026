from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role


def require_terms(user):
    """Bloquea con 403 `terms_not_accepted` a quien aún no aceptó los términos."""
    if user.terms_accepted_at is None:
        raise PermissionDenied('Debes aceptar los términos y condiciones para usar el sistema.',
                               code='terms_not_accepted')


class TermsAccepted(BasePermission):
    """Permiso por defecto: usuario autenticado con términos aceptados."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False  # lo resuelve IsAuthenticated (401)
        require_terms(user)
        return True


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        return user.role == Role.ADMIN


class RolePermission(BasePermission):
    """RBAC por vista. La vista declara qué roles pueden leer y cuáles escribir:

        role_access = {'read': {Role.FINANZAS}, 'write': {Role.FINANZAS}}

    ADMIN siempre tiene acceso. Un rol no listado recibe 403; sin `role_access` se deniega todo.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        if user.role == Role.ADMIN:
            return True
        access = getattr(view, 'role_access', {})
        key = 'read' if request.method in SAFE_METHODS else 'write'
        return user.role in access.get(key, ())
