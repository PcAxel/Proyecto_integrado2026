from rest_framework.permissions import BasePermission

from accounts.permissions import require_terms


class _PorAccion(BasePermission):
    """Permiso por una acción de la matriz (`erp.permisos_generados`)."""
    accion = ''

    def has_permission(self, request, view):
        from erp import tablas
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        return tablas.tiene(user, [self.accion])


class PuedeVerGobernanzaIA(_PorAccion):
    """Trazabilidad de prompts y políticas del agente: TI y, en lectura, la Gerencia General."""
    accion = 'gobernanza_ia.ver'


class PuedeGestionarGobernanzaIA(_PorAccion):
    """Cambiar los derechos y deberes del agente: solo TI."""
    accion = 'gobernanza_ia.gestionar'


class SoloRoles(BasePermission):
    """Acceso exacto por rol: la vista declara `roles_permitidos`. A diferencia de RolePermission, ADMIN NO es comodín:
    el agente aplica mínimo privilegio y cada endpoint nombra a quién sirve."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        return user.role in view.roles_permitidos
