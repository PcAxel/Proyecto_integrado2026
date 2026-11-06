from django.urls import path

from . import views

urlpatterns = [
    path('asistencia/mi-dia/', views.MiDiaView.as_view()),
    path('asistencia/marcar/', views.MarcarView.as_view()),
    path('asistencia/hoy/', views.AsistenciaHoyView.as_view()),
]
