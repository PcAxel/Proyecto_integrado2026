"""Reglas de negocio puras (espejo de src/domain/*.js). El servidor es la autoridad: nada de esto se confía al cliente."""
import math
import re
from decimal import ROUND_HALF_UP, Decimal

IVA_RATE = Decimal('0.19')
MARGEN_MINIMO = 20
TIPOS_OBRA = ['INSTALACION', 'MANTENCION', 'REPARACION', 'EMERGENCIA', 'GARANTIA']
TIPOS_SIN_PRESUPUESTO = ['EMERGENCIA', 'GARANTIA']
HORAS_MAX_DIA = 16
FOTOS_MIN = 2
KM_MAX_POR_HOJA = 1500


def redondear(x):
    """Redondeo comercial (mitad hacia arriba), igual que Math.round de JavaScript para valores positivos."""
    return int(Decimal(str(x)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def numero(v, defecto=0):
    if isinstance(v, bool) or not isinstance(v, (int, float, Decimal)) or (isinstance(v, float) and not math.isfinite(v)):
        return defecto
    return v


def es_numero(v):
    return not isinstance(v, bool) and isinstance(v, (int, float)) and math.isfinite(v)


# ───────── RUT ─────────
def digito_verificador(cuerpo):
    suma, mult = 0, 2
    for d in reversed(re.sub(r'\D', '', str(cuerpo))):
        suma += int(d) * mult
        mult = 2 if mult == 7 else mult + 1
    dv = 11 - (suma % 11)
    return '0' if dv == 11 else 'K' if dv == 10 else str(dv)


def validar_rut(rut):
    m = re.fullmatch(r'(\d{1,2}(?:\.?\d{3}){2})-([\dkK])', str(rut).strip())
    return bool(m) and digito_verificador(m.group(1)) == m.group(2).upper()


# ───────── Dinero ─────────
def calcular_neto(bruto, descuentos=()):
    neto = Decimal(str(bruto))
    for d in descuentos:
        neto *= 1 - Decimal(str(min(100, max(0, d)))) / 100
    return redondear(neto)


def desglosar_total(neto):
    iva = redondear(Decimal(neto) * IVA_RATE)
    return {'neto': neto, 'iva': iva, 'total': neto + iva}


def calcular_factura(items, descuentos):
    bruto = sum((it['cantidad'] or 0) * (it['precio_lista'] or 0) for it in items)
    acumulado = Decimal(str(bruto))
    for pct in [d for d in descuentos if d > 0]:
        acumulado -= Decimal(redondear(acumulado * Decimal(str(min(100, max(0, pct)))) / 100))
    neto = redondear(acumulado)
    return {'bruto': bruto, **desglosar_total(neto)}


# ───────── Rentabilidad ─────────
def simular_rentabilidad(p):
    materiales = sum(numero(m.get('cantidad')) * numero(m.get('costo_unitario')) for m in p.get('materiales') or [])
    mano = sum(numero(m.get('horas')) * numero(m.get('costo_hora_hombre')) for m in p.get('mano_obra') or [])
    adicionales = sum(numero(m.get('monto')) for m in p.get('adicionales') or [])
    costo_total = redondear(materiales + mano + adicionales)
    venta = redondear(numero(p.get('precio_venta_neto')))
    margen_pct = round((venta - costo_total) / venta * 1000 + 1e-9) / 10 if venta > 0 else 0
    return {'costo_total': costo_total, 'venta_neto': venta, 'margen_pct': margen_pct, 'bajo_minimo': margen_pct < MARGEN_MINIMO}


# ───────── Checklist ─────────
CHECKLIST = [
    {'id': 'presion_psi', 'tipo': 'numero', 'min': 60, 'max': 140, 'tol': 0.1},
    {'id': 'amperaje_a', 'tipo': 'numero', 'min': 5, 'max': 45, 'tol': 0.1},
    {'id': 'fugas', 'tipo': 'opcion', 'opciones': {'SIN_FUGAS': 'OK', 'FUGA_MENOR': 'ALERTA', 'FUGA_MAYOR': 'CRITICO'}},
    {'id': 'temperatura_c', 'tipo': 'numero', 'min': -30, 'max': 8, 'tol': 0.1},
    {'id': 'limpieza', 'tipo': 'opcion', 'opciones': {'OK': 'OK', 'PARCIAL': 'ALERTA', 'DEFICIENTE': 'CRITICO'}},
]


def checklist_completo(valores):
    valores = valores or {}
    for d in CHECKLIST:
        v = valores.get(d['id'])
        if v in (None, ''):
            return False
        if d['tipo'] == 'opcion':
            if v not in d['opciones']:
                return False
        elif not es_numero(v):
            return False
    return True


# ───────── Geocerca ─────────
def haversine(lat1, lng1, lat2, lng2):
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ───────── Cierre de obra ─────────
def validar_cierre(obra, presupuesto, hojas, movimientos):
    """Los 6 requisitos de cierre. Tolera filas incompletas: faltar un dato cuenta como incumplimiento, nunca como error."""
    n = lambda fila, k: numero(fila.get(k))
    hojas_obra = [h for h in hojas if h.get('obra_id') == obra['id']]
    costean = [h for h in hojas_obra if h.get('estado') in ('ENVIADA', 'APROBADA')]
    pend_auditar = sum(1 for h in hojas_obra if h.get('estado') != 'APROBADA')
    horas = sum(n(h, 'horas_trabajadas') for h in costean)
    movs = [m for m in movimientos if m.get('obra_id') == obra['id']]
    costos_ok = all(n(m, 'costo_unitario') > 0 for m in movs) and all(n(h, 'costo_hora_hombre') > 0 for h in hojas_obra)
    checks = {
        'presupuesto': bool(presupuesto) and presupuesto.get('estado') == 'APROBADO',
        'horas': horas > 0,
        'hojas': bool(hojas_obra) and pend_auditar == 0,
        'sobrantes': obra.get('sobrantes_conciliados') is True,
        'sync': n(obra, 'pendientes_sync') == 0,
        'costos': costos_ok,
    }
    return checks, all(checks.values())
