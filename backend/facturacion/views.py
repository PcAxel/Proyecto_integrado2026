"""API de facturación electrónica. Todas las rutas exigen el JWT de un usuario con la acción `facturacion.emitir` de la matriz de permisos
(Administrador General y Administración/Finanzas); cualquier otro rol recibe 403 y sin sesión se recibe 401."""
import logging
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from accounts.permissions import require_terms
from config.ip import ip_cliente
from erp import tablas
from erp.escritura import Lote, siguiente_id

from . import ordenes
from .models import FacturaDTE
from .servicios_dte import DatosFactura, almacen_dte, generar_pdf_dte, guardar_pdf, obtener_proveedor

logger = logging.getLogger(__name__)
ACCION = 'facturacion.emitir'
PROCESANDO_VIGENTE = timedelta(minutes=2)  # un «Procesando» más viejo se considera caído y se puede reintentar


class PuedeFacturar(BasePermission):
    """RBAC: el rol se lee del usuario que identifica el JWT (no de nada que mande el cliente) y se contrasta con la matriz de permisos."""
    message = 'Tu rol no puede emitir facturas electrónicas.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        return tablas.tiene(user, [ACCION])


class DTEThrottle(UserRateThrottle):
    scope = 'dte'


class _Base(APIView):
    permission_classes = [PuedeFacturar]
    throttle_classes = [DTEThrottle]


def serializar(f: FacturaDTE | None, id_orden, orden=None, motivo=None):
    """Estado de la factura de una orden, listo para el frontend. Sin factura devuelve `NO_EMITIDO` con lo que se facturaría (o por qué no se puede)."""
    base = {'orden_id': id_orden, 'estado_sii': FacturaDTE.EstadoSII.NO_EMITIDO, 'estado_label': 'No Emitido', 'folio_sii': None, 'pdf_url': None, 'error': '', 'emitido_en': None}
    if f is not None:
        base.update(estado_sii=f.estado_sii, estado_label=f.get_estado_sii_display(), folio_sii=f.folio_sii, pdf_url=f.pdf_url, error=f.error,
                    emitido_en=f.emitido_en.isoformat() if f.emitido_en else None)
        datos = {'receptor_rut': f.receptor_rut, 'receptor_razon_social': f.receptor_razon_social, 'glosa': f.glosa, 'neto': f.monto_neto, 'iva': f.monto_iva, 'total': f.monto_total}
    elif orden is not None:
        datos = {'receptor_rut': orden.receptor_rut, 'receptor_razon_social': orden.receptor_razon_social, 'glosa': orden.glosa, 'neto': orden.neto, 'iva': orden.iva, 'total': orden.total}
    else:
        datos = {}
    emitible = motivo is None and (f is None or f.estado_sii in (FacturaDTE.EstadoSII.NO_EMITIDO, FacturaDTE.EstadoSII.RECHAZADO))
    return {**base, **datos, 'emitible': emitible, 'motivo': motivo}


class EstadoDTEView(_Base):
    """GET /api/facturacion/<id_orden>/ — estado de la factura de una orden y si se puede emitir."""

    def get(self, request, id_orden):
        f = FacturaDTE.objects.filter(orden_id=id_orden).first()
        if f is not None and f.estado_sii == FacturaDTE.EstadoSII.ACEPTADO:
            return Response(serializar(f, id_orden))
        try:
            orden = ordenes.orden_facturable(id_orden)
            return Response(serializar(f, id_orden, orden))
        except ordenes.OrdenNoFacturable as e:
            if e.status == 404:
                return Response({'detail': e.mensaje, 'code': e.code}, status=404)
            return Response(serializar(f, id_orden, motivo=e.mensaje))


