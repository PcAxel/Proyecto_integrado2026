"""Cumplimiento laboral de los contratos a plazo fijo (Código del Trabajo de Chile, art. 159 N°4) y métricas de rotación.

Funciones puras sobre el historial de contratos de una persona: no escriben nada y siempre reciben la fecha de «hoy», así que
se pueden probar con cualquier calendario. Lo que la ley dice, y que este módulo vigila:

- Un contrato a plazo fijo dura como máximo un año (dos para gerentes y profesionales o técnicos titulados).
- La SEGUNDA renovación lo transforma en indefinido.
- Si la persona sigue trabajando después de la fecha de término, con conocimiento del empleador, pasa a indefinido.
- Quien prestó servicios discontinuos con MÁS DE DOS contratos a plazo, por DOCE MESES O MÁS dentro de QUINCE MESES contados
  desde la primera contratación, se presume contratado por duración indefinida.

Es una ayuda para planificar, no un dictamen: los casos límite deben revisarse con asesoría laboral.
"""
from dataclasses import dataclass
from datetime import date, timedelta

PLAZO_FIJO, INDEFINIDO, OBRA_FAENA = 'PLAZO_FIJO', 'INDEFINIDO', 'OBRA_FAENA'
VIGENTE, FINALIZADO, ALERTA_INDEFINIDO = 'VIGENTE', 'FINALIZADO', 'ALERTA_INDEFINIDO'
SIN_RIESGO, RIESGO_BAJO, RIESGO_ALTO, PASO_AUTOMATICO = 'SIN_RIESGO', 'RIESGO_BAJO', 'RIESGO_ALTO', 'PASO_AUTOMATICO_INDEFINIDO'
ORDEN_RIESGO = [SIN_RIESGO, RIESGO_BAJO, RIESGO_ALTO, PASO_AUTOMATICO]

MESES_VENTANA = 15            # ventana de la presunción legal
DIAS_TOPE_VENTANA = 365       # «doce meses o más»
MAX_CONTRATOS_VENTANA = 2     # «más de dos contratos a plazo»
DIAS_MAX_PLAZO_FIJO = 365     # duración máxima de un plazo fijo
DIAS_AVISO_CRITICO = 15       # aviso de vencimiento que pide la regla de negocio
DIAS_AVISO_PREVIO = 30        # primer aviso, para planificar con tiempo
DURACION_SUPUESTA = 90        # si no se indica término, se evalúa un plazo fijo de tres meses
HORIZONTE_BUSQUEDA = 500      # días hacia adelante en que se busca una fecha segura

CAUSALES_VOLUNTARIAS = {'RENUNCIA', 'MUTUO_ACUERDO'}
MOTIVO_TEXTO = {
    'MUTUO_ACUERDO': 'Mutuo acuerdo', 'RENUNCIA': 'Renuncia', 'VENCIMIENTO_PLAZO': 'Vencimiento del plazo',
    'CONCLUSION_TRABAJO': 'Conclusión del trabajo', 'CONDUCTA_INDEBIDA': 'Conducta indebida', 'NECESIDADES_EMPRESA': 'Necesidades de la empresa',
}
TIPO_TEXTO = {PLAZO_FIJO: 'Plazo fijo', INDEFINIDO: 'Indefinido', OBRA_FAENA: 'Obra o faena'}

ADVERTENCIA_RENOVACION = ('ADVERTENCIA LEGAL: Este trabajador ya cuenta con 1 renovación. Si se renueva por segunda vez o continúa trabajando '
                          'tras la fecha de término, pasará automáticamente a CONTRATO INDEFINIDO.')


@dataclass(frozen=True)
class Periodo:
    """Un contrato reducido a lo que importa para la ley. `termino` es None mientras la persona sigue trabajando."""
    id: int
    tipo: str
    inicio: date
    termino: date | None        # fecha pactada (o efectiva, si ya terminó)
    activo: bool
    renovaciones: int = 0
    motivo: str = ''
    sueldo: int = 0

    def fin_efectivo(self, hoy):
        """Último día trabajado: el término si ya acabó; hoy si sigue activo (aunque la fecha pactada haya pasado)."""
        return hoy if self.activo else (self.termino or hoy)

    def dias(self, hoy):
        return max((self.fin_efectivo(hoy) - self.inicio).days + 1, 0)


