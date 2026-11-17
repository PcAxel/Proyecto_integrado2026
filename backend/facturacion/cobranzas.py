"""Cuentas por cobrar: pagos de los clientes contra las facturas electrónicas emitidas.

Ver las cobranzas lo puede Gerencia, Finanzas y el Auditor; registrar un pago solo Finanzas (`cobranzas.gestionar`). El servidor valida todo
(monto contra el saldo, fecha, método) y es él quien deja la factura en PAGADA cuando los pagos cubren el total.
"""
import logging
from datetime import date

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import require_terms
from config.ip import ip_cliente
from erp import flujo, tablas
from erp.escritura import Lote, marcar_etapa, siguiente_id

from .models import FacturaDTE, PagoCliente

logger = logging.getLogger(__name__)


class PermisoCobranzas(BasePermission):
    message = 'Tu rol no puede gestionar cobranzas.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        require_terms(user)
        return tablas.tiene(user, ['cobranzas.ver', 'cobranzas.gestionar'] if request.method in SAFE_METHODS else ['cobranzas.gestionar'])


def _pagado(f):
    return f.pagos.aggregate(t=Sum('monto'))['t'] or 0


def fila_cobranza(f):
    pagado = _pagado(f)
    return {
        'orden_id': f.orden_id, 'folio_sii': f.folio_sii, 'cliente': f.receptor_razon_social, 'rut': f.receptor_rut, 'glosa': f.glosa,
        'emitida_en': f.emitido_en.isoformat() if f.emitido_en else None, 'total': f.monto_total, 'pagado': pagado, 'saldo': f.monto_total - pagado,
        'estado_cobro': f.estado_cobro, 'estado_cobro_label': f.get_estado_cobro_display(), 'pagada_en': f.pagada_en.isoformat() if f.pagada_en else None,
        'pagos': [{'id': p.id, 'fecha': p.fecha.isoformat(), 'monto': p.monto, 'metodo': p.metodo, 'metodo_label': p.get_metodo_display(), 'referencia': p.referencia,
                   'registrado_por': (p.registrado_por.full_name or p.registrado_por.email) if p.registrado_por else None} for p in f.pagos.select_related('registrado_por')],
    }


class CobranzasView(APIView):
    """GET /api/facturacion/cobranzas/ — facturas aceptadas con su saldo; las pendientes primero (la más antigua arriba)."""
    permission_classes = [PermisoCobranzas]

    def get(self, request):
        facturas = list(FacturaDTE.objects.filter(estado_sii=FacturaDTE.EstadoSII.ACEPTADO).prefetch_related('pagos').order_by('emitido_en'))
        filas = [fila_cobranza(f) for f in facturas]
        filas.sort(key=lambda r: r['estado_cobro'] == FacturaDTE.EstadoCobro.PAGADA)  # estable: conserva el orden por antigüedad
        return Response({
            'por_cobrar': sum(r['saldo'] for r in filas), 'cobrado': sum(r['pagado'] for r in filas),
            'pendientes': sum(1 for r in filas if r['estado_cobro'] != FacturaDTE.EstadoCobro.PAGADA), 'facturas': filas})


def _error(detalle, status=422, code='regla_negocio'):
    return Response({'detail': detalle, 'code': code}, status=status)


class RegistrarPagoView(APIView):
    """POST /api/facturacion/<orden>/pagos/ {fecha, monto, metodo, referencia?} — registra un pago; con el último, la factura queda PAGADA."""
    permission_classes = [PermisoCobranzas]

    def post(self, request, id_orden):
        d = request.data
        monto, metodo = d.get('monto'), d.get('metodo')
        if isinstance(monto, bool) or not isinstance(monto, int) or monto <= 0:
            return _error('El monto debe ser un número entero de pesos mayor que cero.')
        if metodo not in PagoCliente.Metodo.values:
            return _error('Elige un método de pago válido.')
        try:
            fecha = date.fromisoformat(str(d.get('fecha')))
        except ValueError:
            return _error('Indica la fecha del pago.')
        referencia = str(d.get('referencia') or '').strip()[:100]
        if fecha > timezone.localdate():
            return _error('La fecha del pago no puede ser futura.')
        with transaction.atomic():
            f = FacturaDTE.objects.select_for_update().filter(orden_id=id_orden, estado_sii=FacturaDTE.EstadoSII.ACEPTADO).first()
            if f is None:
                return _error('Esa orden no tiene una factura aceptada.', 404, 'not_found')
            if f.estado_cobro == FacturaDTE.EstadoCobro.PAGADA:
                return _error('La factura ya está pagada.', 409, 'estado_invalido')
            if f.emitido_en and fecha < timezone.localtime(f.emitido_en).date():
                return _error('El pago no puede ser anterior a la emisión de la factura.')
            saldo = f.monto_total - _pagado(f)
            if monto > saldo:
                return _error(f'El monto excede el saldo pendiente de la factura (${saldo:,}).'.replace(',', '.'))
            PagoCliente.objects.create(factura=f, fecha=fecha, monto=monto, metodo=metodo, referencia=referencia, registrado_por=request.user)
            saldada = monto == saldo
            if saldada:
                f.estado_cobro, f.pagada_en = FacturaDTE.EstadoCobro.PAGADA, fecha
                f.save(update_fields=['estado_cobro', 'pagada_en', 'actualizado_en'])
                marcar_etapa(f.orden_id, flujo.PAGADA)
        try:  # el pago queda en el Log de Auditoría (si falla, el pago ya está registrado y no se deshace)
            Lote(request.user, ip_cliente(request)).insertar('auditoria', {
                'id': siguiente_id('auditoria'), 'entidad': 'FacturaDTE', 'entidad_id': f.orden_id, 'accion': 'REGISTRAR_PAGO' if not saldada else 'PAGAR_FACTURA',
                'anterior': {'saldo': saldo}, 'nuevo': {'monto': monto, 'metodo': metodo, 'fecha': fecha.isoformat(), 'estado_cobro': f.estado_cobro}})
        except Exception:
            logger.exception('cobranza_auditoria_error orden=%s', f.orden_id)
        f.refresh_from_db()
        return Response(fila_cobranza(f), status=201)
