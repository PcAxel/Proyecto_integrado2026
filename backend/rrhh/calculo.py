"""Cálculo del finiquito (Código del Trabajo, Chile). Función pura: el servidor es la única fuente de los montos."""
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

TOPE_ANIOS = 11  # art. 163: la indemnización por años de servicio se limita a 11 años
TOPE_UF = 90     # art. 172: la remuneración mensual base de cálculo se limita a 90 UF

# causal -> (referencia legal, ¿da indemnización por años de servicio?)
CAUSALES = {
    'MUTUO_ACUERDO': ('Art. 159 N°1 · Mutuo acuerdo', False),
    'RENUNCIA': ('Art. 159 N°2 · Renuncia del trabajador', False),
    'VENCIMIENTO_PLAZO': ('Art. 159 N°4 · Vencimiento del plazo', False),
    'CONCLUSION_TRABAJO': ('Art. 159 N°5 · Conclusión del trabajo o servicio', False),
    'CONDUCTA_INDEBIDA': ('Art. 160 · Conducta indebida o incumplimiento grave', False),
    'NECESIDADES_EMPRESA': ('Art. 161 · Necesidades de la empresa', True),
}


@dataclass(frozen=True)
class Montos:
    anios_servicio: int
    indemnizacion_anios: int
    indemnizacion_aviso: int
    vacaciones: int

    @property
    def indemnizacion(self):
        return self.indemnizacion_anios + self.indemnizacion_aviso

    @property
    def total(self):
        return self.indemnizacion + self.vacaciones


def _entero(x):
    return int(Decimal(x).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def anios_de_servicio(inicio: date, termino: date) -> int:
    """Años completos; una fracción superior a seis meses cuenta como un año más. Con tope legal de 11."""
    meses = (termino.year - inicio.year) * 12 + termino.month - inicio.month - (1 if termino.day < inicio.day else 0)
    meses = max(meses, 0)
    anios = meses // 12 + (1 if meses % 12 > 6 else 0)
    return min(anios, TOPE_ANIOS)


def calcular_finiquito(*, causal, sueldo_base, fecha_inicio, fecha_termino, dias_vacaciones_pendientes, aviso_previo_dado=True, valor_uf=None) -> Montos:
    if causal not in CAUSALES:
        raise ValueError('Causal desconocida')
    sueldo = Decimal(sueldo_base)
    base = min(sueldo, Decimal(valor_uf) * TOPE_UF) if valor_uf else sueldo
    anios, aviso = 0, 0
    if CAUSALES[causal][1]:
        anios = anios_de_servicio(fecha_inicio, fecha_termino)
        if not aviso_previo_dado:
            aviso = _entero(base)  # indemnización sustitutiva del aviso previo de 30 días
    vacaciones = _entero(sueldo / 30 * Decimal(dias_vacaciones_pendientes))
    return Montos(anios, _entero(base * anios), aviso, vacaciones)