def meses_atras(d, meses):
    """La misma fecha `meses` antes (ajustando el día si ese mes es más corto)."""
    total = d.year * 12 + d.month - 1 - meses
    anio, mes = divmod(total, 12)
    mes += 1
    ultimo = (date(anio + (mes == 12), mes % 12 + 1, 1) - timedelta(days=1)).day
    return date(anio, mes, min(d.day, ultimo))


def _solape(p, desde, hasta, hoy):
    """Días del período dentro de [desde, hasta]."""
    ini, fin = max(p.inicio, desde), min(p.fin_efectivo(hoy), hasta)
    return max((fin - ini).days + 1, 0)


def periodo_de(c):
    """`Contrato` del ORM → `Periodo`."""
    fin = getattr(c, 'finiquito', None)
    return Periodo(id=c.pk, tipo=c.tipo_contrato or INDEFINIDO, inicio=c.fecha_inicio, termino=c.fecha_termino, activo=c.estado == 'ACTIVO',
                   renovaciones=c.numero_renovacion, motivo=c.motivo_termino or (fin.causal_despido if fin else ''), sueldo=int(c.sueldo_base))


# ───────────────────────── Tiempos ─────────────────────────
def tiempos(periodos, hoy):
    """Tiempo trabajado (histórico y en los últimos 15 meses) y días transcurridos desde el último término («laguna»)."""
    desde = meses_atras(hoy, MESES_VENTANA)
    activos = [p for p in periodos if p.activo]
    terminados = [p for p in periodos if not p.activo and p.termino]
    ultimo = max((p.termino for p in terminados), default=None)
    dias_total = sum(p.dias(hoy) for p in periodos)
    return {
        'dias_trabajados_total': dias_total,
        'meses_trabajados_total': round(dias_total / 30.4375, 1),
        'dias_trabajados_15_meses': sum(_solape(p, desde, hoy, hoy) for p in periodos),
        'contratos_total': len(periodos),
        'contratos_plazo_15_meses': sum(1 for p in periodos if p.tipo == PLAZO_FIJO and _solape(p, desde, hoy, hoy) > 0),
        'ventana_desde': desde.isoformat(),
        'fecha_ultimo_termino': ultimo.isoformat() if ultimo else None,
        # Con un contrato activo no hay laguna: está trabajando.
        'dias_desde_ultimo_termino': None if activos or not ultimo else max((hoy - ultimo).days, 0),
        'primer_ingreso': min((p.inicio for p in periodos), default=None) and min(p.inicio for p in periodos).isoformat(),
    }


def lagunas(periodos):
    """Días sin contrato entre un término y el inicio siguiente."""
    orden = sorted((p for p in periodos if p.termino or p.activo), key=lambda p: p.inicio)
    out = []
    for a, b in zip(orden, orden[1:]):
        if a.termino and b.inicio > a.termino:
            out.append({'desde': (a.termino + timedelta(days=1)).isoformat(), 'hasta': (b.inicio - timedelta(days=1)).isoformat(),
                        'dias': (b.inicio - a.termino).days - 1, 'entre': [a.id, b.id]})
    return out


