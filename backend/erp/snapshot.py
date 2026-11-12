"""Instantánea de datos que un rol puede ver: el servidor filtra tablas, filas y campos sensibles."""
from accounts.models import CustomUser

from . import tablas
from .escritura import filas, ficha_de, uid
from .models import Registro


def _usuarios(user):
    detalle = tablas.tiene(user, ['usuarios.ver'])
    out = []
    for u in CustomUser.objects.order_by('pk'):
        fila = {'id': uid(u), 'nombre': u.full_name or u.email, 'rol': tablas.ROL_UI[u.role], 'cargo': u.get_role_display(), 'activo': u.is_active}
        if detalle:
            fila.update(email=u.email, rut='', debe_cambiar_password=False, creado_en=u.date_joined.strftime('%Y-%m-%dT%H:%M:%S'), creado_por='SISTEMA')
        out.append(fila)
    return out


def _filtrar_tecnico(user, tabla, rows):
    """Un técnico solo ve lo suyo: su ficha, sus obras, sus hojas, retiros y marcas, y los vehículos operativos."""
    ficha = ficha_de(user)
    fid = ficha['id'] if ficha else None
    if tabla == 'personal':
        return [r for r in rows if r['id'] == fid]
    if tabla == 'obras':
        return [r for r in rows if fid in r.get('tecnicos', [])]
    if tabla in ('hojas', 'retiros', 'asistencia'):
        return [r for r in rows if r.get('tecnico_id') == fid]
    if tabla == 'flota':
        sin_gestion = ('ultima_revision', 'vencimiento_revision', 'vencimiento_permiso', 'vencimiento_seguro')
        return [{k: v for k, v in r.items() if k not in sin_gestion} for r in rows if r.get('activo') and r.get('estado') == 'ACTIVO']
    return rows


# Campos que solo viajan al navegador si el rol tiene alguna de estas acciones. El resto de los roles ni siquiera los recibe:
# ocultar un dato en pantalla no es protegerlo, porque sigue en la memoria del navegador.
CAMPOS_SENSIBLES = {
    'personal': {
        'rut': ['personal.ver'], 'fecha_ingreso': ['personal.ver'], 'vencimiento_licencia': ['personal.ver'],
        'costo_hora_hombre': ['personal.ver', 'costos.ver'],
    },
    'hojas': {'costo_hora_hombre': ['costos.ver']},
    'flota': {'ultima_revision': ['personal.ver'], 'vencimiento_revision': ['personal.ver'], 'vencimiento_permiso': ['personal.ver'], 'vencimiento_seguro': ['personal.ver']},
    'obras': {},
}


def _sin_campos_sensibles(user, tabla, rows):
    ocultar = {c for c, acciones in CAMPOS_SENSIBLES.get(tabla, {}).items() if not tablas.tiene(user, acciones)}
    if not ocultar:
        return rows
    return [{k: v for k, v in r.items() if k not in ocultar} for r in rows]


def tabla_para(user, tabla):
    """Filas de UNA tabla tal como las vería este usuario: misma regla de lectura, de técnico, de costos y de campos sensibles que el snapshot.
    Es la única puerta de lectura que usan los reportes de la IA: ninguna consulta propia se salta los permisos."""
    if not tablas.puede_leer(user, tabla):
        return []
    rows = filas(tabla)
    if user.role == 'TECNICO':
        rows = _filtrar_tecnico(user, tabla, rows)
    if not tablas.ver_costos(user):
        for campo in tablas.TABLAS[tabla].get('costos', ()):
            rows = [{k: v for k, v in r.items() if k != campo} for r in rows]
    return _sin_campos_sensibles(user, tabla, rows)


def construir(user):
    snap = {'usuarios': _usuarios(user)}
    # Cantidad REAL de filas por tabla, también de las que este rol no puede leer: el cliente la necesita para proponer el
    # siguiente id (p. ej. un técnico no ve la auditoría, pero cada acción suya escribe una fila allí).
    snap['_contadores'] = {t: Registro.objects.filter(tabla=t).count() for t in tablas.TABLAS}
    for tabla in tablas.TABLAS:
        snap[tabla] = tabla_para(user, tabla)
    return snap
