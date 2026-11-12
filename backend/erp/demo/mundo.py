"""Datos de demostración del ERP: catálogo grande, 16 técnicos con cuenta, clientes, presupuestos, obras (por hacer, en curso, hechas y cobradas),
hojas de servicio, bodega con retiros escaneables, flota con revisiones al día, por vencer y vencidas, y fichas y contratos de personal.

Todo es ficticio. Es determinista (semilla fija) y se escribe en UNA transacción: o queda todo o no queda nada. Convive con lo que ya exista:
los ids siguen después del último de cada tabla y no se repite ningún SKU. Escribe por `Registro.bulk_create`: el stock sale siempre de los
movimientos del cardex, que aquí se generan en orden cronológico y sin dejar nunca el stock bajo cero."""
import json
import os
import random
import secrets
import unicodedata
from datetime import date, datetime, time, timedelta
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import CustomUser, Role
from erp import dominio as dom
from erp import reglas, tablas
from erp.escritura import uid
from erp.models import Registro

from . import catalogo

SEMILLA = 20261112
OBJETIVO_ARTICULOS = 1000

STAFF = [  # correo, rol, nombre, apellido (las mismas cuentas que `seed_fyag`)
    ('admin@fyag.cl', Role.ADMIN, 'Alejandra', 'Soto'), ('finanzas@fyag.cl', Role.FINANZAS, 'Felipe', 'Rojas'),
    ('operaciones@fyag.cl', Role.OPERACIONES, 'Olga', 'Muñoz'), ('rrhh@fyag.cl', Role.RRHH, 'Rosa', 'Gómez'),
]
CLIENTES = [
    ('Frutícola Los Coihues SpA', 'Coihueco', 'Fruta de exportación'), ('Agroindustrial Ñiquén Ltda.', 'Ñiquén', 'Procesamiento de frutas'),
    ('Cecinas San Fabián SpA', 'San Fabián', 'Elaboración de cecinas'), ('Berries del Sur S.A.', 'Los Ángeles', 'Berries congelados'),
    ('Lácteos Pemuco Ltda.', 'Pemuco', 'Quesos y yogures'), ('Pesquera Bahía Azul SpA', 'Concepción', 'Productos del mar'),
    ('Carnes Cabrero Ltda.', 'Cabrero', 'Faenamiento de carne'), ('Hortalizas El Carmen SpA', 'El Carmen', 'Hortalizas frescas'),
    ('Cervecería Artesanal Chillán SpA', 'Chillán', 'Cerveza artesanal'), ('Supermercados Ñuble Ltda.', 'Chillán', 'Retail de alimentos'),
    ('Hospital Clínico Regional (servicios)', 'Chillán', 'Salud'), ('Frigorífico Río Itata S.A.', 'Quillón', 'Almacenaje en frío'),
    ('Panificadora Bulnes Ltda.', 'Bulnes', 'Panadería industrial'), ('Avícola Santa Clara SpA', 'San Carlos', 'Aves y huevos'),
    ('Arándanos Pinto SpA', 'Pinto', 'Arándanos frescos'), ('Distribuidora de Helados Sur Ltda.', 'Chillán Viejo', 'Helados'),
    ('Molinos del Centro S.A.', 'Yungay', 'Molienda'), ('Vinos de Secano Ltda.', 'Quillón', 'Viña y bodega'),
    ('Conservas Don Alfonso SpA', 'Cabrero', 'Conservas'), ('Colegio Técnico Agrícola Ñuble', 'San Carlos', 'Educación'),
    ('Mataderos Unidos Chillán Ltda.', 'Chillán', 'Faenamiento'), ('Pastas Nonna Rosa SpA', 'Chillán Viejo', 'Pastas frescas'),
]
PROVEEDORES = [
    ('Frío Industrial Concepción S.A.', 'Concepción', 'Marcela Arriagada', '30 días', [8, 4, 0]), ('Compresores y Partes del Sur Ltda.', 'Talcahuano', 'Iván Contreras', '45 días', [12, 5, 0]),
    ('Eléctrica y Control Biobío SpA', 'Los Ángeles', 'Paola Henríquez', '30 días', [10, 0, 0]), ('Importadora Termo Andes SpA', 'Santiago', 'Raúl Echeverría', '60 días', [15, 5, 2]),
    ('Paneles Frigoríficos del Sur Ltda.', 'Temuco', 'Constanza Vega', '45 días', [7, 3, 0]), ('Válvulas y Controles Chile S.A.', 'Santiago', 'Tomás Olivares', '30 días', [10, 5, 0]),
    ('Lubricantes Técnicos Ñuble SpA', 'Chillán', 'Ximena Bustos', 'Contado', [5, 0, 0]), ('Cables y Componentes Chillán Ltda.', 'Chillán', 'Gabriel Navarro', '30 días', [9, 3, 0]),
    ('Ferretería Industrial Los Aromos SpA', 'Chillán', 'Patricio Leal', '15 días', [6, 0, 0]),
]
COORDS = {'Chillán': (-36.6066, -72.1034), 'Chillán Viejo': (-36.6285, -72.1331), 'San Carlos': (-36.4246, -71.9573), 'Quillón': (-36.7467, -72.4694), 'Yungay': (-37.1167, -72.0167),
          'Bulnes': (-36.7427, -72.2993), 'Pinto': (-36.7, -71.8964), 'Coihueco': (-36.6228, -71.8333), 'El Carmen': (-36.8977, -72.0239), 'Los Ángeles': (-37.4697, -72.3537),
          'Concepción': (-36.8201, -73.0444), 'Cabrero': (-37.0378, -72.4032), 'Pemuco': (-36.9667, -72.1), 'Ñiquén': (-36.2897, -71.9), 'San Fabián': (-36.5528, -71.5589), 'Talcahuano': (-36.7167, -73.1167)}
