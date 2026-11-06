"""Catálogo de tablas del ERP: quién puede leer y escribir, qué es inmutable y qué ve cada rol.

Los permisos son acciones de la matriz (`permisos_generados.PERMISOS`, generada desde el frontend): el servidor
aplica la misma matriz que la interfaz. Para una tabla, basta tener *cualquiera* de las acciones listadas.
"""
from .permisos_generados import PERMISOS

# prefijo y ancho del id autogenerado (igual que el AutoField del modelo original)
TABLAS = {
    'clientes': dict(prefijo='CLI-', ancho=3, leer=['clientes.ver'], crear=['maestros.gestionar'], editar=['maestros.gestionar']),
    'proveedores': dict(prefijo='PRV-', ancho=3, leer=['proveedores.ver'], crear=['maestros.gestionar'], editar=['maestros.gestionar']),
    'articulos': dict(prefijo='ART-', ancho=3, leer=['bodega.ver', 'pwa.usar'], crear=['articulos.gestionar'], editar=['articulos.gestionar'],
                      costos=['costo_unitario']),
    'conteos': dict(prefijo='CNT-', ancho=4, leer=['bodega.ver'], crear=['conteo.registrar'], editar=['conteo.aprobar']),
    'lotes': dict(prefijo='LOT-', ancho=4, leer=['bodega.ver', 'pwa.usar'], crear=['cardex.crear'], editar=[]),
    'cardex': dict(prefijo='MOV-', ancho=6, leer=['bodega.ver'], crear=['cardex.crear', 'cardex.reversar', 'cardex.reingresar', 'compras.registrar', 'conteo.aprobar'],
                   editar=[], costos=['costo_unitario']),
    'facturas': dict(prefijo='FC-', ancho=4, leer=['compras.ver'], crear=['compras.registrar'], editar=[]),
    'notas_credito': dict(prefijo='NC-', ancho=4, leer=['compras.ver'], crear=['compras.registrar'], editar=[]),
    'presupuestos': dict(prefijo='PRE-', ancho=4, leer=['presupuestos.ver'], crear=['presupuestos.crear'], editar=['presupuestos.crear', 'presupuestos.aprobar']),
    'obras': dict(prefijo='OB-', ancho=4, leer=['obras.ver', 'pwa.usar'], crear=['obras.crear', 'obras.emergencia'],
                  editar=['obras.crear', 'obras.emergencia', 'obras.cerrar']),
    'hojas': dict(prefijo='HS-', ancho=4, leer=['terreno.ver', 'pwa.usar'], crear=['pwa.usar'], editar=['hojas.auditar']),
    'retiros': dict(prefijo='SR-', ancho=4, leer=['bodega.ver', 'pwa.usar'], crear=['pwa.usar'], editar=['cardex.crear']),
    'asistencia': dict(prefijo='ASI-', ancho=6, leer=['asistencia.ver', 'asistencia.marcar'], crear=['asistencia.marcar'], editar=[]),
    'personal': dict(prefijo='T-', ancho=2, leer=['personal.ver', 'obras.ver', 'pwa.usar', 'terreno.ver', 'bodega.ver'], crear=[], editar=['personal.editar']),
    'flota': dict(prefijo='VH-', ancho=2, leer=['personal.ver', 'pwa.usar'], crear=[], editar=['personal.editar']),
    'auditoria': dict(prefijo='LOG-', ancho=6, leer=['auditoria.ver'], crear=None, editar=[]),  # crear=None: cualquier usuario autenticado (el servidor sella el autor)
}

# Rol del backend → rol de la matriz de permisos del frontend (para mostrar y para el log de auditoría)
ROL_UI = {'ADMIN': 'ADMIN_GENERAL', 'FINANZAS': 'ADMINISTRACION', 'OPERACIONES': 'SUPERVISOR', 'TECNICO': 'TECNICO', 'RRHH': 'RRHH'}

# Tablas que solo admiten altas: un error se corrige con un contra-asiento, nunca se edita (P1, P2).
INMUTABLES = {'cardex', 'facturas', 'notas_credito', 'asistencia', 'auditoria', 'lotes'}
# Campos que nadie puede cambiar tras crear la fila
PROTEGIDOS = {'id', 'rut'}


def tiene(user, acciones):
    """¿El rol del usuario tiene alguna de las acciones? ADMIN no es comodín: manda la matriz."""
    return any(user.role in PERMISOS.get(a, ()) for a in acciones)


def puede_leer(user, tabla):
    return tiene(user, TABLAS[tabla]['leer'])


def puede_crear(user, tabla):
    crear = TABLAS[tabla]['crear']
    return True if crear is None else tiene(user, crear)


def puede_editar(user, tabla):
    return tabla not in INMUTABLES and tiene(user, TABLAS[tabla]['editar'])


def ver_costos(user):
    return tiene(user, ['costos_compra.ver'])
