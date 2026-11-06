from django.contrib import admin

from .models import Contrato, DocumentoRRHH, Finiquito

admin.site.register([Contrato, DocumentoRRHH, Finiquito])
