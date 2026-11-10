"""Datos iniciales de desarrollo: un usuario por rol y una base limpia lista para trabajar.

Por defecto (base limpia) se carga solo lo que es "maestro": clientes, proveedores, artículos, presupuestos, obras y la
flota, más UNA ficha de personal: la del técnico real (tecnico@fyag.cl). Los registros operativos (asistencia, hojas de
servicio, retiros, movimientos de bodega, facturas, auditoría) NO se siembran: nacen desde la app. Con --demo se carga
además el dataset de ejemplo completo (16 técnicos con asistencia, historial de bodega, etc.).

Idempotente: se puede ejecutar varias veces sin duplicar. Nunca corre con DEBUG=False salvo --force.
Los usuarios nacen sin 2FA: en su primer ingreso ven el QR para vincular su autenticador.

Contraseñas: en desarrollo (DEBUG=True) son las conocidas de la lista de abajo. Con --force (servidor público) NO se usan: salen de
FYAG_SEED_PASSWORD, o se generan al azar y se muestran una sola vez, porque quien conozca la contraseña y entre primero
podría vincular SU autenticador a la cuenta.
"""
import json
import os
import secrets
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import CustomUser, Role
from erp import tablas
from erp.escritura import Lote, ahora, hoy, siguiente_id, uid
from erp.models import Registro

USUARIOS = [
    # correo, contraseña, rol, nombre, apellido
    ('admin@fyag.cl', 'Admin-FYAG-2026', Role.ADMIN, 'Alejandra', 'Soto'),
    ('finanzas@fyag.cl', 'Finanzas-FYAG-2026', Role.FINANZAS, 'Felipe', 'Rojas'),
    ('operaciones@fyag.cl', 'Operaciones-FYAG-2026', Role.OPERACIONES, 'Olga', 'Muñoz'),
    ('tecnico@fyag.cl', 'Tecnico-FYAG-2026', Role.TECNICO, 'Jorge', 'Quezada'),
    ('rrhh@fyag.cl', 'RRHH-FYAG-2026', Role.RRHH, 'Rosa', 'Gómez'),
]
# Ids de usuario del dataset original → usuario real que los reemplaza
USUARIO_ORIGINAL = {'U-001': 'admin@fyag.cl', 'U-002': 'finanzas@fyag.cl', 'U-003': 'operaciones@fyag.cl',
                    'U-004': 'operaciones@fyag.cl', 'U-005': 'tecnico@fyag.cl', 'U-006': 'admin@fyag.cl', 'U-007': 'rrhh@fyag.cl'}


def reemplazar(valor, mapa):
    """Reescribe, en todo el árbol JSON, los ids de usuario del dataset original."""
    if isinstance(valor, str):
        return mapa.get(valor, valor)
    if isinstance(valor, list):
        return [reemplazar(v, mapa) for v in valor]
    if isinstance(valor, dict):
        return {k: reemplazar(v, mapa) for k, v in valor.items()}
    return valor


# Registros que genera la operación diaria desde la app: no se siembran en la base limpia.
OPERATIVAS = {'asistencia', 'hojas', 'retiros', 'cardex', 'facturas', 'notas_credito', 'auditoria'}
FICHA_REAL = 'T-01'  # Jorge Quezada, el técnico real (tecnico@fyag.cl)


def depurar(datos):
    """Deja solo los datos maestros y la ficha del técnico real; lo operativo lo crea la app."""
    limpio = {t: f for t, f in datos.items() if t not in OPERATIVAS}
    limpio['personal'] = [p for p in datos['personal'] if p['id'] == FICHA_REAL]
    limpio['obras'] = [{**o, 'tecnicos': [t for t in o.get('tecnicos', []) if t == FICHA_REAL]} for o in datos['obras']]
    limpio['flota'] = [{**v, 'tecnico_id': v['tecnico_id'] if v['tecnico_id'] == FICHA_REAL else None} for v in datos['flota']]
    return limpio


