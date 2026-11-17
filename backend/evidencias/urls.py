from django.urls import path

from . import salud, views

urlpatterns = [
    path('salud/', salud.SaludView.as_view()),
    path('sistema/estado/', salud.EstadoSistemaView.as_view()),
    path('evidencias/', views.EvidenciaCreateView.as_view()),
    path('evidencias/<str:oid>/', views.EvidenciaDetailView.as_view()),
    path('evidencias/<str:oid>/foto/', views.EvidenciaFotoView.as_view()),
]
