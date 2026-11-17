from django.urls import path

from . import views

urlpatterns = [
    path('notificaciones/', views.NotificacionesView.as_view()),
    path('notificaciones/marcar-leidas/', views.MarcarLeidasView.as_view()),
]
