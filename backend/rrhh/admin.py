from django.contrib import admin

from .models import Contrato, DocumentoRRHH, FichaTrabajador, Finiquito

admin.site.register([Contrato, DocumentoRRHH, Finiquito])


@admin.register(FichaTrabajador)
class FichaTrabajadorAdmin(admin.ModelAdmin):
    list_display = ('usuario', 'rut', 'afp', 'sistema_salud', 'tipo_contrato', 'fecha_ingreso')
    search_fields = ('usuario__email', 'rut')

    def has_delete_permission(self, request, obj=None):
        return False  # las fichas se conservan (trazabilidad laboral)
