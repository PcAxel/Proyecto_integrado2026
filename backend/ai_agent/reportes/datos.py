"""Extractores de datos seguros para los reportes. Solo lectura, por ORM, sin SQL crudo y siempre con el usuario que pide el reporte.

Cada extractor devuelve un `Conjunto`: título, columnas (clave, etiqueta, tipo) y filas ya planas. Los tipos son
'texto', 'clp' (pesos chilenos), 'num' y 'fecha'; los generadores deciden cómo dibujarlos en cada formato."""
import calendar
from dataclasses import dataclass, field
from datetime import date

from accounts.models import Role
from erp import snapshot, tablas

ESTADOS_PRESUPUESTO = {'BORRADOR': 'Borrador', 'PENDIENTE': 'Pendiente de aprobación', 'APROBADO': 'Aprobado', 'RECHAZADO': 'Rechazado'}
ESTADOS_OBRA = {'PLANIFICADA': 'Planificada', 'EN_CURSO': 'En curso', 'CERRADA': 'Cerrada'}
ESTADOS_VEHICULO = {'ACTIVO': 'Activo', 'EN_TALLER': 'En taller', 'INACTIVO': 'Inactivo'}


class SinPermiso(Exception):
    """El usuario no puede ver ese conjunto de datos (o su rol no genera reportes)."""


MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
ANIO_MIN, ANIO_MAX = 2000, 2100


class PeriodoInvalido(ValueError):
    """Los filtros de fecha que pidió el modelo no son válidos. El mensaje vuelve al modelo para que se lo aclare al usuario."""


@dataclass(frozen=True)
class Periodo:
    desde: date
    hasta: date
    etiqueta: str   # «octubre de 2026», «año 2025», «del 01-10-2026 al 31-10-2026»
    slug: str       # «202610», «2025», «20261001_20261031» (para el nombre del archivo)

    def contiene(self, iso):
        try:
            return self.desde <= date.fromisoformat(str(iso)[:10]) <= self.hasta
        except (TypeError, ValueError):
            return False  # sin fecha o con una fecha ilegible: queda fuera cuando se filtra


def _entero(v, nombre, minimo, maximo):
    if isinstance(v, bool) or v in (None, ''):
        raise PeriodoInvalido(f'«{nombre}» no es válido.')
    try:
        n = int(str(v).strip()) if not isinstance(v, int) else v
    except ValueError:
        raise PeriodoInvalido(f'«{nombre}» debe ser un número.')
    if not minimo <= n <= maximo:
        raise PeriodoInvalido(f'«{nombre}» debe estar entre {minimo} y {maximo}.')
    return n


def _fecha(v, nombre):
    try:
        return date.fromisoformat(str(v).strip())
    except ValueError:
        raise PeriodoInvalido(f'«{nombre}» debe tener el formato AAAA-MM-DD.')


def _dmy(d):
    return d.strftime('%d-%m-%Y')


def periodo_de(mes=None, anio=None, fecha_inicio=None, fecha_fin=None, hoy=None):
    """Convierte los filtros del modelo en un `Periodo` (o None si no pidió ninguno). Todo se valida aquí, nunca se confía en el modelo:
    - `mes` (1–12 o el nombre) con `anio`; si solo viene el mes, se asume el año en curso. Solo `anio` = el año completo.
    - `fecha_inicio` y/o `fecha_fin` (AAAA-MM-DD): rango abierto por el lado que falte. No se mezcla con mes/anio."""
    hoy = hoy or date.today()
    vacio = lambda v: v in (None, '')
    if all(vacio(v) for v in (mes, anio, fecha_inicio, fecha_fin)):
        return None
    if not (vacio(fecha_inicio) and vacio(fecha_fin)):
        if not (vacio(mes) and vacio(anio)):
            raise PeriodoInvalido('Indica mes y año, o un rango de fechas, pero no ambos.')
        desde = _fecha(fecha_inicio, 'fecha_inicio') if not vacio(fecha_inicio) else date(ANIO_MIN, 1, 1)
        hasta = _fecha(fecha_fin, 'fecha_fin') if not vacio(fecha_fin) else date(ANIO_MAX, 12, 31)
        if hasta < desde:
            raise PeriodoInvalido('«fecha_fin» no puede ser anterior a «fecha_inicio».')
        if vacio(fecha_fin):
            return Periodo(desde, hasta, f'desde el {_dmy(desde)}', f'desde_{desde:%Y%m%d}')
        if vacio(fecha_inicio):
            return Periodo(desde, hasta, f'hasta el {_dmy(hasta)}', f'hasta_{hasta:%Y%m%d}')
        return Periodo(desde, hasta, f'del {_dmy(desde)} al {_dmy(hasta)}', f'{desde:%Y%m%d}_{hasta:%Y%m%d}')
    if not vacio(mes):
        nombre = str(mes).strip().lower()
        m = MESES.index(nombre) + 1 if nombre in MESES else _entero(mes, 'mes', 1, 12)
        a = _entero(anio, 'anio', ANIO_MIN, ANIO_MAX) if not vacio(anio) else hoy.year
        return Periodo(date(a, m, 1), date(a, m, calendar.monthrange(a, m)[1]), f'{MESES[m - 1]} de {a}', f'{a}{m:02d}')
    a = _entero(anio, 'anio', ANIO_MIN, ANIO_MAX)
    return Periodo(date(a, 1, 1), date(a, 12, 31), f'año {a}', str(a))


