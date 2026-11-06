"""Reglas del reloj control (espejo de src/domain/asistencia.js, que sigue siendo la referencia de negocio)."""
from datetime import time

INICIO_JORNADA = time(8, 0)
TOLERANCIA_MIN = 15
HORA_LIMITE_AUSENTE = time(10, 0)

ENTRADA, SALIDA = 'ENTRADA', 'SALIDA'


def _min(t):
    return t.hour * 60 + t.minute


def validar_marca(tipo, marcas_dia):
    """None si es válida; si no, el mensaje de error. `marcas_dia` ya viene en orden cronológico."""
    ultima = marcas_dia[-1] if marcas_dia else None
    if tipo == ENTRADA and ultima and ultima.tipo == ENTRADA:
        return 'Acción inválida: Ya registraste tu entrada. Debes marcar salida.'
    if tipo == SALIDA and not ultima:
        return 'Acción inválida: Aún no registras tu entrada. Debes marcar entrada.'
    if tipo == SALIDA and ultima.tipo == SALIDA:
        return 'Acción inválida: Ya registraste tu salida. Debes marcar entrada.'
    return None


def llego_tarde(hora_entrada):
    return _min(hora_entrada) > _min(INICIO_JORNADA) + TOLERANCIA_MIN


def estado_del_dia(marcas_dia, hora_actual):
    if marcas_dia:
        return 'EN_JORNADA' if marcas_dia[-1].tipo == ENTRADA else 'FINALIZADA'
    return 'AUSENTE' if _min(hora_actual) >= _min(HORA_LIMITE_AUSENTE) else 'PENDIENTE'


def horas_trabajadas(marcas_dia, hora_actual):
    minutos, abierta = 0, None
    for m in marcas_dia:
        h = _min(m.fecha_local.time())
        if m.tipo == ENTRADA:
            abierta = h
        elif abierta is not None:
            minutos += h - abierta
            abierta = None
    if abierta is not None:
        minutos += max(0, _min(hora_actual) - abierta)
    return round(minutos / 60, 1)