class EmitirDTEView(_Base):
    """POST /api/facturacion/emitir/<id_orden>/ — emite la factura electrónica de una obra finalizada.

    1) Valida la orden y RESERVA la emisión (estado «Procesando», con bloqueo de fila: dos clics o dos usuarios a la vez no emiten dos facturas).
    2) Llama al proveedor FUERA de la transacción (puede tardar). 3) Guarda folio y PDF y marca «Aceptado», o «Rechazado» si el proveedor falla."""

    def post(self, request, id_orden):
        try:
            orden = ordenes.orden_facturable(id_orden)
        except ordenes.OrdenNoFacturable as e:
            return Response({'detail': e.mensaje, 'code': e.code}, status=e.status)
        reservada = self._reservar(request.user, orden)
        if isinstance(reservada, Response):
            return reservada
        f = reservada
        url = f'/api/facturacion/{id_orden}/pdf/'
        folio = (FacturaDTE.objects.filter(folio_sii__isnull=False).order_by('-folio_sii').values_list('folio_sii', flat=True).first() or 9998) + 1
        datos = DatosFactura(id_orden, orden.receptor_rut, orden.receptor_razon_social, orden.glosa, orden.neto, orden.iva, orden.total, url, folio, timezone.localdate())
        try:
            resp = obtener_proveedor().emitir(datos)
        except Exception:  # un fallo del proveedor no debe dejar la orden «Procesando» para siempre
            logger.exception('dte_proveedor_error orden=%s', id_orden)
            resp = {'exito': False, 'error': 'El proveedor de facturación no respondió.'}
        if not resp.get('exito'):
            return self._rechazar(f, str(resp.get('error') or 'El SII rechazó el documento.'))
        return self._aceptar(request, f, resp)

    @staticmethod
    def _reservar(user, orden):
        try:
            with transaction.atomic():
                f = FacturaDTE.objects.select_for_update().filter(orden_id=orden.orden_id).first()
                if f is not None:
                    if f.estado_sii == FacturaDTE.EstadoSII.ACEPTADO:
                        return Response({'detail': f'La orden ya tiene factura electrónica (folio {f.folio_sii}).', 'code': 'ya_emitida', **serializar(f, orden.orden_id)}, status=409)
                    if f.estado_sii == FacturaDTE.EstadoSII.PROCESANDO and timezone.now() - f.actualizado_en < PROCESANDO_VIGENTE:
                        return Response({'detail': 'La factura de esta orden ya se está procesando.', 'code': 'en_proceso'}, status=409)
                else:
                    f = FacturaDTE(orden_id=orden.orden_id)
                f.estado_sii, f.error, f.creado_por = FacturaDTE.EstadoSII.PROCESANDO, '', user
                f.receptor_rut, f.receptor_razon_social, f.glosa = orden.receptor_rut, orden.receptor_razon_social, orden.glosa
                f.monto_neto, f.monto_iva, f.monto_total = orden.neto, orden.iva, orden.total
                f.save()
                return f
        except IntegrityError:  # otra petición creó la fila a la vez
            return Response({'detail': 'La factura de esta orden ya se está procesando.', 'code': 'en_proceso'}, status=409)

    @staticmethod
    def _rechazar(f, motivo):
        f.estado_sii, f.error = FacturaDTE.EstadoSII.RECHAZADO, motivo[:300]
        f.save(update_fields=['estado_sii', 'error', 'actualizado_en'])
        return Response({'detail': f'No se pudo emitir: {f.error}', 'code': 'rechazada', **serializar(f, f.orden_id)}, status=502)

    @staticmethod
    def _aceptar(request, f, resp):
        try:
            with transaction.atomic():
                f.folio_sii, f.pdf_url, f.pdf_archivo, f.xml_timbre = resp['folio_sii'], resp['pdf_url'], resp['pdf_archivo'], resp.get('xml_timbre')
                f.estado_sii, f.error, f.emitido_en = FacturaDTE.EstadoSII.ACEPTADO, '', timezone.now()
                f.save()
        except IntegrityError:  # el folio ya lo tomó otra emisión simultánea: se informa y se puede reintentar
            return EmitirDTEView._rechazar(f, 'El folio ya estaba en uso por otra emisión simultánea. Intenta de nuevo.')
        try:  # auditoría del ERP: quién emitió qué y cuándo (si falla, la factura ya está emitida: no se deshace)
            Lote(request.user, ip_cliente(request)).insertar('auditoria', {
                'id': siguiente_id('auditoria'), 'entidad': 'FacturaDTE', 'entidad_id': f.orden_id, 'accion': 'EMITIR', 'anterior': None,
                'nuevo': {'folio': f.folio_sii, 'total': f.monto_total, 'estado': f.estado_sii}})
        except Exception:
            logger.exception('dte_auditoria_error orden=%s', f.orden_id)
        logger.info('dte_emitida orden=%s folio=%s user=%s', f.orden_id, f.folio_sii, request.user.pk)
        return Response(serializar(f, f.orden_id))


class DescargarPDFView(_Base):
    """GET /api/facturacion/<id_orden>/pdf/ — PDF de una factura ACEPTADA. El archivo es privado: solo se entrega a quien tiene el permiso.
    Si el archivo ya no está en el disco (reinicio del servidor), se vuelve a generar desde los datos guardados."""

    def get(self, request, id_orden):
        f = FacturaDTE.objects.filter(orden_id=id_orden, estado_sii=FacturaDTE.EstadoSII.ACEPTADO).first()
        if f is None:
            raise Http404
        if not f.pdf_archivo or not almacen_dte.exists(f.pdf_archivo):
            datos = DatosFactura(f.orden_id, f.receptor_rut, f.receptor_razon_social, f.glosa, f.monto_neto, f.monto_iva, f.monto_total, f.pdf_url or '', f.folio_sii, f.emitido_en.date())
            f.pdf_archivo = guardar_pdf(generar_pdf_dte(datos, f.folio_sii, simulado=settings.DTE_PROVEEDOR == 'simulado'))
            f.save(update_fields=['pdf_archivo', 'actualizado_en'])
        respuesta = FileResponse(almacen_dte.open(f.pdf_archivo, 'rb'), as_attachment=True, filename=f'factura-{f.folio_sii}.pdf', content_type='application/pdf')
        respuesta['Cache-Control'] = 'private, no-store'
        respuesta['X-Content-Type-Options'] = 'nosniff'
        return respuesta
