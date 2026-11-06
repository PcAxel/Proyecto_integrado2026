"""Reglas de negocio que el servidor hace cumplir al escribir (no confía en que el cliente las haya validado).

Espejo de las reglas puras del frontend (`src/domain/*.js`), que siguen siendo la referencia de negocio.
"""
from decimal import Decimal


class ReglaError(Exception):
    def __init__(self, mensaje, status=422, code='regla_negocio'):
        super().__init__(mensaje)
        self.mensaje, self.status, self.code = mensaje, status, code


def num(v):
    return Decimal(str(v)) if isinstance(v, (int, float, str, Decimal)) and not isinstance(v, bool) else Decimal('NaN')


# ───────────────────────── Cardex (libro inmutable) ─────────────────────────
ENTRADA, SALIDA, REVERSA, REINGRESO = 'ENTRADA_COMPRA', 'SALIDA_OBRA', 'REVERSA', 'REINGRESO_SOBRANTE'
AJUSTE = 'AJUSTE_CONTEO'  # contra-asiento de un conteo físico aprobado
SIGNO = {ENTRADA: 1, SALIDA: -1, REINGRESO: 1}


def stock(movs, articulo_id):
    return sum(m['signo'] * num(m['cantidad']) for m in movs if m['articulo_id'] == articulo_id)


def esta_reversado(movs, mov_id):
    return any(m['tipo'] == REVERSA and m.get('reversa_de') == mov_id for m in movs)


def cantidad_reingresable(movs, salida_id):
    salida = next((m for m in movs if m['id'] == salida_id), None)
    if not salida or salida['tipo'] != SALIDA or esta_reversado(movs, salida_id):
        return Decimal(0)
    devuelto = sum(num(m['cantidad']) for m in movs
                   if m['tipo'] == REINGRESO and m.get('salida_origen_id') == salida_id and not esta_reversado(movs, m['id']))
    return num(salida['cantidad']) - devuelto


def validar_movimiento(fila, movs, existe_obra, existe_articulo_activo):
    """Valida un movimiento nuevo contra el libro vigente. `movs` ya incluye los movimientos del mismo lote."""
    tipo = fila.get('tipo')
    cantidad, costo = num(fila.get('cantidad')), num(fila.get('costo_unitario'))
    if tipo not in (ENTRADA, SALIDA, REVERSA, REINGRESO):
        raise ReglaError('Tipo de movimiento no permitido.')
    if not cantidad > 0:
        raise ReglaError('La cantidad debe ser mayor que cero.')
    if not costo > 0:
        raise ReglaError('El costo unitario debe ser mayor que cero.')
    if not existe_articulo_activo(fila.get('articulo_id')):
        raise ReglaError('Artículo inexistente o inactivo.')
    if fila.get('signo') != (SIGNO.get(tipo) if tipo != REVERSA else fila.get('signo')):
        raise ReglaError('Signo del movimiento inconsistente.')

    if tipo == ENTRADA:
        if fila.get('obra_id'):
            raise ReglaError('Una entrada no se imputa a una obra.')
    elif tipo == SALIDA:
        if not fila.get('obra_id') or not existe_obra(fila['obra_id']):
            raise ReglaError('Una salida debe imputarse a una obra existente.')
        disponible = stock(movs, fila['articulo_id'])
        if cantidad > disponible:
            raise ReglaError(f'Stock insuficiente: disponible {disponible}, solicitado {cantidad}.')
    elif tipo == REVERSA:
        orig = next((m for m in movs if m['id'] == fila.get('reversa_de')), None)
        if not orig:
            raise ReglaError('Movimiento a reversar no encontrado.')
        if len((fila.get('referencia') or '').strip()) < 5:
            raise ReglaError('Debe indicar un motivo (mín. 5 caracteres).')
        if orig['tipo'] == REVERSA:
            raise ReglaError('Una reversa no puede reversarse.')
        if orig['tipo'] == AJUSTE:
            raise ReglaError('Un ajuste de conteo no se reversa: se corrige con un nuevo conteo.')
        if esta_reversado(movs, orig['id']):
            raise ReglaError('El movimiento ya fue reversado.')
        if orig['tipo'] == SALIDA and cantidad_reingresable(movs, orig['id']) != num(orig['cantidad']):
            raise ReglaError('La salida tiene reingresos activos; reverse primero los reingresos.')
        if (fila['signo'], fila['articulo_id'], cantidad) != (-orig['signo'], orig['articulo_id'], num(orig['cantidad'])):
            raise ReglaError('La reversa debe ser el contra-asiento exacto del movimiento original.')
        if stock(movs, orig['articulo_id']) - orig['signo'] * num(orig['cantidad']) < 0:
            raise ReglaError('La reversa dejaría el stock en negativo.')
    elif tipo == REINGRESO:
        salida = next((m for m in movs if m['id'] == fila.get('salida_origen_id')), None)
        if not salida or salida['tipo'] != SALIDA:
            raise ReglaError('Solo se puede reingresar sobrante de una salida a obra.')
        if esta_reversado(movs, salida['id']):
            raise ReglaError('La salida fue reversada.')
        maximo = cantidad_reingresable(movs, salida['id'])
        if cantidad > maximo:
            raise ReglaError(f'Solo es posible reingresar hasta {maximo} unidad(es).')
        if fila['articulo_id'] != salida['articulo_id']:
            raise ReglaError('El reingreso debe ser del mismo artículo.')


# ───────────────────────── Asistencia (reloj control) ─────────────────────────
def validar_marca(fila, marcas_dia):
    tipo = fila.get('tipo')
    if tipo not in ('ENTRADA', 'SALIDA'):
        raise ReglaError('Tipo de marca inválido.')
    ultima = marcas_dia[-1] if marcas_dia else None
    if tipo == 'ENTRADA' and ultima and ultima['tipo'] == 'ENTRADA':
        raise ReglaError('Acción inválida: Ya registraste tu entrada. Debes marcar salida.', 409, 'secuencia_marca')
    if tipo == 'SALIDA' and not ultima:
        raise ReglaError('Acción inválida: Aún no registras tu entrada. Debes marcar entrada.', 409, 'secuencia_marca')
    if tipo == 'SALIDA' and ultima['tipo'] == 'SALIDA':
        raise ReglaError('Acción inválida: Ya registraste tu salida. Debes marcar entrada.', 409, 'secuencia_marca')
    lat, lng = fila.get('lat'), fila.get('lng')
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ReglaError('No se pudo obtener la ubicación para marcar.')


def restante_lote(lote, movs):
    """Unidades que quedan de un lote: lo ingresado más el efecto de los movimientos que lo nombran (salidas restan)."""
    return num(lote['cantidad']) + sum(m['signo'] * num(m['cantidad']) for m in movs if m.get('lote_id') == lote['id'])
