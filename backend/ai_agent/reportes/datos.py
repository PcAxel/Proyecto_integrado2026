"""Extractores de datos seguros para los reportes. Solo lectura, por ORM, sin SQL crudo y siempre con el usuario que pide el reporte.

Cada extractor devuelve un `Conjunto`: título, columnas (clave, etiqueta, tipo) y filas ya planas. Los tipos son
'texto', 'clp' (pesos chilenos), 'num' y 'fecha'; los generadores deciden cómo dibujarlos en cada formato."""
from dataclasses import dataclass, field

from accounts.models import Role
from erp import snapshot, tablas

ESTADOS_PRESUPUESTO = {'BORRADOR': 'Borrador', 'PENDIENTE': 'Pendiente de aprobación', 'APROBADO': 'Aprobado', 'RECHAZADO': 'Rechazado'}
ESTADOS_OBRA = {'PLANIFICADA': 'Planificada', 'EN_CURSO': 'En curso', 'CERRADA': 'Cerrada'}
ESTADOS_VEHICULO = {'ACTIVO': 'Activo', 'EN_TALLER': 'En taller', 'INACTIVO': 'Inactivo'}


class SinPermiso(Exception):
    """El usuario no puede ver ese conjunto de datos (o su rol no genera reportes)."""


@dataclass
class Conjunto:
    clave: str
    titulo: str
    columnas: list                      # [(clave, etiqueta, tipo)]
    filas: list = field(default_factory=list)
    resumen: list = field(default_factory=list)   # [(etiqueta, valor, tipo)] mostrado sobre la tabla


def _exigir(user, tabla):
    # El Técnico solo ve lo suyo en la app de terreno: los reportes de gestión no son para ese rol.
    if user.role == Role.TECNICO or not tablas.puede_leer(user, tabla):
        raise SinPermiso('Tu rol no tiene acceso a esos datos.')


def _por_id(user, tabla, campo):
    """{'CLI-001': 'Packing Cordillera S.A.'}: nombres legibles. Si el rol no ve esa tabla, queda el código."""
    return {r['id']: r.get(campo) or r['id'] for r in snapshot.tabla_para(user, tabla)}


def _costo_presupuesto(p):
    mat = sum((m.get('cantidad') or 0) * (m.get('costo_unitario') or 0) for m in p.get('materiales') or [])
    mo = sum((m.get('horas') or 0) * (m.get('costo_hora_hombre') or 0) for m in p.get('mano_obra') or [])
    return round(mat + mo + sum(a.get('monto') or 0 for a in p.get('adicionales') or []))


def get_resumen_presupuestos(user):
    _exigir(user, 'presupuestos')
    clientes = _por_id(user, 'clientes', 'razon_social')
    con_costos = tablas.ver_costos(user)
    columnas = [('id', 'N°', 'texto'), ('titulo', 'Título', 'texto'), ('cliente', 'Cliente', 'texto'), ('estado', 'Estado', 'texto'),
                ('fecha', 'Fecha', 'fecha'), ('venta', 'Precio de venta neto', 'clp')]
    if con_costos:
        columnas += [('costo', 'Costo estimado', 'clp'), ('margen', 'Margen', 'clp')]
    filas = []
    for p in sorted(snapshot.tabla_para(user, 'presupuestos'), key=lambda r: r['id']):
        venta = p.get('precio_venta_neto') or 0
        fila = {'id': p['id'], 'titulo': p.get('titulo'), 'cliente': clientes.get(p.get('cliente_id'), p.get('cliente_id')),
                'estado': ESTADOS_PRESUPUESTO.get(p.get('estado'), p.get('estado')), 'fecha': p.get('fecha'), 'venta': venta}
        if con_costos:
            costo = _costo_presupuesto(p)
            fila.update(costo=costo, margen=venta - costo)
        filas.append(fila)
    aprobados = [f for f in filas if f['estado'] == ESTADOS_PRESUPUESTO['APROBADO']]
    resumen = [('Presupuestos', len(filas), 'num'), ('Aprobados', len(aprobados), 'num'), ('Venta neta aprobada', sum(f['venta'] for f in aprobados), 'clp')]
    return Conjunto('presupuestos', 'Resumen de presupuestos', columnas, filas, resumen)


