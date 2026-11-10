"""Reglas de la flota, compartidas por la API REST y por el motor del ERP (hoja de servicio, taller)."""
import re
from datetime import date

from django.db import transaction
from django.utils import timezone

from .models import DocumentoVehiculo, LecturaOdometro, Vehiculo

DIAS_POR_VENCER = 30
PATENTE = re.compile(r'^([A-Z]{2}\d{4}|[A-Z]{4}\d{2})$')  # formato antiguo (AB-1234) y vigente (ABCD-12)
KM_MAXIMO = 2_000_000


class FlotaError(Exception):
    """Regla de negocio de la flota incumplida; el mensaje se muestra tal cual al usuario."""


def normalizar_patente(texto):
    """'abcd 12' → 'ABCD-12'. Lanza FlotaError si no tiene un formato de patente chilena."""
    limpia = re.sub(r'[^A-Za-z0-9]', '', str(texto or '')).upper()
    if not PATENTE.match(limpia):
        raise FlotaError('La patente no es válida. Ejemplos: ABCD-12 o AB-1234.')
    return f'{limpia[:-2]}-{limpia[-2:]}' if re.match(r'^[A-Z]{4}\d{2}$', limpia) else f'{limpia[:2]}-{limpia[2:]}'


def siguiente_codigo():
    """Siguiente id público del ERP: VH-01, VH-02…"""
    mayor = 0
    for c in Vehiculo.objects.values_list('codigo', flat=True):
        m = re.fullmatch(r'VH-(\d+)', c or '')
        if m:
            mayor = max(mayor, int(m.group(1)))
    return f'VH-{mayor + 1:02d}'


@transaction.atomic
def registrar_km(vehiculo, km, origen, usuario=None, referencia=''):
    """Registra una lectura del odómetro. El odómetro solo avanza: una lectura menor a la actual se rechaza (es un error de digitación
    o un intento de bajar el kilometraje). Una lectura igual a la actual no agrega nada. Devuelve la lectura, o None si no hubo cambio."""
    if isinstance(km, bool) or not isinstance(km, int) or not 0 <= km <= KM_MAXIMO:
        raise FlotaError('El kilometraje no es válido.')
    v = Vehiculo.objects.select_for_update().get(pk=vehiculo.pk)
    if km < v.kilometraje and origen != LecturaOdometro.Origen.INICIAL:
        raise FlotaError(f'El odómetro solo avanza: el último registro es {v.kilometraje:,} km.'.replace(',', '.'))
    if km == v.kilometraje and origen != LecturaOdometro.Origen.INICIAL:
        return None
    lectura = LecturaOdometro.objects.create(vehiculo=v, km=km, origen=origen, referencia=referencia, registrado_por=usuario)
    v.kilometraje = km
    v.save(update_fields=['kilometraje'])
    vehiculo.kilometraje = km
    return lectura


def vencimiento_vigente(vehiculo, tipo):
    """Documento más reciente de ese tipo (el de vencimiento más lejano), o None si nunca se registró."""
    docs = getattr(vehiculo, '_prefetched_objects_cache', {}).get('documentos')
    if docs is not None:
        return next((d for d in sorted(docs, key=lambda d: (d.fecha_vencimiento, d.id), reverse=True) if d.tipo == tipo), None)
    return vehiculo.documentos.filter(tipo=tipo).first()


def estado_vencimiento(fecha, hoy=None):
    """VIGENTE · POR_VENCER (30 días o menos) · VENCIDO · SIN_DATO."""
    if fecha is None:
        return 'SIN_DATO'
    dias = (fecha - (hoy or timezone.localdate())).days
    return 'VENCIDO' if dias < 0 else 'POR_VENCER' if dias <= DIAS_POR_VENCER else 'VIGENTE'


def registrar_documento(vehiculo, tipo, fecha_vencimiento, fecha_realizacion=None, referencia='', observacion='', usuario=None):
    if tipo not in DocumentoVehiculo.Tipo.values:
        raise FlotaError('Tipo de documento inválido.')
    if not isinstance(fecha_vencimiento, date):
        raise FlotaError('Indica la fecha de vencimiento.')
    if fecha_realizacion and fecha_vencimiento < fecha_realizacion:
        raise FlotaError('El vencimiento no puede ser anterior al día en que se hizo.')
    if fecha_realizacion and fecha_realizacion > timezone.localdate():
        raise FlotaError('La fecha en que se hizo no puede ser futura.')
    return DocumentoVehiculo.objects.create(vehiculo=vehiculo, tipo=tipo, fecha_vencimiento=fecha_vencimiento, fecha_realizacion=fecha_realizacion,
                                            referencia=referencia, observacion=observacion, registrado_por=usuario)


# ───────── Vista para el motor del ERP (misma forma que tenía la tabla `flota` en JSON) ─────────
def fila_erp(v, personal_por_usuario):
    """`personal_por_usuario`: {'U-004': 'T-01'}, para traducir la cuenta del técnico a su ficha del ERP."""
    from erp.escritura import uid
    rev = vencimiento_vigente(v, DocumentoVehiculo.Tipo.REVISION_TECNICA)
    per = vencimiento_vigente(v, DocumentoVehiculo.Tipo.PERMISO_CIRCULACION)
    seg = vencimiento_vigente(v, DocumentoVehiculo.Tipo.SEGURO)
    return {
        'id': v.codigo, 'patente': v.patente, 'marca': v.marca, 'modelo': v.modelo, 'anio': v.anio,
        'tecnico_id': personal_por_usuario.get(uid(v.tecnico)) if v.tecnico_id else None,
        'km_actual': v.kilometraje, 'estado': v.estado, 'activo': v.activo,
        'ultima_revision': rev.fecha_realizacion.isoformat() if rev and rev.fecha_realizacion else None,
        'vencimiento_revision': rev.fecha_vencimiento.isoformat() if rev else None,
        'vencimiento_permiso': per.fecha_vencimiento.isoformat() if per else None,
        'vencimiento_seguro': seg.fecha_vencimiento.isoformat() if seg else None,
    }
