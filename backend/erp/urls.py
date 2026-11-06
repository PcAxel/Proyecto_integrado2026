from django.urls import path

from . import views

urlpatterns = [
    path('erp/snapshot/', views.SnapshotView.as_view()),
    path('erp/lote/', views.LoteView.as_view()),
]
