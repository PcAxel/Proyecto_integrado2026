"""Escritura atómica por lotes: el servidor es la autoridad.

El cliente propone filas y cambios; aquí se validan permisos por rol, ids secuenciales, libros inmutables y reglas
de negocio, y se SOBRESCRIBEN los campos que solo el servidor puede fijar (estado inicial, autor, fecha, tarifas,
totales). Nada de lo que llegue en esos campos se guarda.
"""
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from . import dominio as dom
from . import reglas, tablas
from .models import Registro
from .reglas import ReglaError

CAMPOS_EDITABLES = {
    'clientes': {'razon_social', 'giro', 'comuna', 'contacto', 'telefono', 'email', 'activo'},
    'proveedores': {'razon_social', 'comuna', 'contacto', 'condicion_pago', 'descuentos_habituales', 'activo'},
    'articulos': {'nombre', 'categoria', 'unidad', 'costo_unitario', 'stock_minimo', 'proveedor_id', 'activo'},
}
# Campos de un presupuesto que solo fija el servidor
PRESUPUESTO_SERVIDOR = {'id', 'estado', 'aprobado_por', 'fecha', 'motivo_rechazo'}
MAX_BYTES_FILA = 3_000_000  # una hoja con firma y fotos reducidas cabe de sobra


def num(x):
    """Decimal → número JSON (entero si no tiene decimales)."""
    x = Decimal(str(x))
    return int(x) if x == x.to_integral() else float(x)


def uid(user):
    return f'U-{user.pk:03d}'


def ahora():
    return timezone.localtime().strftime('%Y-%m-%dT%H:%M:%S')


def hoy():
    return timezone.localdate().isoformat()


def ficha_de(user):
    reg = Registro.objects.filter(tabla='personal').filter(datos__usuario_id=uid(user)).first()
    return reg.fila() if reg else None


def siguiente_id(tabla):
    cfg = tablas.TABLAS[tabla]
    return f"{cfg['prefijo']}{str(Registro.objects.filter(tabla=tabla).count() + 1).zfill(cfg['ancho'])}"


def filas(tabla):
    return [r.fila() for r in Registro.objects.filter(tabla=tabla)]


def fila(tabla, rid):
    r = Registro.objects.filter(tabla=tabla, rid=rid).first() if rid else None
    return r.fila() if r else None


def exigir(cond, mensaje, status=422, code='regla_negocio'):
    if not cond:
        raise ReglaError(mensaje, status, code)


def positivo(v):
    return dom.es_numero(v) and v > 0


def no_negativo(v):
    return dom.es_numero(v) and v >= 0


