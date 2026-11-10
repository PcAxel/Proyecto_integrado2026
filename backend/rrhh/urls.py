from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('rrhh/personal', views.PersonalViewSet, basename='rrhh-personal')
router.register('rrhh/fichas', views.FichaTrabajadorViewSet, basename='rrhh-fichas')
router.register('rrhh/contratos', views.ContratoViewSet, basename='rrhh-contratos')
router.register('rrhh/documentos', views.DocumentoViewSet, basename='rrhh-documentos')
router.register('rrhh/finiquitos', views.FiniquitoViewSet, basename='rrhh-finiquitos')

router.register('rrhh/documentos-laborales', views.DocumentoLaboralViewSet, basename='rrhh-docs-laborales')
router.register('rrhh/mis-documentos', views.MisDocumentosViewSet, basename='rrhh-mis-documentos')

urlpatterns = [path('rrhh/firmar-documento/<int:pk>/', views.FirmarDocumentoView.as_view()), *router.urls]