def get_listado_personal(user):
    _exigir(user, 'personal')
    filas_src = snapshot.tabla_para(user, 'personal')
    columnas = [('id', 'Código', 'texto'), ('nombre', 'Nombre', 'texto'), ('cargo', 'Cargo', 'texto'), ('activo', 'Estado', 'texto')]
    # Los campos sensibles solo existen en las filas si el rol puede verlos (snapshot ya filtró): se listan solo si llegaron.
    extra = [('rut', 'RUT', 'texto'), ('fecha_ingreso', 'Fecha de ingreso', 'fecha'), ('vencimiento_licencia', 'Vencimiento de licencia', 'fecha'),
             ('costo_hora_hombre', 'Costo hora hombre', 'clp')]
    columnas += [c for c in extra if any(c[0] in r for r in filas_src)]
    filas = [{**{c[0]: r.get(c[0]) for c in columnas}, 'activo': 'Activo' if r.get('activo') else 'Inactivo'} for r in sorted(filas_src, key=lambda r: r['id'])]
    resumen = [('Personas', len(filas), 'num'), ('Activas', sum(1 for f in filas if f['activo'] == 'Activo'), 'num')]
    return Conjunto('personal', 'Listado de personal', columnas, filas, resumen)


def get_listado_obras(user):
    _exigir(user, 'obras')
    clientes = _por_id(user, 'clientes', 'razon_social')
    columnas = [('id', 'N°', 'texto'), ('nombre', 'Obra', 'texto'), ('cliente', 'Cliente', 'texto'), ('tipo', 'Tipo', 'texto'), ('estado', 'Estado', 'texto'),
                ('fecha_inicio', 'Inicio', 'fecha'), ('fecha_fin_estimada', 'Término estimado', 'fecha'), ('presupuesto_id', 'Presupuesto', 'texto')]
    filas = [{'id': o['id'], 'nombre': o.get('nombre'), 'cliente': clientes.get(o.get('cliente_id'), o.get('cliente_id')),
              'tipo': str(o.get('tipo') or '').replace('_', ' ').capitalize(), 'estado': ESTADOS_OBRA.get(o.get('estado'), o.get('estado')),
              'fecha_inicio': o.get('fecha_inicio'), 'fecha_fin_estimada': o.get('fecha_fin_estimada'), 'presupuesto_id': o.get('presupuesto_id') or '—'}
             for o in sorted(snapshot.tabla_para(user, 'obras'), key=lambda r: r['id'])]
    return Conjunto('obras', 'Listado de obras', columnas, filas, [('Obras', len(filas), 'num'), ('En curso', sum(1 for f in filas if f['estado'] == ESTADOS_OBRA['EN_CURSO']), 'num')])


def get_estado_flota(user):
    _exigir(user, 'flota')
    columnas = [('id', 'Código', 'texto'), ('patente', 'Patente', 'texto'), ('vehiculo', 'Vehículo', 'texto'), ('estado', 'Estado', 'texto'), ('km_actual', 'Kilometraje', 'num')]
    extra = [('vencimiento_revision', 'Revisión técnica vence', 'fecha'), ('vencimiento_permiso', 'Permiso de circulación vence', 'fecha'),
             ('vencimiento_seguro', 'Seguro vence', 'fecha')]
    src = [v for v in snapshot.tabla_para(user, 'flota') if v.get('activo', True)]
    columnas += [c for c in extra if any(c[0] in r for r in src)]
    filas = [{**{c[0]: v.get(c[0]) for c in columnas}, 'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} {v.get('anio') or ''}".strip(),
              'estado': ESTADOS_VEHICULO.get(v.get('estado'), v.get('estado'))} for v in sorted(src, key=lambda r: r['id'])]
    return Conjunto('flota', 'Estado de la flota', columnas, filas, [('Vehículos', len(filas), 'num'), ('En taller', sum(1 for f in filas if f['estado'] == ESTADOS_VEHICULO['EN_TALLER']), 'num')])


# Lista cerrada: lo único que el modelo puede pedir. Clave → (extractor, tabla del ERP que el usuario debe poder leer, descripción para el modelo).
CONJUNTOS = {
    'presupuestos': (get_resumen_presupuestos, 'presupuestos', 'presupuestos: título, cliente, estado, fecha, precio de venta (y costo y margen si el rol los ve)'),
    'personal': (get_listado_personal, 'personal', 'personal: nombre, cargo y estado (más datos laborales si el rol los ve)'),
    'obras': (get_listado_obras, 'obras', 'obras: nombre, cliente, tipo, estado y fechas'),
    'flota': (get_estado_flota, 'flota', 'flota de vehículos: patente, estado, kilometraje y vencimientos'),
}


def disponibles(user):
    """Claves de conjuntos que ESTE usuario puede pedir. Vacío para el Técnico."""
    if user.role == Role.TECNICO:
        return []
    return [k for k, (_, tabla, _) in CONJUNTOS.items() if tablas.puede_leer(user, tabla)]


def extraer(user, clave):
    if clave not in CONJUNTOS:
        raise SinPermiso('Ese conjunto de datos no existe.')
    return CONJUNTOS[clave][0](user)
