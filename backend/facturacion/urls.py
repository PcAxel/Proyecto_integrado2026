from django.urls import re_path

from . import cobranzas as views_cobranzas
from . import views

ORDEN = r'(?P<id_orden>[A-Za-z0-9-]{1,30})'  # el id de una obra del ERP («OB-0003»): solo letras, números y guiones

urlpatterns = [
    re_path(r'^facturacion/resumen/$', views.ResumenDTEView.as_view()),  # antes que las rutas por orden: «resumen» no es un id de obra
    re_path(r'^facturacion/cobranzas/$', views_cobranzas.CobranzasView.as_view()),
    re_path(rf'^facturacion/{ORDEN}/pagos/$', views_cobranzas.RegistrarPagoView.as_view()),
    re_path(rf'^facturacion/emitir/{ORDEN}/$', views.EmitirDTEView.as_view()),
    re_path(rf'^facturacion/{ORDEN}/pdf/$', views.DescargarPDFView.as_view()),
    re_path(rf'^facturacion/{ORDEN}/$', views.EstadoDTEView.as_view()),
]