# ───────────────────────── Contrato vigente ─────────────────────────
def evaluar_vigente(p, hoy):
    """Riesgo de un contrato ACTIVO de pasar a indefinido. Solo aplica al plazo fijo."""
    base = {'nivel': SIN_RIESGO, 'mensajes': [], 'dias_para_vencer': None, 'critica': False}
    if not p.activo or p.tipo != PLAZO_FIJO or not p.termino:
        return base
    restan = (p.termino - hoy).days
    base['dias_para_vencer'] = restan
    mensajes, nivel = [], SIN_RIESGO
    if restan < 0:
        nivel = PASO_AUTOMATICO
        mensajes.append(f'El plazo venció hace {-restan} día(s) y la persona sigue con contrato activo: al continuar trabajando tras la fecha de término, '
                        'el contrato pasa a ser INDEFINIDO. Regulariza hoy: finiquito por vencimiento del plazo o anexo de contrato indefinido.')
    if p.renovaciones >= 2:
        nivel = PASO_AUTOMATICO
        mensajes.append(f'Registra {p.renovaciones} renovaciones: la segunda renovación de un plazo fijo lo transforma en contrato INDEFINIDO.')
    duracion = (p.termino - p.inicio).days + 1
    if duracion > DIAS_MAX_PLAZO_FIJO and nivel != PASO_AUTOMATICO:
        nivel = RIESGO_ALTO
        mensajes.append(f'El plazo pactado suma {duracion} días: un plazo fijo no puede exceder un año (dos para gerentes y profesionales titulados).')
    if 0 <= restan <= DIAS_AVISO_CRITICO and p.renovaciones == 1 and nivel != PASO_AUTOMATICO:
        nivel = RIESGO_ALTO
        base['critica'] = True
        mensajes.insert(0, ADVERTENCIA_RENOVACION)
    elif 0 <= restan <= DIAS_AVISO_PREVIO and nivel == SIN_RIESGO:
        nivel = RIESGO_BAJO
        mensajes.append(f'Vence en {restan} día(s). ' + ('Ya tiene 1 renovación: la próxima lo dejaría indefinido.' if p.renovaciones == 1
                                                         else 'Aún admite una renovación a plazo fijo; decide con tiempo si renovar o finiquitar.'))
    base.update(nivel=nivel, mensajes=mensajes)
    return base


def estado_historial(p, hoy):
    if not p.activo:
        return FINALIZADO
    return ALERTA_INDEFINIDO if evaluar_vigente(p, hoy)['nivel'] in (RIESGO_ALTO, PASO_AUTOMATICO) else VIGENTE


# ───────────────────────── Recontratación (más de 2 contratos / 12 meses en 15) ─────────────────────────
def _ventana(periodos, inicio, hoy):
    """Contratos a plazo y días trabajados en los 15 meses anteriores a `inicio` (sin contar el día de inicio)."""
    desde, hasta = meses_atras(inicio, MESES_VENTANA), inicio - timedelta(days=1)
    plazo = [p for p in periodos if p.tipo == PLAZO_FIJO]
    en_ventana = [p for p in plazo if _solape(p, desde, hasta, hoy) > 0]
    return en_ventana, sum(_solape(p, desde, hasta, hoy) for p in plazo), desde