TRABAJOS = {
    'INSTALACION': ['Instalación de cámara de frío', 'Montaje de túnel de congelado', 'Instalación de central de refrigeración', 'Montaje de sala de proceso refrigerada', 'Instalación de condensadora remota'],
    'MANTENCION': ['Mantención preventiva de cámaras', 'Mantención de central frigorífica', 'Revisión trimestral de equipos de frío', 'Limpieza y ajuste de evaporadores', 'Mantención de túnel de congelado'],
    'REPARACION': ['Reparación de compresor', 'Cambio de evaporador', 'Reparación de fuga de refrigerante', 'Recambio de controlador y sensores', 'Reparación de puerta frigorífica'],
    'EMERGENCIA': ['Emergencia: falla de compresor', 'Emergencia: pérdida de temperatura en cámara', 'Emergencia: fuga de amoníaco'],
    'GARANTIA': ['Garantía: ajuste de instalación', 'Garantía: cambio de válvula de expansión', 'Garantía: reemplazo de ventilador'],
}
MARCAS_VEHICULO = [('Toyota', 'Hilux 2.4 DX'), ('Toyota', 'Hilux 2.8 SR'), ('Nissan', 'NP300 Frontier'), ('Chevrolet', 'N400 Max'), ('Hyundai', 'H-1 Furgón'), ('Ford', 'Ranger XL'),
                   ('Mitsubishi', 'L200 Katana'), ('Peugeot', 'Partner Furgón'), ('Renault', 'Kangoo Express'), ('Fiat', 'Fiorino Cargo'), ('Mahindra', 'Pik Up'), ('JAC', 'T8 Pro')]


def _sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


def _rut(cuerpo):
    s = f'{cuerpo:,}'.replace(',', '.')
    return f'{s}-{dom.digito_verificador(cuerpo)}'


class Ids:
    """Siguiente id de una tabla (después del mayor que ya exista)."""

    def __init__(self, tabla):
        cfg = tablas.TABLAS[tabla]
        self.pre, self.ancho, self.n = cfg['prefijo'], cfg['ancho'], 0
        for rid in Registro.objects.filter(tabla=tabla).values_list('rid', flat=True):
            try:
                self.n = max(self.n, int(rid[len(self.pre):]))
            except ValueError:
                pass

    def __call__(self):
        self.n += 1
        return f'{self.pre}{str(self.n).zfill(self.ancho)}'


def _dt(d, h=8, m=0):
    return datetime.combine(d, time(h, m))


def _iso(x):
    return x.strftime('%Y-%m-%dT%H:%M:%S')