def _en_periodo(filas, campo, periodo):
    """Filas cuyo `campo` (fecha ISO) cae en el período. Sin período no se toca nada."""
    return filas if periodo is None else [f for f in filas if periodo.contiene(f.get(campo))]


@dataclass
class Conjunto:
    clave: str
    titulo: str
    columnas: list                      # [(clave, etiqueta, tipo)]
    filas: list = field(default_factory=list)
    resumen: list = field(default_factory=list)   # [(etiqueta, valor, tipo)] mostrado sobre la tabla
    periodo: str = ''        # texto del filtro de fechas aplicado («octubre de 2026»); vacío = sin filtro
    periodo_slug: str = ''   # para el nombre del archivo
    subtitulo: str = ''      # reemplaza a «Todos los registros»/período bajo el título (p. ej. «Borrador generado automáticamente»)
    totales: bool = True     # fila final con la suma de los montos (columnas de tipo 'clp')
    firmas: list = field(default_factory=list)   # etiquetas de las firmas al pie («Solicitado por», «Aprobado por»); vacío = sin bloque de firmas
    nota: str = ''           # nota al pie de la tabla
    grafico: dict | None = None  # {'titulo','categoria': clave de columna,'series':[{'nombre','columna','color','punteada'}],'eje_y'}: se dibuja con las mismas filas


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


def get_resumen_presupuestos(user, periodo=None):
    """Filtra por la fecha del presupuesto."""
    _exigir(user, 'presupuestos')
    clientes = _por_id(user, 'clientes', 'razon_social')
    con_costos = tablas.ver_costos(user)
    columnas = [('id', 'N°', 'texto'), ('titulo', 'Título', 'texto'), ('cliente', 'Cliente', 'texto'), ('estado', 'Estado', 'texto'),
                ('fecha', 'Fecha', 'fecha'), ('venta', 'Precio de venta neto', 'clp')]
    if con_costos:
        columnas += [('costo', 'Costo estimado', 'clp'), ('margen', 'Margen', 'clp')]
    filas = []
    for p in sorted(_en_periodo(snapshot.tabla_para(user, 'presupuestos'), 'fecha', periodo), key=lambda r: r['id']):
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


def get_listado_personal(user, periodo=None):
    """Filtra por la fecha de ingreso (solo si el rol puede verla)."""
    _exigir(user, 'personal')
    filas_src = snapshot.tabla_para(user, 'personal')
    if periodo is not None:
        if not any('fecha_ingreso' in r for r in filas_src):
            raise PeriodoInvalido('Tu rol no ve la fecha de ingreso, así que el personal no se puede filtrar por fecha.')
        filas_src = _en_periodo(filas_src, 'fecha_ingreso', periodo)
    columnas = [('id', 'Código', 'texto'), ('nombre', 'Nombre', 'texto'), ('cargo', 'Cargo', 'texto'), ('activo', 'Estado', 'texto')]
    # Los campos sensibles solo existen en las filas si el rol puede verlos (snapshot ya filtró): se listan solo si llegaron.
    extra = [('rut', 'RUT', 'texto'), ('fecha_ingreso', 'Fecha de ingreso', 'fecha'), ('vencimiento_licencia', 'Vencimiento de licencia', 'fecha'),
             ('costo_hora_hombre', 'Costo hora hombre', 'clp')]
    columnas += [c for c in extra if any(c[0] in r for r in filas_src)]
    filas = [{**{c[0]: r.get(c[0]) for c in columnas}, 'activo': 'Activo' if r.get('activo') else 'Inactivo'} for r in sorted(filas_src, key=lambda r: r['id'])]
    resumen = [('Personas', len(filas), 'num'), ('Activas', sum(1 for f in filas if f['activo'] == 'Activo'), 'num')]
    return Conjunto('personal', 'Listado de personal', columnas, filas, resumen)