def evaluar_recontratacion(periodos, hoy, inicio=None, termino=None):
    """¿Qué pasa si hoy (o en `inicio`) se firma un NUEVO contrato a plazo fijo con esta persona?

    Sigue la regla de negocio pedida, que es más prudente que la ley: avisa si el nuevo contrato sería el tercero O si se llega a
    doce meses dentro de la ventana de quince. La presunción legal exige las DOS cosas a la vez; ese caso se marca como paso automático.
    Devuelve además cuántos días hay que esperar para que ninguna de las dos condiciones se cumpla.
    """
    inicio = max(inicio or hoy, hoy)
    duracion = min(((termino - inicio).days + 1) if termino and termino >= inicio else DURACION_SUPUESTA, DIAS_MAX_PLAZO_FIJO - 1)
    activo = next((p for p in periodos if p.activo), None)

    def medir(d):
        en_ventana, dias, desde = _ventana(periodos, d, hoy)
        supera_n = len(en_ventana) + 1 > MAX_CONTRATOS_VENTANA
        supera_d = dias + duracion >= DIAS_TOPE_VENTANA
        return en_ventana, dias, desde, supera_n, supera_d

    en_ventana, dias, desde, supera_n, supera_d = medir(inicio)
    fecha_segura, espera = inicio, 0
    if supera_n or supera_d:
        fecha_segura = None
        for k in range(1, HORIZONTE_BUSQUEDA + 1):
            d = inicio + timedelta(days=k)
            if not any(medir(d)[3:]):
                fecha_segura, espera = d, (d - hoy).days
                break
    nivel = PASO_AUTOMATICO if supera_n and supera_d else RIESGO_ALTO if supera_n or supera_d else SIN_RIESGO
    mensajes = []
    if activo:
        mensajes.append('La persona ya tiene un contrato activo: no corresponde uno nuevo, sino una renovación o un anexo.')
    if supera_n:
        mensajes.append(f'Sería su contrato a plazo N° {len(en_ventana) + 1} dentro de 15 meses: la ley admite hasta {MAX_CONTRATOS_VENTANA}.')
    if supera_d:
        mensajes.append(f'Acumularía {dias + duracion} días trabajados a plazo en 15 meses ({dias} ya trabajados + {duracion} del nuevo contrato): el límite es menos de 12 meses.')
    if nivel == PASO_AUTOMATICO:
        mensajes.insert(0, 'ALERTA DE CUMPLIMIENTO LABORAL: con este contrato se cumplen las dos condiciones de la presunción legal '
                           '(más de dos contratos a plazo y doce meses o más en quince meses): se presumirá CONTRATO INDEFINIDO.')
    elif nivel == RIESGO_ALTO:
        mensajes.insert(0, 'ALERTA DE CUMPLIMIENTO LABORAL: este contrato deja a la empresa al borde de la presunción de contrato indefinido (art. 159 N°4).')
    if nivel != SIN_RIESGO:
        mensajes.append(f'Para recontratar a plazo fijo sin riesgo hay que esperar {espera} día(s): desde el {fecha_segura:%d-%m-%Y}.' if fecha_segura
                        else f'No hay una fecha segura en los próximos {HORIZONTE_BUSQUEDA} días para un plazo fijo de {duracion} días; evalúa un contrato indefinido.')
    return {
        'nivel': nivel, 'mensajes': mensajes, 'tiene_contrato_activo': bool(activo),
        'fecha_inicio_evaluada': inicio.isoformat(), 'duracion_evaluada_dias': duracion,
        'ventana_desde': desde.isoformat(), 'contratos_plazo_en_ventana': len(en_ventana), 'dias_trabajados_en_ventana': dias,
        'dias_con_nuevo_contrato': dias + duracion, 'supera_contratos': supera_n, 'supera_meses': supera_d,
        'presuncion_legal': supera_n and supera_d,
        'dias_espera': espera if fecha_segura else None, 'fecha_segura': fecha_segura.isoformat() if fecha_segura else None,
    }


def peor(*niveles):
    return max(niveles, key=ORDEN_RIESGO.index)


# ───────────────────────── Rotación de personal ─────────────────────────
def _dotacion(periodos, d, hoy):
    return sum(1 for p in periodos if p.inicio <= d and (p.activo or (p.termino and p.termino >= d)))


def _mes_siguiente(d):
    return date(d.year + (d.month == 12), d.month % 12 + 1, 1)


