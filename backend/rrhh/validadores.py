"""RUT chileno: normalización y validación del dígito verificador (módulo 11)."""
import re

from django.core.exceptions import ValidationError

_PERMITIDOS = re.compile(r'^[0-9.\-\sKk]+$')


def normalizar_rut(texto):
    """'12.345.678-5' → '12345678-5' (sin puntos, DV en mayúscula). Devuelve '' si no hay nada que normalizar."""
    limpio = re.sub(r'[^0-9Kk]', '', str(texto or ''))
    if len(limpio) < 2:
        return ''
    cuerpo, dv = limpio[:-1].lstrip('0'), limpio[-1].upper()
    return f'{cuerpo}-{dv}' if cuerpo else ''


def digito_verificador(cuerpo):
    """Módulo 11: se multiplican los dígitos, de derecha a izquierda, por la serie 2,3,4,5,6,7,2,3… y se resta de 11 el resto."""
    suma, factor = 0, 2
    for d in reversed(str(cuerpo)):
        suma += int(d) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - suma % 11
    return '0' if resto == 11 else 'K' if resto == 10 else str(resto)


def validar_rut(valor):
    """Validador de Django/DRF. Acepta con o sin puntos y guion; exige 7 u 8 dígitos y el DV correcto."""
    if not isinstance(valor, str) or not _PERMITIDOS.match(valor.strip()):
        raise ValidationError('El RUT solo puede tener números, puntos, guion y la letra K.', code='rut_formato')
    rut = normalizar_rut(valor)
    cuerpo, _, dv = rut.partition('-')
    if not (7 <= len(cuerpo) <= 8) or not cuerpo.isdigit():
        raise ValidationError('El RUT debe tener 7 u 8 dígitos antes del guion.', code='rut_largo')
    if digito_verificador(cuerpo) != dv:
        raise ValidationError('El dígito verificador del RUT no es correcto.', code='rut_dv')
    return rut