def get_listado_obras(user, periodo=None):
    """Filtra por la fecha de inicio de la obra."""
    _exigir(user, 'obras')
    clientes = _por_id(user, 'clientes', 'razon_social')
    columnas = [('id', 'N°', 'texto'), ('nombre', 'Obra', 'texto'), ('cliente', 'Cliente', 'texto'), ('tipo', 'Tipo', 'texto'), ('estado', 'Estado', 'texto'),
                ('fecha_inicio', 'Inicio', 'fecha'), ('fecha_fin_estimada', 'Término estimado', 'fecha'), ('presupuesto_id', 'Presupuesto', 'texto')]
    filas = [{'id': o['id'], 'nombre': o.get('nombre'), 'cliente': clientes.get(o.get('cliente_id'), o.get('cliente_id')),
              'tipo': str(o.get('tipo') or '').replace('_', ' ').capitalize(), 'estado': ESTADOS_OBRA.get(o.get('estado'), o.get('estado')),
              'fecha_inicio': o.get('fecha_inicio'), 'fecha_fin_estimada': o.get('fecha_fin_estimada'), 'presupuesto_id': o.get('presupuesto_id') or '—'}
             for o in sorted(_en_periodo(snapshot.tabla_para(user, 'obras'), 'fecha_inicio', periodo), key=lambda r: r['id'])]
    return Conjunto('obras', 'Listado de obras', columnas, filas, [('Obras', len(filas), 'num'), ('En curso', sum(1 for f in filas if f['estado'] == ESTADOS_OBRA['EN_CURSO']), 'num')])


def get_estado_flota(user, periodo=None):
    """Filtra por el vencimiento de la revisión técnica (solo si el rol ve los vencimientos)."""
    _exigir(user, 'flota')
    columnas = [('id', 'Código', 'texto'), ('patente', 'Patente', 'texto'), ('vehiculo', 'Vehículo', 'texto'), ('estado', 'Estado', 'texto'), ('km_actual', 'Kilometraje', 'num')]
    extra = [('vencimiento_revision', 'Revisión técnica vence', 'fecha'), ('vencimiento_permiso', 'Permiso de circulación vence', 'fecha'),
             ('vencimiento_seguro', 'Seguro vence', 'fecha')]
    src = [v for v in snapshot.tabla_para(user, 'flota') if v.get('activo', True)]
    if periodo is not None:
        if not any('vencimiento_revision' in r for r in src):
            raise PeriodoInvalido('Tu rol no ve los vencimientos, así que la flota no se puede filtrar por fecha.')
        src = _en_periodo(src, 'vencimiento_revision', periodo)
    columnas += [c for c in extra if any(c[0] in r for r in src)]
    filas = [{**{c[0]: v.get(c[0]) for c in columnas}, 'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} {v.get('anio') or ''}".strip(),
              'estado': ESTADOS_VEHICULO.get(v.get('estado'), v.get('estado'))} for v in sorted(src, key=lambda r: r['id'])]
    return Conjunto('flota', 'Estado de la flota', columnas, filas, [('Vehículos', len(filas), 'num'), ('En taller', sum(1 for f in filas if f['estado'] == ESTADOS_VEHICULO['EN_TALLER']), 'num')])


# Lista cerrada: lo único que el modelo puede pedir. Clave → (extractor, tabla del ERP que el usuario debe poder leer, descripción para el modelo).
CONJUNTOS = {
    'presupuestos': (get_resumen_presupuestos, 'presupuestos', 'presupuestos (filtra por la fecha del presupuesto): título, cliente, estado, fecha, precio de venta y, si el rol los ve, costo y margen'),
    'personal': (get_listado_personal, 'personal', 'personal (filtra por la fecha de ingreso): nombre, cargo y estado, más datos laborales si el rol los ve'),
    'obras': (get_listado_obras, 'obras', 'obras (filtra por la fecha de inicio): nombre, cliente, tipo, estado y fechas'),
    'flota': (get_estado_flota, 'flota', 'flota de vehículos (filtra por el vencimiento de la revisión técnica): patente, estado, kilometraje y vencimientos'),
}


def disponibles(user):
    """Claves de conjuntos que ESTE usuario puede pedir. Vacío para el Técnico."""
    if user.role == Role.TECNICO:
        return []
    return [k for k, (_, tabla, _) in CONJUNTOS.items() if tablas.puede_leer(user, tabla)]


def extraer(user, clave, periodo=None):
    """Extrae un conjunto con los permisos del usuario y, si se pidió, solo el período indicado."""
    if clave not in CONJUNTOS:
        raise SinPermiso('Ese conjunto de datos no existe.')
    c = CONJUNTOS[clave][0](user, periodo)
    if periodo is not None:
        c.periodo, c.periodo_slug = periodo.etiqueta, periodo.slug
        c.resumen.insert(0, ('Período', periodo.etiqueta, 'texto'))
    return c