# Stock de apertura (en base limpia): unidades por artículo. Se registra como una compra real (factura + entradas de bodega),
# no como un número suelto, porque el stock del sistema siempre se deriva de los movimientos. Algunos quedan a propósito
# bajo el mínimo o en cero para poder probar las alertas de reposición.
STOCK_APERTURA_ESPECIAL = {'REF-448A': 1, 'LUB-POE': 8, 'CMP-5HP': 0}


def abrir_inventario(operaciones):
    """Registra el inventario inicial como una factura de apertura por proveedor, con las reglas del servidor."""
    lote = Lote(operaciones, '127.0.0.1')
    articulos = [r.fila() for r in Registro.objects.filter(tabla='articulos')]
    por_proveedor = {}
    for a in articulos:
        cantidad = STOCK_APERTURA_ESPECIAL.get(a['sku'], int(a['stock_minimo']) * 3 + 5)
        if cantidad > 0:
            por_proveedor.setdefault(a['proveedor_id'], []).append((a, cantidad))
    movimientos = 0
    for proveedor, lineas in por_proveedor.items():
        fid = siguiente_id('facturas')
        items = [{'articulo_id': a['id'], 'cantidad': c, 'precio_lista': a['costo_unitario']} for a, c in lineas]
        lote.insertar('facturas', {'id': fid, 'numero': f'APERTURA-{proveedor}', 'proveedor_id': proveedor, 'fecha': hoy(),
                                   'items': items, 'descuentos': []})
        for it in items:
            lote.insertar('cardex', {'id': siguiente_id('cardex'), 'tipo': 'ENTRADA_COMPRA', 'fecha': ahora(), 'articulo_id': it['articulo_id'],
                                     'cantidad': it['cantidad'], 'costo_unitario': it['precio_lista'], 'signo': 1, 'obra_id': None,
                                     'referencia': fid, 'reversa_de': None, 'salida_origen_id': None})
            movimientos += 1
        lote.insertar('auditoria', {'id': siguiente_id('auditoria'), 'entidad': 'FacturaCompra', 'entidad_id': fid, 'accion': 'CREAR',
                                    'anterior': None, 'nuevo': {'apertura_inventario': True, 'items': len(items)}})
    return len(por_proveedor), movimientos


