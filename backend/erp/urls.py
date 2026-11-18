from django.urls import path

from . import autocompletar, views

urlpatterns = [
    path('erp/snapshot/', views.SnapshotView.as_view()),
    path('erp/lote/', views.LoteView.as_view()),
    path('erp/informe-ejecutivo/', views.InformeEjecutivoPptxView.as_view()),
    path('erp/finanzas/resumen/', views.ResumenTributarioView.as_view()),
    path('erp/finanzas/impuestos/', views.ImpuestosView.as_view()),
    path('erp/buscar/<str:tabla>/', autocompletar.BuscarRelacionView.as_view()),
    path('erp/solicitudes-compra/<str:solicitud_id>/emitir/', views.EmitirOrdenesView.as_view()),
    path('erp/solicitudes-compra/<str:solicitud_id>/rechazar/', views.RechazarSolicitudView.as_view()),
    path('erp/obras/<str:obra_id>/aprobar/', views.AprobarObraView.as_view()),
    path('erp/obras/<str:obra_id>/rechazar/', views.RechazarObraView.as_view()),
    path('erp/obras/<str:obra_id>/delegar/', views.DelegarObraView.as_view()),
    path('erp/obras/<str:obra_id>/auditoria-ok/', views.AuditoriaTerrenoOkView.as_view()),
]
