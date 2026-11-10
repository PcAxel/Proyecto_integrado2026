from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('accounts.urls')),
    path('api/', include('presupuestos.urls')),
    path('api/', include('obras.urls')),
    path('api/', include('bodega.urls')),
    path('api/', include('flota.urls')),
    path('api/', include('evidencias.urls')),
    path('api/', include('asistencia.urls')),
    path('api/', include('erp.urls')),
    path('api/', include('ai_agent.urls')),
    path('api/', include('rrhh.urls')),
]