class Command(BaseCommand):
    help = 'Crea usuarios por rol y carga el dataset del ERP en la base de datos.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Permite ejecutar con DEBUG=False (no recomendado).')
        parser.add_argument('--demo', action='store_true', help='Carga también el historial y el personal de ejemplo.')
        parser.add_argument('--reiniciar', action='store_true', help='Borra y vuelve a cargar las tablas del ERP.')

    @transaction.atomic
    def _sembrar_flota(self, filas):
        """La flota vive en tablas relacionales (app `flota`), no como JSON. Idempotente: si ya hay vehículos no toca nada."""
        from datetime import date, timedelta

        from flota import servicio
        from flota.models import DocumentoVehiculo, LecturaOdometro, Vehiculo
        if Vehiculo.objects.exists():
            return 0
        usuario_de_ficha = {r.rid: r.datos.get('usuario_id') for r in Registro.objects.filter(tabla='personal')}
        n = 0
        for f in filas:
            uid_tec = usuario_de_ficha.get(f.get('tecnico_id'))
            v = Vehiculo.objects.create(
                codigo=f['id'], patente=f['patente'], marca=f['marca'], modelo=f['modelo'], estado=f['estado'], activo=f.get('activo', True),
                tecnico=CustomUser.objects.filter(pk=int(uid_tec[2:])).first() if uid_tec else None)
            if f.get('km_actual'):
                servicio.registrar_km(v, int(f['km_actual']), LecturaOdometro.Origen.INICIAL)
            for tipo, clave in (('REVISION_TECNICA', 'vencimiento_revision'), ('SEGURO', 'vencimiento_seguro'), ('PERMISO_CIRCULACION', 'vencimiento_permiso')):
                if f.get(clave):
                    vence = date.fromisoformat(f[clave])
                    DocumentoVehiculo.objects.create(vehiculo=v, tipo=tipo, fecha_vencimiento=vence, fecha_realizacion=vence - timedelta(days=365),
                                                     observacion='Dato de demostración')
            n += 1
        return n

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts['force']:
            raise CommandError('seed_fyag usa contraseñas conocidas: solo se ejecuta con DJANGO_DEBUG=True.')
        ahora = timezone.now()
        publico = not settings.DEBUG  # servidor accesible desde internet: nada de contraseñas conocidas
        unica = os.getenv('FYAG_SEED_PASSWORD', '')
        if publico and unica and len(unica) < 12:
            raise CommandError('FYAG_SEED_PASSWORD debe tener al menos 12 caracteres.')
        generadas = {}

        reales = {}
        for email, password, role, first, last in USUARIOS:
            if publico:
                password = unica or generadas.setdefault(email, secrets.token_urlsafe(12))
            u, _ = CustomUser.objects.get_or_create(email=email, defaults={'role': role})
            u.first_name, u.last_name, u.role, u.is_active = first, last, role, True
            u.is_staff = u.is_superuser = role == Role.ADMIN
            u.set_password(password)
            u.terms_accepted_at = u.terms_accepted_at or ahora
            u.terms_accepted_ip = u.terms_accepted_ip or '127.0.0.1'
            u.terms_version = u.terms_version or settings.TERMS_VERSION
            u.save()
            reales[email] = u
        mapa = {viejo: uid(reales[email]) for viejo, email in USUARIO_ORIGINAL.items()}

        if opts['reiniciar']:
            Registro.objects.filter(tabla__in=tablas.TABLAS).delete()
            from flota.models import DocumentoVehiculo, LecturaOdometro, Vehiculo
            for m in (LecturaOdometro, DocumentoVehiculo, Vehiculo):
                m.objects.all().delete()
        datos = json.loads((Path(__file__).resolve().parents[2].parent / 'erp' / 'seed_data.json').read_text(encoding='utf-8'))
        hoy = timezone.localdate().isoformat()
        creados = 0
        if not opts['demo']:
            datos = depurar(datos)
        for tabla, filas in datos.items():
            if tabla == 'flota':
                creados += self._sembrar_flota(reemplazar(filas, mapa))
                continue
            if Registro.objects.filter(tabla=tabla).exists():
                continue  # idempotente: no pisa datos ya cargados ni los que se hayan trabajado desde la app
            for fila in reemplazar(filas, mapa):
                rid = fila.pop('id')
                if tabla == 'asistencia':  # las marcas del seed son «de hoy»
                    fila['fecha'] = hoy + fila['fecha'][10:]
                    fila['client_id'] = f"seed-{fila['tecnico_id']}-{hoy}"
                    if fila['fecha'] > timezone.localtime().strftime('%Y-%m-%dT%H:%M:%S'):
                        continue
                Registro.objects.create(tabla=tabla, rid=rid, datos=fila)
                creados += 1

        if not opts['demo'] and Registro.objects.filter(tabla='articulos').exists() and not Registro.objects.filter(tabla='cardex').exists():
            facturas, movs = abrir_inventario(reales['operaciones@fyag.cl'])
            self.stdout.write(f'Inventario de apertura: {facturas} facturas y {movs} entradas de bodega.')
        if opts['demo']:
            from rrhh.demo import cargar_demo_rrhh
            n = cargar_demo_rrhh()
            self.stdout.write(f'RR. HH. de demostración: {n} registros (contratos, finiquitos y un anexo por firmar).' if n else 'RR. HH. de demostración: ya cargado.')
        self.stdout.write(self.style.SUCCESS(f'Semilla lista ({creados} registros nuevos).'))
        self.stdout.write('\nUsuarios de prueba (sin 2FA: el primer ingreso muestra el QR para vincular el autenticador):')
        for email, password, role, *_ in USUARIOS:
            if publico and unica:
                shown = '(la de FYAG_SEED_PASSWORD)'
            elif publico:
                shown = generadas[email]
            else:
                shown = password
            self.stdout.write(f'  {role:<12} {email:<22} {shown}')
        if publico and not unica:
            self.stdout.write(self.style.WARNING('Guarda estas contraseñas ahora: no se vuelven a mostrar.'))
