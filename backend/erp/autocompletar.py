"""Buscador asíncrono para los campos que relacionan datos (proveedor, artículo, cliente, obra…): el navegador NUNCA descarga la lista completa.

GET /api/erp/buscar/<tabla>/?search=texto&limit=15  → como máximo 20 coincidencias `{id, label, detalle}`.
GET /api/erp/buscar/<tabla>/?ids=PRV-001,PRV-002    → las filas con esos ids (para mostrar lo ya elegido al editar).

Lo que puede buscar cada persona es lo mismo que ya puede leer en el ERP (`tablas.puede_leer`); el Técnico no tiene este buscador. Solo devuelve el
mínimo para elegir (código, nombre y un detalle): nunca costos, tarifas ni datos sensibles. Los inactivos no aparecen salvo que se pidan por id.
"""
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.filters import SearchFilter
from rest_framework.generics import ListAPIView
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import TermsAccepted

from . import tablas
from .models import Registro

MAX_RESULTADOS = 20
POR_DEFECTO = 10

# tabla → campos del JSON donde se busca, y cómo se muestra cada resultado
CONFIG = {
    'proveedores': {'campos': ['datos__razon_social', 'datos__rut'], 'label': lambda f: f.get('razon_social') or f['id'], 'detalle': lambda f: f.get('rut', '')},
    'clientes': {'campos': ['datos__razon_social', 'datos__rut'], 'label': lambda f: f.get('razon_social') or f['id'], 'detalle': lambda f: f.get('rut', '')},
    'articulos': {'campos': ['datos__sku', 'datos__nombre', 'datos__categoria'], 'label': lambda f: f"{f.get('sku', '')} · {f.get('nombre', '')}",
                  'detalle': lambda f: f.get('categoria', '')},
    'obras': {'campos': ['datos__nombre'], 'label': lambda f: f"{f['id']} · {f.get('nombre', '')}", 'detalle': lambda f: f.get('estado', '')},
}


def _entero(valor, defecto, minimo, maximo):
    try:
        return max(minimo, min(int(valor), maximo))
    except (TypeError, ValueError):
        return defecto


class BuscarRelacionView(ListAPIView):
    """Autocompletado de una tabla del ERP con el `SearchFilter` de DRF (`?search=`). Devuelve pocas filas por vez, nunca la tabla completa."""
    permission_classes = [TermsAccepted]
    filter_backends = [SearchFilter]
    pagination_class = None

    def _config(self):
        tabla = self.kwargs['tabla']
        if tabla not in CONFIG:
            raise NotFound('Tabla no disponible para búsqueda.')
        user = self.request.user
        if user.role == Role.TECNICO or not tablas.puede_leer(user, tabla):
            raise PermissionDenied('No tiene permiso para buscar aquí.')
        return tabla, CONFIG[tabla]

    @property
    def search_fields(self):  # el SearchFilter de DRF lee este atributo: aquí depende de la tabla pedida
        return ['rid', *self._config()[1]['campos']]

    def get_queryset(self):
        tabla, _ = self._config()
        return Registro.objects.filter(tabla=tabla).order_by('rid')

    def list(self, request, *args, **kwargs):
        tabla, cfg = self._config()
        ids = [i.strip() for i in str(request.query_params.get('ids', '')).split(',') if i.strip()][:MAX_RESULTADOS]
        if ids:
            registros = list(Registro.objects.filter(tabla=tabla, rid__in=ids))
        else:
            limite = _entero(request.query_params.get('limit'), POR_DEFECTO, 1, MAX_RESULTADOS)
            consulta = self.filter_queryset(self.get_queryset())
            if 'activo' in {k for r in Registro.objects.filter(tabla=tabla)[:1] for k in r.datos}:
                consulta = consulta.exclude(datos__activo=False)  # un inactivo no se ofrece para operaciones nuevas
            registros = list(consulta[:limite])
        filas = [r.fila() for r in registros]
        return Response([{'id': f['id'], 'label': cfg['label'](f), 'detalle': cfg['detalle'](f)} for f in filas])
