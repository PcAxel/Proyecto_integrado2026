"""Recuperación de contraseña con las vistas nativas de Django (PasswordResetView y compañía), con las defensas del sistema:
- no revela si un correo existe (siempre responde lo mismo) y limita a 3 solicitudes por hora y correo (evita usarlo para llenar de correos a alguien);
- solo cuentas activas (una cuenta bloqueada o desactivada la libera un administrador, no este camino);
- al cambiar la contraseña quita el bloqueo por intentos y cierra todas las sesiones de la cuenta;
- un fallo del proveedor de correo no tumba la pantalla ni delata nada.
El inicio de sesión sigue exigiendo el código del autenticador (2FA) después de cambiar la contraseña.
"""
import logging

from django.conf import settings
from django.contrib.auth import views as auth_views
from django.http import HttpResponseRedirect
from django.urls import reverse_lazy

from . import bloqueo, recuperacion
from .views import _cortar_sesiones

logger = logging.getLogger(__name__)
PLANTILLAS = 'accounts/reset/'


class SolicitarRestablecimiento(auth_views.PasswordResetView):
    template_name = PLANTILLAS + 'form.html'
    email_template_name = PLANTILLAS + 'correo.txt'
    subject_template_name = PLANTILLAS + 'asunto.txt'
    success_url = reverse_lazy('password_reset_done')
    from_email = settings.DEFAULT_FROM_EMAIL

    def form_valid(self, form):
        correo = form.cleaned_data['email'].strip().lower()
        if not recuperacion.puede_solicitar(correo):
            return HttpResponseRedirect(self.get_success_url())  # mismo resultado, sin enviar nada
        try:
            return super().form_valid(form)
        except Exception:
            logger.exception('reset_correo_error')
            return HttpResponseRedirect(self.get_success_url())


class RestablecimientoEnviado(auth_views.PasswordResetDoneView):
    template_name = PLANTILLAS + 'done.html'


class ConfirmarRestablecimiento(auth_views.PasswordResetConfirmView):
    template_name = PLANTILLAS + 'confirm.html'
    success_url = reverse_lazy('password_reset_complete')

    def form_valid(self, form):
        respuesta = super().form_valid(form)  # guarda la contraseña nueva (con las reglas de siempre)
        bloqueo.limpiar(form.user)
        _cortar_sesiones(form.user)
        logger.info('password_restablecida_por_enlace id=%s', form.user.pk)
        return respuesta


class RestablecimientoCompleto(auth_views.PasswordResetCompleteView):
    template_name = PLANTILLAS + 'complete.html'
