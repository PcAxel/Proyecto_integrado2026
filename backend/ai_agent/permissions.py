from rest_framework.permissions import BasePermission

from accounts.permissions import require_terms


class SoloRoles(BasePermission):
    """Acceso exacto por rol: la vista declara `roles_permitidos`. A diferencia de RolePermission, ADMIN NO es comodín:
    el agente aplica mínimo privilegio y cada endpoint nombra a quién sirve."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        return user.role in view.roles_permitidos