def rotacion(personas, hoy, meses=12):
    """Métricas de rotación. `personas` = [{'id', 'nombre', 'cargo', 'periodos': [Periodo]}]. Una baja es un contrato terminado.

    Tasa de rotación = bajas del período / dotación promedio del período × 100 (dotación promedio = (inicio + fin) / 2).
    """
    todos = [(per, p) for per in personas for p in per['periodos']]
    periodos = [p for _, p in todos]
    bajas = [(per, p) for per, p in todos if not p.activo and p.termino and p.termino <= hoy]

    def tasa(n, dot):
        return round(n / dot * 100, 1) if dot else 0.0

    serie, ini = [], date(hoy.year, hoy.month, 1)
    for _ in range(meses - 1):
        ini = date(ini.year - (ini.month == 1), (ini.month - 2) % 12 + 1, 1)
    for _ in range(meses):
        fin = min(_mes_siguiente(ini) - timedelta(days=1), hoy)
        del_mes = [p for _, p in bajas if ini <= p.termino <= fin]
        dot = (_dotacion(periodos, ini, hoy) + _dotacion(periodos, fin, hoy)) / 2
        vol = sum(1 for p in del_mes if p.motivo in CAUSALES_VOLUNTARIAS)
        serie.append({'mes': ini.strftime('%Y-%m'), 'altas': sum(1 for p in periodos if ini <= p.inicio <= fin), 'bajas': len(del_mes),
                      'voluntarias': vol, 'involuntarias': len(del_mes) - vol, 'dotacion_promedio': round(dot, 1), 'tasa': tasa(len(del_mes), dot)})
        ini = _mes_siguiente(ini)

    desde = date.fromisoformat(serie[0]['mes'] + '-01')
    del_anio = [(per, p) for per, p in bajas if p.termino >= desde]
    dot_anual = sum(m['dotacion_promedio'] for m in serie) / len(serie) if serie else 0
    vol_anual = sum(1 for _, p in del_anio if p.motivo in CAUSALES_VOLUNTARIAS)
    por_cargo, por_motivo = {}, {}
    for per, p in del_anio:
        por_cargo[per['cargo']] = por_cargo.get(per['cargo'], 0) + 1
        por_motivo[p.motivo or 'SIN_REGISTRO'] = por_motivo.get(p.motivo or 'SIN_REGISTRO', 0) + 1
    activos = [p for p in periodos if p.activo]
    por_tipo = {t: sum(1 for p in activos if p.tipo == t) for t in (PLAZO_FIJO, INDEFINIDO, OBRA_FAENA)}
    terminados = [p for _, p in bajas]
    plazo_terminados = [p for p in terminados if p.tipo == PLAZO_FIJO]

    def promedio(ps):
        return round(sum(p.dias(hoy) for p in ps) / len(ps)) if ps else 0

    def pct(n):
        return round(n / len(activos) * 100, 1) if activos else 0.0

    mayor = max(por_cargo.items(), key=lambda kv: kv[1], default=None)
    # Supuesto explícito y conservador: reemplazar a una persona cuesta 1,5 sueldos base (selección, inducción y menor productividad inicial).
    costo = round(sum(p.sueldo for _, p in del_anio) * 1.5)
    return {
        'periodo': {'desde': desde.isoformat(), 'hasta': hoy.isoformat(), 'meses': meses},
        'dotacion_actual': len(activos), 'dotacion_promedio_anual': round(dot_anual, 1),
        'altas_anual': sum(m['altas'] for m in serie), 'bajas_anual': len(del_anio),
        'tasa_rotacion_anual': tasa(len(del_anio), dot_anual),
        'tasa_rotacion_mes_actual': serie[-1]['tasa'] if serie else 0.0,
        'tasa_rotacion_mensual_promedio': round(sum(m['tasa'] for m in serie) / len(serie), 1) if serie else 0.0,
        'rotacion_voluntaria': {'bajas': vol_anual, 'tasa': tasa(vol_anual, dot_anual)},
        'rotacion_involuntaria': {'bajas': len(del_anio) - vol_anual, 'tasa': tasa(len(del_anio) - vol_anual, dot_anual)},
        'bajas_por_motivo': [{'motivo': k, 'texto': MOTIVO_TEXTO.get(k, 'Sin registro'), 'bajas': v} for k, v in sorted(por_motivo.items(), key=lambda kv: -kv[1])],
        'bajas_por_cargo': [{'cargo': k, 'bajas': v} for k, v in sorted(por_cargo.items(), key=lambda kv: -kv[1])],
        'cargo_mayor_fuga': {'cargo': mayor[0], 'bajas': mayor[1]} if mayor else None,
        'duracion_promedio_contratos_dias': promedio(terminados),
        'duracion_promedio_plazo_fijo_dias': promedio(plazo_terminados),
        'dotacion_por_tipo': {t: {'personas': n, 'porcentaje': pct(n)} for t, n in por_tipo.items()},
        'costo_reemplazo_estimado': costo,
        'supuesto_costo': 'Estimación: 1,5 sueldos base por cada baja de los últimos 12 meses (selección, inducción y menor productividad inicial).',
        'serie_mensual': serie,
    }