class Mundo:
    def __init__(self, salida=print, forzar_publico=False):
        self.out = salida
        self.rng = random.Random(SEMILLA)
        self.hoy = timezone.localdate()
        self.publico = not settings.DEBUG
        self.unica = os.getenv('FYAG_SEED_PASSWORD', '')
        if self.publico and self.unica and len(self.unica) < 12:
            raise ValueError('FYAG_SEED_PASSWORD debe tener al menos 12 caracteres.')
        self.claves = {}   # correo → contraseña generada (solo si no hay FYAG_SEED_PASSWORD)
        self.filas = []    # Registro por crear
        self.resumen = {}

    # ───────────── utilidades ─────────────
    def reg(self, tabla, rid, datos):
        self.filas.append(Registro(tabla=tabla, rid=rid, datos=datos))
        self.resumen[tabla] = self.resumen.get(tabla, 0) + 1

    def existentes(self, tabla):
        return [r.fila() for r in Registro.objects.filter(tabla=tabla)]

    def _clave(self, email):
        if not self.publico:
            return 'Tecnico-FYAG-2026'
        if self.unica:
            return self.unica
        return self.claves.setdefault(email, secrets.token_urlsafe(12))

    def _usuario(self, email, rol, nombre, apellido):
        u = CustomUser.objects.filter(email=email).first()
        if u:
            return u
        u = CustomUser.objects.create_user(email, self._clave(email), role=rol, first_name=nombre, last_name=apellido)
        u.is_staff = u.is_superuser = rol == Role.ADMIN
        u.save(update_fields=['is_staff', 'is_superuser'])
        self.resumen['usuarios'] = self.resumen.get('usuarios', 0) + 1
        return u

    # ───────────── pasos ─────────────
    def personas(self):
        self.staff = {e: self._usuario(e, r, n, a) for e, r, n, a in STAFF}
        self.operaciones, self.finanzas, self.admin = self.staff['operaciones@fyag.cl'], self.staff['finanzas@fyag.cl'], self.staff['admin@fyag.cl']
        base = json.loads((Path(__file__).resolve().parents[1] / 'seed_data.json').read_text(encoding='utf-8'))['personal']
        self.tecnicos = []  # [{'ficha': 'T-01', 'usuario': CustomUser, 'nombre', 'tarifa', ...}]
        ya = {r['id']: r for r in self.existentes('personal')}
        usados = set()
        for i, p in enumerate(base, 1):
            nombre, apellido = p['nombre'].split(' ', 1)
            email = 'tecnico@fyag.cl' if i == 1 else f'{_sin_tildes(nombre)}.{_sin_tildes(apellido).replace(" ", "")}@fyag.cl'
            u = self._usuario(email, Role.TECNICO, nombre, apellido)
            rut = p['rut'] if dom.validar_rut(p['rut']) and p['rut'] not in usados else _rut(14_000_000 + i * 233_447)
            usados.add(rut)
            datos = {k: v for k, v in p.items() if k != 'id'} | {'rut': rut, 'usuario_id': uid(u)}
            if p['id'] in ya:  # la ficha del ERP ya existía (sin cuenta): se le asigna la cuenta, sin tocar el resto
                reg = Registro.objects.get(tabla='personal', rid=p['id'])
                reg.datos = {**reg.datos, 'usuario_id': uid(u)}
                reg.save(update_fields=['datos', 'actualizado'])
                datos = reg.datos
            else:
                self.reg('personal', p['id'], datos)
            self.tecnicos.append({'ficha': p['id'], 'usuario': u, 'nombre': p['nombre'], 'tarifa': datos['costo_hora_hombre'], 'rut': datos['rut'],
                                  'ingreso': date.fromisoformat(datos['fecha_ingreso']), 'cargo': datos['cargo']})

    def rrhh(self):
        """Fichas y contratos: el personal de oficina con el demo de RR. HH. existente, y los 16 técnicos aquí."""
        from rrhh.demo import cargar_demo_rrhh
        from rrhh.models import Contrato, FichaTrabajador
        try:
            cargar_demo_rrhh()
        except Exception as e:  # el PDF de ejemplo usa el almacenamiento privado: si no está disponible no se detiene el resto
            self.out(f'  (RR. HH. de demostración omitido: {type(e).__name__})')
        rrhh_user = self.staff['rrhh@fyag.cl']
        tipos = ['PLAZO_FIJO' if i in (3, 8, 12) else 'OBRA_FAENA' if i in (5, 14) else 'INDEFINIDO' for i in range(16)]
        afps = list(FichaTrabajador.AFP.values)
        n_f = n_c = 0
        for i, t in enumerate(self.tecnicos):
            u = t['usuario']
            rut_ficha = t['rut'].replace('.', '')  # la ficha guarda el RUT sin puntos; el ERP lo muestra con puntos
            if not FichaTrabajador.objects.filter(usuario=u).exists() and not FichaTrabajador.objects.filter(rut=rut_ficha).exists():
                con_isapre = i % 3 == 0
                FichaTrabajador.objects.create(usuario=u, rut=rut_ficha, afp=afps[i % len(afps)], sistema_salud='ISAPRE' if con_isapre else 'FONASA',
                                               isapre='CONSALUD' if con_isapre else '', tipo_contrato=tipos[i], fecha_ingreso=t['ingreso'], actualizado_por=rrhh_user)
                n_f += 1
            if not Contrato.objects.filter(empleado=u).exists():
                inicio, termino = t['ingreso'], None
                if tipos[i] == 'PLAZO_FIJO':
                    inicio = self.hoy - timedelta(days=300)
                    termino = self.hoy + timedelta(days={3: 20, 8: -12, 12: 110}[i])  # uno por vencer, uno vencido y uno vigente
                elif tipos[i] == 'OBRA_FAENA':
                    inicio, termino = self.hoy - timedelta(days=120), self.hoy + timedelta(days=90)
                Contrato.objects.create(empleado=u, fecha_inicio=inicio, fecha_termino=termino, sueldo_base=int(round(t['tarifa'] * 110, -3)))
                n_c += 1
        self.resumen['fichas'], self.resumen['contratos'] = n_f, n_c

    def maestros(self):
        ids = Ids('clientes')
        self.clientes = self.existentes('clientes')
        for k, (razon, comuna, giro) in enumerate(CLIENTES):
            rid = ids()
            nombre_corto = _sin_tildes(razon.split()[0])
            fila = {'rut': _rut(76_000_000 + 211_319 * (k + 3)), 'razon_social': razon, 'giro': giro, 'comuna': comuna, 'contacto': self._persona(),
                    'telefono': f'+56 9 {self.rng.randint(5000, 9999)} {self.rng.randint(1000, 9999)}', 'email': f'contacto@{nombre_corto}.cl', 'activo': k % 11 != 10}
            self.reg('clientes', rid, fila)
            self.clientes.append({**fila, 'id': rid})
        ids = Ids('proveedores')
        self.proveedores = self.existentes('proveedores')
        for k, (razon, comuna, contacto, pago, desc) in enumerate(PROVEEDORES):
            rid = ids()
            fila = {'rut': _rut(77_000_000 + 187_303 * (k + 5)), 'razon_social': razon, 'comuna': comuna, 'contacto': contacto, 'condicion_pago': pago, 'descuentos_habituales': desc, 'activo': True}
            self.reg('proveedores', rid, fila)
            self.proveedores.append({**fila, 'id': rid})

    def _persona(self):
        return f"{self.rng.choice(['Andrea', 'Carlos', 'Marcela', 'Pedro', 'Valentina', 'Rodrigo', 'Camila', 'Héctor', 'Daniela', 'Sergio', 'Paula', 'Mauricio'])} {self.rng.choice(['Poblete', 'Araya', 'Fuentes', 'Montecinos', 'Riquelme', 'Sepúlveda', 'Gajardo', 'Valenzuela', 'Parada', 'Henríquez'])}"

    def articulos(self):
        self.articulos_ = self.existentes('articulos')
        faltan = max(0, OBJETIVO_ARTICULOS - len(self.articulos_))
        ids = Ids('articulos')
        for a in catalogo.generar(self.rng, {x['sku'] for x in self.articulos_}, faltan):
            rid = ids()
            prov = self.proveedores[a['indice_proveedor'] % len(self.proveedores)]
            fila = {'sku': a['sku'], 'nombre': a['nombre'], 'categoria': a['categoria'], 'unidad': a['unidad'], 'costo_unitario': a['costo_unitario'],
                    'stock_minimo': a['stock_minimo'], 'proveedor_id': prov['id'], 'activo': True}
            self.reg('articulos', rid, fila)
            self.articulos_.append({**fila, 'id': rid})
        self.art = {a['id']: a for a in self.articulos_}

    def _presupuesto(self, tipo, estado, fecha, cliente):
        rng = self.rng
        pool = [a for a in self.articulos_ if a['costo_unitario'] < 900_000 or tipo == 'INSTALACION']
        mats = [{'articulo_id': a['id'], 'cantidad': rng.randint(1, 12) if a['costo_unitario'] > 20_000 else rng.randint(5, 60), 'costo_unitario': a['costo_unitario']}
                for a in rng.sample(pool, rng.randint(4, 9))]
        horas = {'INSTALACION': (60, 220), 'MANTENCION': (8, 40), 'REPARACION': (12, 60), 'EMERGENCIA': (6, 30), 'GARANTIA': (4, 20)}[tipo]
        tarifa = rng.choice([9600, 9800, 10400, 11200])
        mano = [{'descripcion': d, 'horas': rng.randint(*horas) // k, 'costo_hora_hombre': tarifa} for k, d in enumerate(['Montaje y conexionado', 'Puesta en marcha'], 1)]
        mano = [m for m in mano if m['horas'] > 0]
        adic = [{'descripcion': d, 'monto': rng.choice([60_000, 120_000, 180_000, 260_000])} for d in rng.sample(['Flete y viáticos', 'Arriendo de grúa', 'Andamios', 'Certificación'], rng.randint(0, 2))]
        base = {'materiales': mats, 'mano_obra': mano, 'adicionales': adic}
        costo = dom.simular_rentabilidad({**base, 'precio_venta_neto': 1})['costo_total']
        margen = rng.uniform(0.22, 0.4) if estado == 'APROBADO' else rng.uniform(0.1, 0.4)
        venta = int(round(costo / (1 - margen), -3))
        return {'titulo': '', 'cliente_id': cliente['id'], 'tipo_obra': tipo, 'estado': estado, 'fecha': fecha.isoformat(), **base, 'precio_venta_neto': venta,
                'aprobado_por': uid(self.finanzas) if estado == 'APROBADO' else None}

    def obras(self):
        rng, hoy = self.rng, self.hoy
        id_pre, id_obra = Ids('presupuestos'), Ids('obras')
        clientes = [c for c in self.clientes if c.get('activo', True)]
        tipos = ['INSTALACION'] * 15 + ['MANTENCION'] * 15 + ['REPARACION'] * 10 + ['EMERGENCIA'] * 6 + ['GARANTIA'] * 6
        rng.shuffle(tipos)
        estados = ['FINALIZADA'] * 24 + ['EN_CURSO'] * 14 + ['PLANIFICADA'] * 14
        rng.shuffle(estados)
        self.obras_ = []
        n_cobradas = 0
        for k, (tipo, estado) in enumerate(zip(tipos, estados), 1):
            cli = rng.choice(clientes)
            titulo = f'{rng.choice(TRABAJOS[tipo])} – {cli["razon_social"].split(" S")[0].split(" L")[0]}'
            if estado == 'FINALIZADA':
                inicio = hoy - timedelta(days=rng.randint(45, 200))
                fin = inicio + timedelta(days=rng.randint(10, 40))
                cierre = fin
            elif estado == 'EN_CURSO':
                inicio = hoy - timedelta(days=rng.randint(3, 40))
                fin, cierre = hoy + timedelta(days=rng.randint(5, 35)), None
            else:
                inicio = hoy + timedelta(days=rng.randint(3, 60))
                fin, cierre = inicio + timedelta(days=rng.randint(7, 40)), None
            sin_pre = tipo in dom.TIPOS_SIN_PRESUPUESTO and rng.random() < 0.7
            pre_id, venta = None, 0
            if not sin_pre:
                pre = self._presupuesto(tipo, 'APROBADO', inicio - timedelta(days=rng.randint(8, 35)), cli)
                pre['titulo'] = titulo
                pre_id = id_pre()
                venta = pre['precio_venta_neto']
                self.reg('presupuestos', pre_id, pre)
            lat, lng = COORDS.get(cli['comuna'], COORDS['Chillán'])
            techs = rng.sample([t['ficha'] for t in self.tecnicos], rng.randint(2, 4))
            fila = {'nombre': titulo, 'cliente_id': cli['id'], 'tipo': tipo, 'estado': estado, 'presupuesto_id': pre_id, 'es_emergencia_sin_presupuesto': sin_pre,
                    'supervisor_id': uid(self.operaciones), 'tecnicos': techs,
                    'ubicacion': {'comuna': cli['comuna'], 'direccion': f'{rng.choice(["Camino a", "Ruta N-", "Av. Industrial", "Parcela", "Km"])} {rng.randint(1, 480)}',
                                  'lat': round(lat + rng.uniform(-0.01, 0.01), 5), 'lng': round(lng + rng.uniform(-0.01, 0.01), 5), 'radio_m': 150},
                    'fecha_inicio': inicio.isoformat(), 'fecha_fin_estimada': fin.isoformat(), 'fecha_cierre': cierre.isoformat() if cierre else None,
                    'sobrantes_conciliados': estado == 'FINALIZADA', 'pendientes_sync': 0 if estado != 'EN_CURSO' else rng.choice([0, 0, 1, 2])}
            if estado == 'FINALIZADA':  # el ERP no tiene módulo de cobranza: el estado de cobro queda como dato de la obra
                cobrado = n_cobradas < 16
                n_cobradas += cobrado
                total = round(venta * 1.19)
                fila['cobro'] = ({'estado': 'COBRADO', 'monto': total, 'fecha': min(hoy, cierre + timedelta(days=rng.randint(7, 45))).isoformat()} if cobrado
                                 else {'estado': 'PENDIENTE', 'monto': total, 'vence': (cierre + timedelta(days=30)).isoformat()})
            rid = id_obra()
            self.reg('obras', rid, fila)
            self.obras_.append({**fila, 'id': rid, '_inicio': inicio, '_cierre': cierre, '_fin': fin})
        # Presupuestos que no son de una obra: enviados, borradores, rechazados y aprobados que aún no empiezan.
        for estado, n in (('ENVIADO', 12), ('BORRADOR', 10), ('RECHAZADO', 8), ('APROBADO', 4)):
            for _ in range(n):
                tipo = rng.choice(['INSTALACION', 'MANTENCION', 'REPARACION', 'INSTALACION'])
                cli = rng.choice(clientes)
                p = self._presupuesto(tipo, estado, hoy - timedelta(days=rng.randint(1, 50)), cli)
                p['titulo'] = f'{rng.choice(TRABAJOS[tipo])} – {cli["razon_social"].split(" S")[0].split(" L")[0]}'
                if estado == 'RECHAZADO':
                    p['motivo_rechazo'] = rng.choice(['El cliente consiguió una oferta menor.', 'Se pospone el proyecto al próximo año.', 'El precio supera el presupuesto del cliente.'])
                self.reg('presupuestos', id_pre(), p)

    def hojas(self):
        rng, hoy = self.rng, self.hoy
        ids = Ids('hojas')
        por_ficha = {t['ficha']: t for t in self.tecnicos}
        self.vehiculo_de = {}  # ficha → código de vehículo (se completa en flota(); aquí se usa lo que ya exista)
        n = 0
        for o in self.obras_:
            if o['estado'] == 'PLANIFICADA':
                continue
            fin_hojas = min(o['_cierre'] or hoy, hoy)
            cuantas = rng.randint(3, 6) if o['estado'] == 'FINALIZADA' else rng.randint(1, 4)
            span = max((fin_hojas - o['_inicio']).days, 1)
            for _ in range(cuantas):
                dia = o['_inicio'] + timedelta(days=rng.randint(0, span))
                tec = por_ficha[rng.choice(o['tecnicos'])]
                estado = 'APROBADA' if o['estado'] == 'FINALIZADA' else rng.choice(['APROBADA', 'ENVIADA', 'ENVIADA', 'DEVUELTA'])
                ts = _dt(dia, 8, rng.randint(0, 40))
                lat, lng = o['ubicacion']['lat'], o['ubicacion']['lng']
                rid = ids()
                km0 = rng.randint(20_000, 150_000)
                fila = {'obra_id': o['id'], 'tecnico_id': tec['ficha'], 'fecha': _iso(_dt(dia, 17, rng.randint(0, 50))), 'estado': estado,
                        'horas_trabajadas': rng.randint(4, 10), 'costo_hora_hombre': tec['tarifa'],
                        'checklist_json': {'presion_psi': rng.randint(70, 130), 'amperaje_a': rng.randint(8, 40), 'fugas': rng.choice(['SIN_FUGAS'] * 5 + ['FUGA_MENOR']),
                                           'temperatura_c': rng.randint(-25, 4), 'limpieza': rng.choice(['OK'] * 4 + ['PARCIAL'])},
                        'materiales': [],
                        'fotos': [{'id': f'FT-{rid[3:]}-1', 'etiqueta': 'Antes', 'lat': lat, 'lng': lng, 'ts': _iso(ts)}, {'id': f'FT-{rid[3:]}-2', 'etiqueta': 'Después', 'lat': lat, 'lng': lng, 'ts': _iso(ts + timedelta(hours=8))}],
                        'gps': {'lat': lat, 'lng': lng}, 'firma_cliente': estado != 'ENVIADA' or rng.random() < 0.7,
                        'observaciones': rng.choice(['Trabajo sin novedades.', 'Se recomienda cambio de burlete en próxima visita.', 'Cliente conforme con la entrega.', 'Pendiente repuesto menor para la próxima visita.', 'Equipo operando dentro de rango.']),
                        'auditoria': None, 'vehiculo_id': None, 'km_salida': km0, 'km_regreso': km0 + rng.randint(20, 220)}
                if estado in ('APROBADA', 'DEVUELTA'):
                    fila['auditoria'] = {'usuario_id': uid(self.operaciones), 'fecha': _iso(_dt(dia + timedelta(days=1), 9, 30)),
                                         'observaciones': 'Conforme.' if estado == 'APROBADA' else 'Falta registrar la lectura de amperaje del segundo compresor.'}
                self.reg('hojas', rid, fila)
                n += 1

    def bodega(self):
        """Compras (apertura y reposiciones) y retiros por obra, simulados día a día para que el stock nunca baje de cero."""
        rng, hoy = self.rng, self.hoy
        movs0 = self.existentes('cardex')
        stock = {a['id']: sum(m['signo'] * m['cantidad'] for m in movs0 if m['articulo_id'] == a['id']) for a in self.articulos_}
        ids_f, ids_c, ids_r, ids_n = Ids('facturas'), Ids('cardex'), Ids('retiros'), Ids('notas_credito')
        numeros = {p['id']: set() for p in self.proveedores}
        for f in self.existentes('facturas'):
            numeros.setdefault(f['proveedor_id'], set()).add(f['numero'])
        movimientos, retiros, facturas = [], [], []
        seq = [0]

        def mov(t, **kw):
            seq[0] += 1
            movimientos.append({'_t': t, '_seq': seq[0], **kw})
            return seq[0]

        def comprar(dia, prov, lineas):
            desc = prov.get('descuentos_habituales') or [0, 0, 0]
            factor = 1.0
            for d in desc:
                factor *= 1 - d / 100
            items = [{'articulo_id': a['id'], 'cantidad': q, 'precio_lista': max(1, round(a['costo_unitario'] / factor))} for a, q in lineas]
            calc = dom.calcular_factura(items, desc)
            numero = str(rng.randint(10_000, 99_999))
            while numero in numeros[prov['id']]:
                numero = str(rng.randint(10_000, 99_999))
            numeros[prov['id']].add(numero)
            fid = ids_f()
            facturas.append((fid, {'numero': numero, 'proveedor_id': prov['id'], 'fecha': dia.isoformat(), 'items': items, 'descuentos': desc, 'neto_bruto': calc['bruto'],
                                   'neto': calc['neto'], 'iva': calc['iva'], 'total': calc['total'], 'estado': 'REGISTRADA'}))
            for k, it in enumerate(items):
                mov(_dt(dia, 9, min(k, 59)), tipo=reglas.ENTRADA, articulo_id=it['articulo_id'], cantidad=it['cantidad'], costo_unitario=dom.calcular_neto(it['precio_lista'], desc),
                    signo=1, obra_id=None, usuario_id=uid(self.operaciones), referencia=fid, reversa_de=None, salida_origen_id=None)
                stock[it['articulo_id']] += it['cantidad']

        # 1) Apertura de inventario: una factura por proveedor y por tandas de 35 artículos, antes de la primera obra.
        dia0 = min(o['_inicio'] for o in self.obras_ if o['estado'] != 'PLANIFICADA') - timedelta(days=25)
        sin_stock = [a for a in self.articulos_ if stock[a['id']] == 0]
        por_prov = {}
        for a in sin_stock:
            por_prov.setdefault(a['proveedor_id'], []).append(a)
        prov_por_id = {p['id']: p for p in self.proveedores}
        for k, (pid, arts) in enumerate(sorted(por_prov.items())):
            for i in range(0, len(arts), 35):
                tanda = arts[i:i + 35]
                comprar(dia0 + timedelta(days=(k + i // 35) % 9), prov_por_id[pid],
                        [(a, int(a['stock_minimo'] * rng.choice([1.2, 2, 3, 4, 6]) + rng.randint(1, 6))) for a in tanda])

        # 2) Retiros: cada obra en curso o finalizada pide materiales varias veces; bodega los entrega, rechaza algunos y deja otros pendientes.
        pedidos = []
        for o in self.obras_:
            if o['estado'] == 'PLANIFICADA':
                continue
            tope = min(o['_cierre'] or hoy, hoy)
            span = max((tope - o['_inicio']).days, 1)
            for _ in range(rng.randint(2, 4) if o['estado'] == 'FINALIZADA' else rng.randint(1, 3)):
                dia = o['_inicio'] + timedelta(days=rng.randint(0, span))
                pedidos.append((_dt(dia, rng.randint(7, 16), rng.randint(0, 59)), o))
        pedidos.sort(key=lambda x: x[0])
        pool = [a for a in self.articulos_ if a['activo'] and a['costo_unitario'] < 700_000]
        salidas = {}
        for fecha, o in pedidos:
            resuelto = fecha + timedelta(hours=rng.randint(1, 20))
            rid = ids_r()
            items = {}
            for a in rng.sample(pool, rng.randint(2, 6)):
                items[a['id']] = rng.randint(1, 4) if a['costo_unitario'] > 20_000 else rng.randint(2, 30)
            tec = rng.choice(o['tecnicos'])
            reciente = fecha.date() >= hoy - timedelta(days=2)
            quien = rng.choice([self.operaciones, self.operaciones, self.admin])
            r = {'id': rid, 'obra_id': o['id'], 'tecnico_id': tec, 'fecha': _iso(fecha), 'estado': 'PENDIENTE', 'items': [{'articulo_id': k, 'cantidad': q} for k, q in items.items()],
                 'observaciones': rng.choice(['Para la línea de succión.', 'Reposición de consumibles.', 'Urgente: equipo detenido.', '', 'Para montaje de evaporadores.']),
                 'resuelto_por': None, 'resuelto_en': None, 'motivo_rechazo': None, 'movimientos': [], '_t': resuelto, '_quien': quien, '_items': items, '_obra': o}
            if not reciente:
                r['estado'] = 'RECHAZADA' if rng.random() < 0.08 else 'ENTREGADA'
            retiros.append(r)
        # Se procesan en orden cronológico junto con las reposiciones semanales.
        dia = dia0 + timedelta(days=10)
        cola = sorted(retiros, key=lambda r: r['_t'])
        i = 0
        while dia <= hoy:
            fin_dia = _dt(dia, 23, 59)
            while i < len(cola) and cola[i]['_t'] <= fin_dia:
                r = cola[i]
                i += 1
                if r['estado'] == 'PENDIENTE':
                    continue
                if r['estado'] == 'RECHAZADA':
                    r.update(resuelto_por=uid(r['_quien']), resuelto_en=_iso(r['_t']), motivo_rechazo=rng.choice(['Ya se entregó esa cantidad en un retiro anterior; ajusta la cantidad.', 'Falta aprobación del supervisor.', 'Artículo en revisión de calidad.']))
                    continue
                entregado = {}
                for aid, q in r['_items'].items():
                    q = min(q, int(stock[aid]))
                    if q > 0:
                        entregado[aid] = q
                if not entregado:
                    r.update(estado='RECHAZADA', resuelto_por=uid(r['_quien']), resuelto_en=_iso(r['_t']), motivo_rechazo='Sin stock disponible por ahora.')
                    continue
                keys = []
                for aid, q in entregado.items():
                    k = mov(r['_t'], tipo=reglas.SALIDA, articulo_id=aid, cantidad=q, costo_unitario=self.art[aid]['costo_unitario'], signo=-1, obra_id=r['obra_id'],
                            usuario_id=uid(r['_quien']), referencia=f"Retiro {r['id']}", reversa_de=None, salida_origen_id=None)
                    stock[aid] -= q
                    keys.append(k)
                    salidas.setdefault(r['obra_id'], []).append((k, aid, q, r['_t']))
                r.update(estado='ENTREGADA', resuelto_por=uid(r['_quien']), resuelto_en=_iso(r['_t']), items=[{'articulo_id': a, 'cantidad': q} for a, q in entregado.items()],
                         _keys=keys)
            if dia.weekday() == 0:  # cada lunes se reponen los artículos bajo su mínimo
                bajos = {}
                for a in self.articulos_:
                    if a['activo'] and stock[a['id']] < a['stock_minimo']:
                        bajos.setdefault(a['proveedor_id'], []).append(a)
                for pid, arts in bajos.items():
                    # Las últimas semanas no se repone: quedan artículos bajo su mínimo (pedido en camino) para que se vean las alertas de stock.
                    elegidos = [a for a in arts if rng.random() < 0.85] if dia <= hoy - timedelta(days=6) else []
                    if elegidos:
                        comprar(dia, prov_por_id[pid], [(a, int(a['stock_minimo'] * rng.choice([3, 4, 5])) + rng.randint(0, 5)) for a in elegidos[:30]])
            dia += timedelta(days=1)
        # 3) Sobrantes: de algunas obras terminadas vuelve una parte de lo retirado.
        for o in self.obras_:
            if o['estado'] != 'FINALIZADA' or o['id'] not in salidas or rng.random() > 0.5:
                continue
            k, aid, q, t = rng.choice(salidas[o['id']])
            if q >= 3:
                dev = max(1, q // 3)
                mov(_dt(o['_cierre'], 16, 0), tipo=reglas.REINGRESO, articulo_id=aid, cantidad=dev, costo_unitario=self.art[aid]['costo_unitario'], signo=1, obra_id=o['id'],
                    usuario_id=uid(self.operaciones), referencia='Sobrante de obra', reversa_de=None, salida_origen_id=k)
                stock[aid] += dev
        # Ids definitivos del cardex, en orden cronológico; las referencias por clave se traducen aquí.
        movimientos.sort(key=lambda m: (m['_t'], m['_seq']))
        id_de = {}
        for m in movimientos:
            id_de[m['_seq']] = ids_c()
        for m in movimientos:
            fila = {k: v for k, v in m.items() if k not in ('_t', '_seq')}
            fila['fecha'] = _iso(m['_t'])
            if fila.get('salida_origen_id'):
                fila['salida_origen_id'] = id_de[fila['salida_origen_id']]
                fila['referencia'] = f"Sobrante de {fila['salida_origen_id']}"
            self.reg('cardex', id_de[m['_seq']], fila)
        for r in retiros:
            fila = {k: v for k, v in r.items() if not k.startswith('_') and k != 'id'}
            fila['movimientos'] = [id_de[k] for k in r.get('_keys', [])]
            self.reg('retiros', r['id'], fila)
        for fid, f in facturas:
            self.reg('facturas', fid, f)
        # Algunas notas de crédito sobre facturas ya registradas.
        for fid, f in rng.sample(facturas, min(4, len(facturas))):
            neto = int(round(f['neto'] * rng.uniform(0.01, 0.04), -3)) or 1000
            self.reg('notas_credito', ids_n(), {'factura_id': fid, 'numero': str(rng.randint(1000, 9999)), 'fecha': f['fecha'], 'motivo': rng.choice(['Bonificación por retraso en la entrega', 'Devolución de mercadería dañada', 'Diferencia de precio facturado']),
                                                'neto': neto, 'iva': round(neto * 0.19), 'total': neto + round(neto * 0.19)})
        self.stock_final = stock

    def asistencia(self):
        rng, hoy = self.rng, self.hoy
        ids = Ids('asistencia')
        dias = []
        d = hoy - timedelta(days=1)
        while len(dias) < 7:
            if d.weekday() < 5:
                dias.append(d)
            d -= timedelta(days=1)
        en_curso = [o for o in self.obras_ if o['estado'] == 'EN_CURSO']
        for d in sorted(dias):
            for t in self.tecnicos:
                obra = next((o for o in en_curso if t['ficha'] in o['tecnicos']), None)
                lat, lng = (obra['ubicacion']['lat'], obra['ubicacion']['lng']) if obra else COORDS['Chillán']
                for tipo, h in (('ENTRADA', (7, 45)), ('SALIDA', (17, 30))):
                    f = _dt(d, h[0], h[1]) + timedelta(minutes=rng.randint(0, 40))
                    self.reg('asistencia', ids(), {'tecnico_id': t['ficha'], 'tipo': tipo, 'fecha': _iso(f), 'obra_id': obra['id'] if obra else None,
                                                   'lat': round(lat + rng.uniform(-0.0006, 0.0006), 6), 'lng': round(lng + rng.uniform(-0.0006, 0.0006), 6),
                                                   'gps_simulado': True, 'client_id': f'demo-{t["ficha"]}-{d.isoformat()}-{tipo}'})

    def flota(self):
        from flota import servicio
        from flota.models import DocumentoVehiculo, LecturaOdometro, Vehiculo
        rng, hoy = self.rng, self.hoy
        existentes = Vehiculo.objects.count()
        letras = 'BCDFGHJKLMNPRSTVWXYZ'
        patentes = set(Vehiculo.objects.values_list('patente', flat=True))
        con_vehiculo = {v.tecnico_id for v in Vehiculo.objects.exclude(tecnico=None)}
        libres = [t['usuario'] for t in self.tecnicos if t['usuario'].pk not in con_vehiculo]
        nuevos = max(0, 18 - existentes)
        estados_rev = ['vigente'] * 9 + ['por_vencer'] * 4 + ['vencida'] * 3 + ['sin']
        rng.shuffle(estados_rev)
        n_doc = 0
        for k in range(nuevos):
            while True:
                pat = ''.join(rng.choice(letras) for _ in range(4)) + f'-{rng.randint(10, 99)}'
                if pat not in patentes:
                    patentes.add(pat)
                    break
            marca, modelo = rng.choice(MARCAS_VEHICULO)
            dueño = libres.pop(0) if libres else None
            v = Vehiculo.objects.create(patente=pat, marca=marca, modelo=modelo, anio=rng.randint(2016, 2025), estado='EN_TALLER' if k % 9 == 8 else 'ACTIVO', tecnico=dueño)
            km = rng.randint(15_000, 190_000)
            servicio.registrar_km(v, km - rng.randint(8_000, 14_000), LecturaOdometro.Origen.INICIAL)
            for paso in range(3):
                servicio.registrar_km(v, v.kilometraje + rng.randint(1_500, 4_500), LecturaOdometro.Origen.MANUAL if paso else LecturaOdometro.Origen.HOJA_SERVICIO, usuario=self.staff['rrhh@fyag.cl'])
            for tipo, estados in (('REVISION_TECNICA', estados_rev), ('SEGURO', ['vigente'] * 14 + ['por_vencer'] * 3 + ['vencida']), ('PERMISO_CIRCULACION', ['vigente'] * 13 + ['por_vencer'] * 3 + ['vencida'] * 2)):
                estado = estados[k % len(estados)] if tipo == 'REVISION_TECNICA' else rng.choice(estados)
                if estado == 'sin':
                    continue
                vence = hoy + timedelta(days={'vigente': rng.randint(60, 330), 'por_vencer': rng.randint(3, 28), 'vencida': -rng.randint(3, 120)}[estado])
                for atras in range(rng.randint(1, 3)):  # historial: renovaciones anteriores, cada una un registro nuevo
                    venc = vence - timedelta(days=365 * atras)
                    DocumentoVehiculo.objects.create(vehiculo=v, tipo=tipo, fecha_realizacion=venc - timedelta(days=365 if tipo != 'REVISION_TECNICA' else 183 * rng.choice([2, 4])), fecha_vencimiento=venc,
                                                     referencia=f'{tipo[:3]}-{venc.year}-{rng.randint(1000, 9999)}', observacion='Dato de demostración', registrado_por=self.staff['rrhh@fyag.cl'])
                    n_doc += 1
        self.resumen['vehiculos'], self.resumen['documentos de vehículo'] = nuevos, n_doc

    # ───────────── orquestación ─────────────
    @transaction.atomic
    def poblar(self):
        if len([r for r in Registro.objects.filter(tabla='articulos')]) >= OBJETIVO_ARTICULOS * 0.9:
            self.out('La base ya tiene el catálogo completo: no se agrega nada (el comando es idempotente).')
            return False
        for paso in (self.personas, self.rrhh, self.maestros, self.articulos, self.obras, self.hojas, self.bodega, self.asistencia, self.flota):
            self.out(f'· {paso.__name__}…')
            paso()
        Registro.objects.bulk_create(self.filas, batch_size=500)
        return True
