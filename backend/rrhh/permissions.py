from rest_framework.permissions import BasePermission

from accounts.models import Role
from accounts.permissions import require_terms


class AccionesPorRol(BasePermission):
    """Segregación de funciones. Cada vista declara qué acciones puede ejecutar cada rol:

        acciones_por_rol = {Role.RRHH: {'list', 'create'}, Role.FINANZAS: {'list'}}

    Lo que no está listado se deniega (403). ADMIN supervisa todo, pero lo declara cada vista: no hay comodín implícito.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        return getattr(view, 'action', None) in view.acciones_por_rol.get(user.role, ())


class PuedeVerCumplimiento(BasePermission):
    """Acción `cumplimiento.ver` de la matriz de permisos (RR. HH., Gerencia General y Auditor Externo)."""

    def has_permission(self, request, view):
        from erp import tablas
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        return tablas.tiene(user, ['cumplimiento.ver'])


def acciones(*nombres):
    return set(nombres)
