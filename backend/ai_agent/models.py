"""Gobernanza del agente de IA: bitácora inmutable de cada interacción y política de lo que el agente puede hacer por rol."""
from django.conf import settings
from django.db import models

from accounts.models import Role


class BitacoraInmutable(Exception):
    """La bitácora de prompts es evidencia de auditoría: solo admite altas."""


class _SoloAltas(models.QuerySet):
    def update(self, **kwargs):
        raise BitacoraInmutable('La bitácora de prompts no se modifica.')

    def delete(self):
        raise BitacoraInmutable('La bitácora de prompts no se elimina.')


class AIPromptAuditLog(models.Model):
    """Una fila por cada mensaje enviado al agente: quién, con qué rol, desde qué pantalla, qué pidió, qué respondió el agente,
    qué acciones de interfaz se le autorizaron y cómo lo clasificó el control de seguridad. La escribe solo el servidor."""

    class Estado(models.TextChoices):
        PERMITIDO = 'PERMITIDO', 'Permitido'
        BLOQUEADO_POR_ROL = 'BLOQUEADO_POR_ROL', 'Bloqueado por rol'
        REQUIERE_ACLARACION = 'REQUIERE_ACLARACION', 'Requiere aclaración'

    class Riesgo(models.TextChoices):
        BAJO = 'BAJO', 'Bajo'
        MEDIO = 'MEDIO', 'Medio'
        ALTO = 'ALTO', 'Alto · intento de acceso no autorizado'

    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    rol_activo = models.CharField(max_length=20, choices=Role.choices, help_text='Rol que tenía la persona en ese momento (no cambia si después se le asigna otro)')
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    modulo_origen = models.CharField(max_length=80, blank=True, help_text='Pantalla desde la que preguntó')
    prompt_enviado = models.TextField()
    respuesta_ia = models.TextField(blank=True)
    acciones_ui_ejecutadas = models.JSONField(default=list, blank=True, help_text='Acciones de interfaz que el servidor autorizó al agente en este turno')
    tokens_estimados = models.PositiveIntegerField(default=0)
    latencia_ms = models.PositiveIntegerField(default=0)
    estado_seguridad = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PERMITIDO, db_index=True)
    nivel_riesgo = models.CharField(max_length=6, choices=Riesgo.choices, default=Riesgo.BAJO, db_index=True)
    motivo = models.CharField(max_length=200, blank=True, help_text='Por qué se bloqueó o se marcó (tema fuera del ámbito del rol, posible manipulación…)')
    motor = models.CharField(max_length=10, blank=True, help_text='ia = proveedor de IA · local = motor del sistema · politica = respondió el control de seguridad')

    objects = _SoloAltas.as_manager()

    class Meta:
        ordering = ['-timestamp', '-id']
        verbose_name = 'registro de prompt de IA'
        verbose_name_plural = 'bitácora de prompts de IA'
        indexes = [models.Index(fields=['rol_activo', 'timestamp'])]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise BitacoraInmutable('La bitácora de prompts no se modifica.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise BitacoraInmutable('La bitácora de prompts no se elimina.')

    def __str__(self):
        return f'{self.timestamp:%Y-%m-%d %H:%M} · {self.rol_activo} · {self.estado_seguridad}'


class AIPoliticaRol(models.Model):
    """Derechos y deberes del agente para un rol. Sin fila, rige la política por defecto (todo activo). La administra TI."""
    rol = models.CharField(max_length=20, choices=Role.choices, unique=True)
    agente_activo = models.BooleanField(default=True, help_text='Apagado: el agente no responde a este rol')
    permite_navegar = models.BooleanField(default=True)
    permite_buscar = models.BooleanField(default=True)
    permite_resaltar = models.BooleanField(default=True)
    permite_rellenar = models.BooleanField(default=True, help_text='Completar formularios; el botón final siempre lo pulsa la persona')
    permite_reportes = models.BooleanField(default=True, help_text='Generar archivos y cálculos con las herramientas del agente')
    max_acciones = models.PositiveSmallIntegerField(default=4, help_text='Límite de acciones de interfaz automáticas por respuesta')
    actualizado_en = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['rol']
        verbose_name = 'política del agente de IA por rol'
        verbose_name_plural = 'políticas del agente de IA por rol'

    def __str__(self):
        return f'Política IA · {self.rol}'