class Lote:
    """Contexto de un lote de escrituras: ve las filas ya escritas dentro del mismo lote."""

    def __init__(self, user, ip):
        self.user, self.ip = user, ip
        self.ficha = ficha_de(user) if user.role == 'TECNICO' else None

    def puede(self, *acciones):
        return tablas.tiene(self.user, acciones)

    def exigir_permiso(self, *acciones):
        exigir(self.puede(*acciones), 'No tiene permiso para esta operación.', 403, 'permission_denied')

    # ═════════════ ALTAS ═════════════
    def insertar(self, tabla, datos):
        if tabla not in tablas.TABLAS or not tablas.puede_crear(self.user, tabla):
            raise ReglaError('No tiene permiso para esta operación.', 403, 'permission_denied')
        datos = dict(datos)
        exigir(len(str(datos)) < MAX_BYTES_FILA, 'El registro es demasiado grande.', 413, 'payload_too_large')
        esperado = siguiente_id(tabla)
        if datos.get('id') != esperado:
            raise ReglaError('Otro usuario modificó los datos; se actualizó la información.', 409, 'conflicto_id')
        getattr(self, f'_alta_{tabla}', lambda d: None)(datos)
        cuerpo = {k: v for k, v in datos.items() if k != 'id'}
        try:
            with transaction.atomic():
                Registro.objects.create(tabla=tabla, rid=esperado, datos=cuerpo)
        except IntegrityError:
            raise ReglaError('Otro usuario modificó los datos; se actualizó la información.', 409, 'conflicto_id')
        return {**cuerpo, 'id': esperado}

    def _maestro(self, d):
        exigir(dom.validar_rut(d.get('rut')), 'RUT inválido.')
        exigir(str(d.get('razon_social') or '').strip(), 'Indique la razón social.')
        exigir(not any(r['rut'] == d['rut'] for r in filas(self._tabla_actual)), 'Ya existe un registro con ese RUT.', 409, 'duplicado')
        d['activo'] = True

    def _alta_clientes(self, d):
        self._tabla_actual = 'clientes'
        self._maestro(d)

    def _alta_proveedores(self, d):
        self._tabla_actual = 'proveedores'
        self._maestro(d)
        desc = d.get('descuentos_habituales') or []
        exigir(len(desc) <= 3 and all(dom.es_numero(x) and 0 <= x <= 100 for x in desc), 'Descuentos inválidos.')

    def _alta_articulos(self, d):
        exigir(str(d.get('sku') or '').strip() and str(d.get('nombre') or '').strip(), 'Indique SKU y nombre.')
        exigir(not any(a['sku'] == d['sku'] for a in filas('articulos')), 'Ya existe un artículo con ese SKU.', 409, 'duplicado')
        exigir(no_negativo(d.get('costo_unitario', 0)) and no_negativo(d.get('stock_minimo', 0)), 'Costo y stock mínimo no pueden ser negativos.')
        exigir(not d.get('proveedor_id') or fila('proveedores', d['proveedor_id']), 'Proveedor inexistente.')
        d['activo'] = True

    def _alta_presupuestos(self, d):
        exigir(fila('clientes', d.get('cliente_id')), 'Cliente inexistente.')
        exigir(str(d.get('titulo') or '').strip(), 'Indique el título.')
        self._validar_contenido_presupuesto(d)
        d.update(estado='BORRADOR', fecha=hoy(), aprobado_por=None)
        d.pop('motivo_rechazo', None)

    def _validar_contenido_presupuesto(self, d):
        for m in d.get('materiales') or []:
            exigir(positivo(m.get('cantidad')) and no_negativo(m.get('costo_unitario')), 'Material con cantidad o costo inválido.')
            exigir(fila('articulos', m.get('articulo_id')), 'Material inexistente.')
        for m in d.get('mano_obra') or []:
            exigir(positivo(m.get('horas')) and no_negativo(m.get('costo_hora_hombre')), 'Mano de obra con horas o tarifa inválidas.')
        for m in d.get('adicionales') or []:
            exigir(no_negativo(m.get('monto')), 'Costo adicional inválido.')
        exigir(no_negativo(d.get('precio_venta_neto', 0)), 'El precio de venta no puede ser negativo.')

    def _alta_obras(self, d):
        tipo = d.get('tipo')
        exigir(tipo in dom.TIPOS_OBRA, 'Tipo de obra inválido.')
        pres = fila('presupuestos', d.get('presupuesto_id')) if d.get('presupuesto_id') else None
        if d.get('presupuesto_id'):
            exigir(pres, 'El presupuesto indicado no existe.')
            exigir(pres['estado'] == 'APROBADO', 'El presupuesto debe estar APROBADO.')
            exigir(not any(o.get('presupuesto_id') == pres['id'] for o in filas('obras')), 'El presupuesto ya está vinculado a otra obra.')
            cu30 = False
        else:
            exigir(tipo in dom.TIPOS_SIN_PRESUPUESTO, 'Este tipo de obra requiere un presupuesto aprobado.')
            exigir(self.puede('obras.emergencia'), 'Solo Supervisor o Gerencia pueden abrir obras sin presupuesto (CU30).', 403, 'permission_denied')
            cu30 = True
        exigir(fila('clientes', d.get('cliente_id')), 'Cliente inexistente.')
        exigir(str(d.get('nombre') or '').strip(), 'La obra debe tener un nombre.')
        u = d.get('ubicacion') or {}
        exigir(dom.es_numero(u.get('lat')) and dom.es_numero(u.get('lng')), 'Indique la ubicación de la obra.')
        d.update(estado='PLANIFICADA', es_emergencia_sin_presupuesto=cu30, presupuesto_id=d.get('presupuesto_id') or None,
                 supervisor_id=uid(self.user), fecha_inicio=d.get('fecha_inicio') or hoy(), fecha_cierre=None,
                 sobrantes_conciliados=False, pendientes_sync=0, tecnicos=[])
        d.setdefault('fecha_fin_estimada', None)

    def _alta_cardex(self, d):
        d['usuario_id'] = uid(self.user)
        if d.get('tipo') == reglas.AJUSTE:
            return self._ajuste_de_conteo(d)
        if d.get('tipo') == reglas.ENTRADA:
            # Las entradas solo nacen de una factura de compra registrada en este mismo lote o antes.
            f = fila('facturas', d.get('referencia'))
            exigir(f, 'Una entrada debe corresponder a una factura de compra.')
            item = next((i for i in f['items'] if i['articulo_id'] == d.get('articulo_id')), None)
            exigir(item and item['cantidad'] == d.get('cantidad')
                   and d.get('costo_unitario') == dom.calcular_neto(item['precio_lista'], f.get('descuentos') or []),
                   'La entrada no coincide con la factura.')
        reglas.validar_movimiento(
            d, filas('cardex'),
            existe_obra=lambda i: bool(fila('obras', i)),
            existe_articulo_activo=lambda i: bool((fila('articulos', i) or {}).get('activo')),
        )
        if d.get('tipo') in (reglas.SALIDA,):
            art = fila('articulos', d['articulo_id'])
            exigir(d['costo_unitario'] == art['costo_unitario'], 'La salida se valora al costo vigente del artículo.')
        self._validar_lote(d)

    def _validar_lote(self, d):
        """Un movimiento puede nombrar el lote o cilindro del que sale: debe existir, ser del mismo artículo y tener saldo."""
        movs = filas('cardex')
        origen = next((m for m in movs if m['id'] in (d.get('reversa_de'), d.get('salida_origen_id'))), None)
        if origen and origen.get('lote_id') != d.get('lote_id'):
            raise ReglaError('Una reversa o reingreso debe llevar el mismo lote que el movimiento original.')
        lote_id = d.get('lote_id')
        if not lote_id:
            d['lote_id'] = None
            return
        lote = fila('lotes', lote_id)
        exigir(lote and lote['articulo_id'] == d['articulo_id'], 'El lote no corresponde a este artículo.')
        exigir(d['tipo'] in (reglas.SALIDA, reglas.REINGRESO, reglas.REVERSA), 'Una entrada no se imputa a un lote existente.')
        if d['tipo'] == reglas.SALIDA:
            restante = reglas.restante_lote(lote, movs)
            exigir(reglas.num(d['cantidad']) <= restante, f"El lote {lote['codigo']} solo tiene {restante} disponible(s).")

    def _ajuste_de_conteo(self, d):
        """Contra-asiento de un conteo físico: solo lo crea quien aprueba (no quien contó), una vez y por la diferencia exacta."""
        self.exigir_permiso('conteo.aprobar')
        cnt = fila('conteos', d.get('referencia'))
        exigir(cnt and cnt['estado'] == 'PENDIENTE', 'El conteo no existe o ya fue resuelto.', 409, 'estado_invalido')
        exigir(cnt['creado_por'] != uid(self.user), 'Otra persona debe aprobar el ajuste (no quien contó).', 403, 'permission_denied')
        art = fila('articulos', d.get('articulo_id'))
        exigir(art and art['id'] == cnt['articulo_id'] and art.get('activo'), 'El ajuste no corresponde al artículo contado.')
        exigir(d.get('signo') == (1 if cnt['diferencia'] > 0 else -1) and reglas.num(d.get('cantidad')) == abs(reglas.num(cnt['diferencia'])),
               'El ajuste debe ser exactamente la diferencia del conteo.')
        exigir(reglas.stock(filas('cardex'), art['id']) == reglas.num(cnt['stock_sistema']),
               'El stock cambió desde que se contó: vuelve a contar el artículo.', 409, 'estado_invalido')
        exigir(d.get('costo_unitario') == art['costo_unitario'], 'El ajuste se valora al costo vigente del artículo.')
        d.update(obra_id=None, reversa_de=None, salida_origen_id=None, lote_id=None)

    def _alta_conteos(self, d):
        art = fila('articulos', d.get('articulo_id'))
        exigir(art and art.get('activo'), 'Artículo inexistente o inactivo.')
        exigir(no_negativo(d.get('contado')), 'La cantidad contada no puede ser negativa.')
        exigir(not any(c['articulo_id'] == art['id'] and c['estado'] == 'PENDIENTE' for c in filas('conteos')),
               'Este artículo ya tiene un conteo pendiente de aprobación.', 409, 'duplicado')
        sistema = num(reglas.stock(filas('cardex'), art['id']))  # el stock lo calcula el servidor, no lo que diga el cliente
        diferencia = num(Decimal(str(d['contado'])) - Decimal(str(sistema)))
        motivo = str(d.get('motivo') or '').strip()
        exigir(diferencia == 0 or len(motivo) >= 5, f'Hay una diferencia en el conteo: indica el motivo (mín. 5 caracteres).')
        d.update(fecha=ahora(), stock_sistema=sistema, diferencia=diferencia, motivo=motivo, creado_por=uid(self.user),
                 estado='CONFORME' if diferencia == 0 else 'PENDIENTE', resuelto_por=None, resuelto_en=None,
                 motivo_rechazo=None, movimiento_id=None, valor_diferencia=num(Decimal(str(diferencia)) * Decimal(str(art['costo_unitario']))))

    def _alta_lotes(self, d):
        art = fila('articulos', d.get('articulo_id'))
        exigir(art and art.get('activo'), 'Artículo inexistente o inactivo.')
        mov = fila('cardex', d.get('movimiento_id'))
        exigir(mov and mov['tipo'] == reglas.ENTRADA and mov['articulo_id'] == art['id'], 'El lote debe nacer de una entrada de compra de este artículo.')
        exigir(not reglas.esta_reversado(filas('cardex'), mov['id']), 'La entrada fue reversada.')
        exigir(d.get('tipo') in ('LOTE', 'SERIE'), 'Tipo de lote inválido.')
        cantidad = d.get('cantidad')
        exigir(positivo(cantidad), 'La cantidad del lote debe ser mayor que cero.')
        exigir(d['tipo'] != 'SERIE' or cantidad == 1, 'Una unidad con número de serie es de 1.')
        ya = sum(reglas.num(l['cantidad']) for l in filas('lotes') if l['movimiento_id'] == mov['id'])
        exigir(ya + reglas.num(cantidad) <= reglas.num(mov['cantidad']),
               f"Solo quedan {reglas.num(mov['cantidad']) - ya} unidad(es) de esa compra sin etiquetar.")
        vence = d.get('vencimiento')
        exigir(not vence or (len(str(vence)) == 10 and str(vence)[4] == '-' and str(vence)[7] == '-'), 'Fecha de vencimiento inválida.')
        exigir(len(str(d.get('codigo_proveedor') or '')) <= 60, 'El código del proveedor es demasiado largo.')
        d.update(codigo=f"{art['sku']}-L{d['id'][4:]}", factura_id=mov['referencia'], fecha_ingreso=hoy(),
                 creado_por=uid(self.user), vencimiento=vence or None, codigo_proveedor=str(d.get('codigo_proveedor') or '').strip() or None)

    def _alta_facturas(self, d):
        exigir(fila('proveedores', d.get('proveedor_id')), 'Proveedor inexistente.')
        desc = [x for x in (d.get('descuentos') or []) if x > 0]
        exigir(len(desc) <= 3 and all(dom.es_numero(x) and x <= 100 for x in desc), 'Se admiten hasta 3 descuentos en cascada.')
        items = d.get('items') or []
        exigir(items, 'La factura debe tener al menos un ítem.')
        for it in items:
            exigir(fila('articulos', it.get('articulo_id')) and positivo(it.get('cantidad')) and positivo(it.get('precio_lista')), 'Ítem de factura inválido.')
        exigir(str(d.get('numero') or '').strip(), 'Indique el número de factura.')
        exigir(not any(f['proveedor_id'] == d['proveedor_id'] and f['numero'] == d['numero'] for f in filas('facturas')),
               'Ya existe una factura con ese número para el proveedor.', 409, 'duplicado')
        c = dom.calcular_factura(items, desc)  # los totales los calcula el servidor
        d.update(descuentos=desc, neto_bruto=c['bruto'], neto=c['neto'], iva=c['iva'], total=c['total'], estado='REGISTRADA')

    def _alta_notas_credito(self, d):
        f = fila('facturas', d.get('factura_id'))
        exigir(f, 'Factura inexistente.')
        previas = sum(n['neto'] for n in filas('notas_credito') if n['factura_id'] == f['id'])
        exigir(positivo(d.get('neto')) and d['neto'] + previas <= f['neto'], 'El monto excede el neto disponible de la factura.')
        exigir(str(d.get('motivo') or '').strip(), 'Debe indicar el motivo.')
        d.update(dom.desglosar_total(d['neto']), fecha=hoy())

    def _obra_asignada(self, obra_id):
        obra = fila('obras', obra_id)
        exigir(obra and obra['estado'] == 'EN_CURSO', 'La obra no existe o no está en curso.')
        exigir(self.ficha and self.ficha['id'] in obra.get('tecnicos', []), 'No estás asignado a esta obra.', 403, 'permission_denied')
        return obra

    def _alta_hojas(self, d):
        exigir(self.ficha, 'El usuario no tiene ficha de personal.', 403, 'permission_denied')
        if d.get('client_id') and any(h.get('client_id') == d['client_id'] for h in filas('hojas')):
            raise ReglaError('Hoja ya registrada.', 409, 'conflicto_id')
        self._obra_asignada(d.get('obra_id'))
        exigir(dom.checklist_completo(d.get('checklist_json')), 'El checklist está incompleto.')
        horas = d.get('horas_trabajadas')
        exigir(positivo(horas) and horas <= dom.HORAS_MAX_DIA, f'Las horas deben estar entre 0 y {dom.HORAS_MAX_DIA}.')
        fotos = d.get('fotos') or []
        exigir(len(fotos) >= dom.FOTOS_MIN, f'Se requieren al menos {dom.FOTOS_MIN} fotos.')
        exigir(not any(f.get('simulado') for f in fotos), 'No se aceptan fotos con ubicación simulada.')
        exigir(d.get('firma_cliente') is True or d.get('firma'), 'Falta la firma del cliente.')
        veh = fila('flota', d.get('vehiculo_id')) if d.get('vehiculo_id') else None
        if d.get('vehiculo_id'):
            exigir(veh and veh.get('activo'), 'El vehículo indicado no existe.')
            exigir(veh['estado'] == 'ACTIVO', f"El vehículo {veh['patente']} está en taller.")
            ks, kr = d.get('km_salida'), d.get('km_regreso')
            exigir(no_negativo(ks) and no_negativo(kr) and kr > ks and kr - ks <= dom.KM_MAX_POR_HOJA, 'Kilometraje inválido.')
        else:
            d['km_salida'] = d['km_regreso'] = None
            d['vehiculo_id'] = None
        for m in d.get('materiales') or []:
            exigir(fila('articulos', m.get('articulo_id')) and positivo(m.get('cantidad')), 'Material de la hoja inválido.')
        # Lo que fija el servidor: autor, fecha, estado y la tarifa hora-hombre vigente (se congela al enviar).
        d.update(tecnico_id=self.ficha['id'], fecha=ahora(), estado='ENVIADA', auditoria=None,
                 costo_hora_hombre=self.ficha['costo_hora_hombre'])

    def _alta_retiros(self, d):
        exigir(self.ficha, 'El usuario no tiene ficha de personal.', 403, 'permission_denied')
        if d.get('client_id') and any(r.get('client_id') == d['client_id'] for r in filas('retiros')):
            raise ReglaError('Solicitud ya registrada.', 409, 'conflicto_id')
        self._obra_asignada(d.get('obra_id'))
        items = d.get('items') or []
        exigir(items, 'Agrega al menos un material.')
        vistos = set()
        for it in items:
            a = fila('articulos', it.get('articulo_id'))
            exigir(a and a.get('activo'), 'Hay un artículo inexistente o inactivo.')
            exigir(it['articulo_id'] not in vistos, f"Artículo repetido: {a['sku']}.")
            exigir(positivo(it.get('cantidad')), f"Cantidad inválida para {a['sku']}.")
            vistos.add(it['articulo_id'])
        d.update(tecnico_id=self.ficha['id'], fecha=ahora(), estado='PENDIENTE', resuelto_por=None, resuelto_en=None,
                 motivo_rechazo=None, movimientos=[])

    def _alta_asistencia(self, d):
        exigir(self.ficha, 'El usuario no tiene ficha de personal.', 403, 'permission_denied')
        exigir(not d.get('gps_simulado'), 'La marca requiere la ubicación real del dispositivo.')
        exigir(d.get('precision_m') is None or no_negativo(d.get('precision_m')), 'Precisión de ubicación inválida.')
        if d.get('client_id') and any(m.get('client_id') == d['client_id'] for m in filas('asistencia')):
            raise ReglaError('Marca ya registrada.', 409, 'conflicto_id')
        if d.get('obra_id'):
            obra = fila('obras', d['obra_id'])
            exigir(obra and self.ficha['id'] in obra.get('tecnicos', []), 'No estás asignado a esa obra.', 403, 'permission_denied')
        # La hora la fija el servidor: el reloj del teléfono no es confiable para asistencia. Única excepción: una marca
        # hecha SIN conexión y enviada después (diferida). Ahí se respeta la hora capturada en el dispositivo, solo si es
        # plausible (no futura, no más de 72 h atrás), y queda marcada como diferida junto con la hora de recepción.
        recibida = ahora()
        fecha, diferida = recibida, False
        if d.get('diferida') is True:
            capturada = str(d.get('capturado_en') or '')
            exigir(len(capturada) == 19 and capturada[10] == 'T', 'La hora de la marca diferida no es válida.')
            exigir(capturada <= recibida, 'La hora de la marca no puede ser futura.')
            exigir(capturada >= (timezone.localtime() - timezone.timedelta(hours=72)).strftime('%Y-%m-%dT%H:%M:%S'),
                   'La marca diferida es demasiado antigua (más de 72 h). Avisa a RRHH para regularizarla.')
            fecha, diferida = capturada, True
        d.update(tecnico_id=self.ficha['id'], fecha=fecha, recibida_en=recibida, diferida=diferida)
        d.pop('capturado_en', None)
        previas = sorted((m for m in filas('asistencia') if m['tecnico_id'] == self.ficha['id'] and m['fecha'].startswith(fecha[:10])),
                         key=lambda m: m['fecha'])
        exigir(not previas or fecha >= previas[-1]['fecha'], 'La marca es anterior a una ya registrada.', 409, 'secuencia_marca')
        reglas.validar_marca(d, previas)

    def _alta_auditoria(self, d):
        d.update(usuario_id=uid(self.user), usuario_nombre=self.user.full_name or self.user.email,
                 rol=tablas.ROL_UI[self.user.role], ip=self.ip, fecha=ahora())

    # ═════════════ CAMBIOS ═════════════
    def parchar(self, tabla, rid, cambios):
        if tabla not in tablas.TABLAS:
            raise ReglaError('Tabla desconocida.', 404, 'not_found')
        try:
            reg = Registro.objects.select_for_update().get(tabla=tabla, rid=rid)
        except Registro.DoesNotExist:
            raise ReglaError('Registro no encontrado.', 404, 'not_found')
        actual = reg.fila()
        cambios = dict(cambios)
        exigir(len(str(cambios)) < MAX_BYTES_FILA, 'El cambio es demasiado grande.', 413, 'payload_too_large')
        regla = getattr(self, f'_patch_{tabla}', None)
        if regla:
            cambios = regla(actual, cambios)
        else:
            exigir(tablas.puede_editar(self.user, tabla), 'No tiene permiso para esta operación.', 403, 'permission_denied')
            permitidos = CAMPOS_EDITABLES.get(tabla)
            cambios = {k: v for k, v in cambios.items() if k not in tablas.PROTEGIDOS and (permitidos is None or k in permitidos)}
        reg.datos = {**reg.datos, **cambios}
        reg.save(update_fields=['datos', 'actualizado'])
        return reg.fila()

    def _patch_clientes(self, a, c):
        self.exigir_permiso('maestros.gestionar')
        return {k: v for k, v in c.items() if k in CAMPOS_EDITABLES['clientes']}

    def _patch_proveedores(self, a, c):
        self.exigir_permiso('maestros.gestionar')
        return {k: v for k, v in c.items() if k in CAMPOS_EDITABLES['proveedores']}

    def _patch_articulos(self, a, c):
        self.exigir_permiso('articulos.gestionar')
        c = {k: v for k, v in c.items() if k in CAMPOS_EDITABLES['articulos']}
        if 'costo_unitario' in c or 'stock_minimo' in c:
            exigir(no_negativo(c.get('costo_unitario', 0)) and no_negativo(c.get('stock_minimo', 0)), 'Valores no pueden ser negativos.')
        return c

    def _patch_personal(self, a, c):
        self.exigir_permiso('personal.editar')
        c = {k: v for k, v in c.items() if k in ('costo_hora_hombre', 'activo')}
        if 'costo_hora_hombre' in c:
            exigir(positivo(c['costo_hora_hombre']), 'La tarifa debe ser mayor que cero.')
        return c

    def _patch_flota(self, a, c):
        if set(c) == {'km_actual'} and self.user.role == 'TECNICO':  # el técnico solo avanza el odómetro al enviar su hoja
            exigir(dom.es_numero(c['km_actual']) and c['km_actual'] >= a.get('km_actual', 0), 'El odómetro solo avanza.', 403, 'permission_denied')
            return c
        self.exigir_permiso('personal.editar')
        c = {k: v for k, v in c.items() if k == 'estado'}
        exigir(c.get('estado') in (None, 'ACTIVO', 'EN_TALLER'), 'Estado de vehículo inválido.')
        return c

    def _patch_presupuestos(self, a, c):
        if 'estado' in c and c['estado'] != a['estado']:
            return self._transicion_presupuesto(a, c)
        self.exigir_permiso('presupuestos.crear')
        exigir(a['estado'] in ('BORRADOR', 'ENVIADO'), f"Un presupuesto {a['estado']} no puede modificarse.", 409, 'estado_invalido')
        c = {k: v for k, v in c.items() if k not in PRESUPUESTO_SERVIDOR}
        self._validar_contenido_presupuesto({**a, **c})
        return c

    def _transicion_presupuesto(self, a, c):
        nuevo = c['estado']
        if a['estado'] == 'BORRADOR' and nuevo == 'ENVIADO':
            self.exigir_permiso('presupuestos.crear')
            return {'estado': 'ENVIADO'}
        exigir(a['estado'] == 'ENVIADO' and nuevo in ('APROBADO', 'RECHAZADO'), 'Transición de estado inválida.', 409, 'estado_invalido')
        self.exigir_permiso('presupuestos.aprobar')
        if nuevo == 'APROBADO':
            sim = dom.simular_rentabilidad(a)
            exigir(not (sim['bajo_minimo'] and self.user.role != 'ADMIN'),
                   f'Margen bajo {dom.MARGEN_MINIMO} %: requiere aprobación de Gerencia.', 403, 'permission_denied')
            return {'estado': 'APROBADO', 'aprobado_por': uid(self.user)}
        motivo = str(c.get('motivo_rechazo') or '').strip()
        exigir(motivo, 'Debe indicar el motivo.')
        return {'estado': 'RECHAZADO', 'motivo_rechazo': motivo}

    def _patch_obras(self, a, c):
        claves = set(c)
        if claves == {'tecnicos'}:
            self.exigir_permiso('obras.crear')
            exigir(a['estado'] != 'FINALIZADA', 'No se puede reasignar una obra finalizada.', 409, 'estado_invalido')
            ids = list(dict.fromkeys(c['tecnicos'] or []))
            exigir(all((fila('personal', t) or {}).get('activo') for t in ids), 'Hay un técnico inexistente o inactivo.')
            return {'tecnicos': ids}
        if claves == {'pendientes_sync'} and self.user.role == 'TECNICO':
            exigir(dom.es_numero(c['pendientes_sync']) and 0 <= c['pendientes_sync'] < a.get('pendientes_sync', 0), 'Cambio no permitido.', 403, 'permission_denied')
            return c
        if claves == {'sobrantes_conciliados'}:
            self.exigir_permiso('cardex.reingresar')
            return {'sobrantes_conciliados': True}
        if claves >= {'presupuesto_id'} and claves <= {'presupuesto_id', 'es_emergencia_sin_presupuesto'}:
            self.exigir_permiso('obras.crear')
            exigir(a.get('es_emergencia_sin_presupuesto'), 'La obra no está pendiente de regularización.', 409, 'estado_invalido')
            p = fila('presupuestos', c['presupuesto_id'])
            exigir(p and p['estado'] == 'APROBADO', 'El presupuesto debe estar APROBADO.')
            exigir(not any(o.get('presupuesto_id') == p['id'] for o in filas('obras')), 'El presupuesto ya está vinculado a otra obra.')
            return {'presupuesto_id': p['id'], 'es_emergencia_sin_presupuesto': False}
        if claves >= {'estado'} and claves <= {'estado', 'fecha_cierre'}:
            if c['estado'] == 'EN_CURSO':
                self.exigir_permiso('obras.crear')
                exigir(a['estado'] == 'PLANIFICADA', 'Solo una obra PLANIFICADA puede iniciarse.', 409, 'estado_invalido')
                return {'estado': 'EN_CURSO'}
            if c['estado'] == 'FINALIZADA':
                self.exigir_permiso('obras.cerrar')
                exigir(a['estado'] == 'EN_CURSO', 'Solo una obra EN_CURSO puede finalizarse.', 409, 'estado_invalido')
                checks, ok = dom.validar_cierre(a, fila('presupuestos', a.get('presupuesto_id')), filas('hojas'), filas('cardex'))
                exigir(ok, 'La obra no cumple los requisitos de cierre.')
                return {'estado': 'FINALIZADA', 'fecha_cierre': hoy()}
        raise ReglaError('Cambio de obra no permitido.', 403, 'permission_denied')

    def _patch_conteos(self, a, c):
        self.exigir_permiso('conteo.aprobar')
        exigir(a['estado'] == 'PENDIENTE', 'El conteo ya fue resuelto.', 409, 'estado_invalido')
        exigir(a['creado_por'] != uid(self.user), 'Otra persona debe aprobar el ajuste (no quien contó).', 403, 'permission_denied')
        if c.get('estado') == 'RECHAZADO':
            motivo = str(c.get('motivo_rechazo') or '').strip()
            exigir(motivo, 'Debe indicar el motivo del rechazo.')
            return {'estado': 'RECHAZADO', 'resuelto_por': uid(self.user), 'resuelto_en': ahora(), 'motivo_rechazo': motivo}
        exigir(c.get('estado') == 'APROBADO', 'Estado inválido.')
        # Aprobar = el ajuste ya quedó escrito en el Cardex en este mismo lote.
        mov = fila('cardex', c.get('movimiento_id'))
        exigir(mov and mov['tipo'] == reglas.AJUSTE and mov['referencia'] == a['id'], 'Falta el movimiento de ajuste en el Cardex.')
        return {'estado': 'APROBADO', 'resuelto_por': uid(self.user), 'resuelto_en': ahora(), 'movimiento_id': mov['id']}

    def _patch_hojas(self, a, c):
        self.exigir_permiso('hojas.auditar')
        exigir(a['estado'] == 'ENVIADA', 'Solo una hoja ENVIADA puede auditarse.', 409, 'estado_invalido')
        nuevo = c.get('estado')
        exigir(nuevo in ('APROBADA', 'DEVUELTA'), 'Estado de auditoría inválido.')
        obs = str((c.get('auditoria') or {}).get('observaciones') or '').strip()
        exigir(nuevo == 'APROBADA' or obs, 'Debe indicar observaciones al devolver.')
        return {'estado': nuevo, 'auditoria': {'usuario_id': uid(self.user), 'fecha': ahora(), 'observaciones': obs}}

    def _patch_retiros(self, a, c):
        self.exigir_permiso('cardex.crear')
        exigir(a['estado'] == 'PENDIENTE', 'La solicitud ya fue resuelta.', 409, 'estado_invalido')
        if c.get('estado') == 'RECHAZADA':
            motivo = str(c.get('motivo_rechazo') or '').strip()
            exigir(motivo, 'Debe indicar el motivo del rechazo.')
            return {'estado': 'RECHAZADA', 'resuelto_por': uid(self.user), 'resuelto_en': ahora(), 'motivo_rechazo': motivo}
        exigir(c.get('estado') == 'ENTREGADA', 'Estado inválido.')
        # Entregar = una salida por ítem, ya registrada en este lote con el costo vigente (todo o nada).
        ids = c.get('movimientos') or []
        movs = [fila('cardex', i) for i in ids]
        exigir(all(movs), 'Faltan los movimientos de la entrega.')
        esperado = sorted((i['articulo_id'], i['cantidad']) for i in a['items'])
        entregado = sorted((m['articulo_id'], m['cantidad']) for m in movs
                           if m['tipo'] == reglas.SALIDA and m['obra_id'] == a['obra_id'] and m['referencia'] == f"Retiro {a['id']}")
        exigir(esperado == entregado, 'La entrega no coincide con lo solicitado.')
        return {'estado': 'ENTREGADA', 'resuelto_por': uid(self.user), 'resuelto_en': ahora(), 'movimientos': ids}


def aplicar(user, ip, ops):
    """Aplica todas las operaciones o ninguna. Devuelve las filas resultantes en el mismo orden."""
    lote, salida = Lote(user, ip), []
    with transaction.atomic():
        for op in ops:
            if op.get('op') == 'insert':
                salida.append(lote.insertar(op.get('tabla'), op.get('fila') or {}))
            elif op.get('op') == 'patch':
                salida.append(lote.parchar(op.get('tabla'), op.get('id'), op.get('cambios') or {}))
            else:
                raise ReglaError('Operación inválida.', 400, 'bad_request')
    return salida
