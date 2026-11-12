from django.urls import path

from . import views

urlpatterns = [
    path('ai/chat/', views.ChatView.as_view()),
    path('ai/reportes/<str:token>/', views.DescargarReporteView.as_view()),
    path('ai/extract-invoice/', views.ExtraerFacturaView.as_view()),
    path('ai/draft-report/', views.RedactarReporteView.as_view()),
]
