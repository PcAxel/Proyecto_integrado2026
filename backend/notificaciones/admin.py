from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('id', 'usuario_destino', 'tipo', 'leida', 'fecha_creacion')
    list_filter = ('tipo', 'leida')
