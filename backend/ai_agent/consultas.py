"""Consultas seguras para el agente de IA (Function Calling parametrizado): finanzas, kardex y operaciones.

Reglas que se cumplen aquí y no dependen del modelo:
- Solo ORM de Django: nada de SQL crudo ni de nombres de tabla/campo que vengan del modelo.
- Lista blanca de filtros por herramienta (`FILTROS`): un parámetro que no está en la lista se descarta; cada valor se tipa y se acota
  (enum, fecha ISO, número con rango, texto de hasta 60 caracteres).
- Máximo `LIMITE` (50) filas por respuesta; los totales se calculan en la base sobre TODAS las coincidencias.
- RBAC con el usuario autenticado por JWT (nunca uno que diga el modelo): sin permiso se lanza `PermisoDenegado` (403) y el agente se lo explica a la persona.
- Los costos y márgenes solo salen si el rol los puede ver (`costos.ver` / `costos_compra.ver`), igual que en el resto del ERP."""
import logging
from datetime import date, datetime, time, timedelta

from django.db.models import Count, F, FloatField, Max, Q, Sum
from django.db.models.functions import Substr
from django.utils import timezone

from erp import conciliacion, dominio, tablas
from erp.informes import _campo, _en_rango, _num, _tabla
from erp.models import Registro
from facturacion.models import FacturaDTE

logger = logging.getLogger('ai_agent')

LIMITE = 50
MAX_TEXTO = 60
ESTADOS_OBRA = ('PLANIFICADA', 'EN_CURSO', 'FINALIZADA')
ESTADOS_PRESUPUESTO = ('BORRADOR', 'ENVIADO', 'APROBADO', 'RECHAZADO')  # ENVIADO = enviado a aprobación (pendiente)
ESTADOS_COBRO = tuple(v for v, _ in FacturaDTE.EstadoCobro.choices)
ORDENES_KARDEX = ('antiguedad', 'valor_total')
ESTADOS_CONCILIACION = (conciliacion.SIN_ORDEN, conciliacion.CONCILIADA, conciliacion.PENDIENTE_RECEPCION, conciliacion.BLOQUEADA, conciliacion.LIBERADA)

F_FINANZAS, F_KARDEX, F_OPERACIONES, F_PRESUPUESTOS = 'consultar_finanzas', 'consultar_kardex', 'consultar_operaciones', 'consultar_presupuestos'

# Filtros permitidos por herramienta: cualquier otro parámetro se ignora.
FILTROS = {
    'consultar_finanzas': ('tipo', 'fecha_desde', 'fecha_hasta', 'proveedor', 'cliente', 'estado_cobro', 'estado_conciliacion', 'resumen_discrepancias'),
    'consultar_kardex': ('categoria', 'proveedor', 'sin_movimiento_dias', 'ordenar_por'),
    'consultar_operaciones': ('estado', 'margen_menor_a', 'obra'),
    'consultar_presupuestos': ('estado', 'cliente', 'margen_menor_a'),
}


class PermisoDenegado(Exception):
    """El rol del usuario no puede consultar ese módulo (se informa como 403)."""


class FiltroInvalido(ValueError):
    """Un filtro vino mal formado: se le dice al modelo qué corregir."""


# ───────── Validación de filtros (lista blanca) ─────────
def _texto(v):
    if v in (None, ''):
        return None
    if not isinstance(v, str):
        raise FiltroInvalido('Los filtros de texto deben ser texto.')
    v = ''.join(c for c in v if c.isprintable()).strip()[:MAX_TEXTO]
    return v or None


def _enum(v, opciones, nombre):
    if v in (None, ''):
        return None
    if v not in opciones:
        raise FiltroInvalido(f'«{nombre}» debe ser uno de: {", ".join(opciones)}.')
    return v


def _fecha(v, nombre):
    if v in (None, ''):
        return None
    try:
        return date.fromisoformat(str(v)).isoformat()
    except ValueError:
        raise FiltroInvalido(f'«{nombre}» debe tener formato AAAA-MM-DD.')


def _numero(v, nombre, minimo, maximo):
    if v in (None, ''):
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not minimo <= v <= maximo:
        raise FiltroInvalido(f'«{nombre}» debe ser un número entre {minimo} y {maximo}.')
    return v


def _permitidos(herramienta, args):
    """Solo los filtros de la lista blanca; el resto ni se mira."""
    return {k: args[k] for k in FILTROS[herramienta] if k in args and args[k] not in (None, '')}


def _exigir(user, ok, modulo):
    if user.role == 'TECNICO' or not ok:
        raise PermisoDenegado(f'Permiso denegado (403): tu rol no tiene acceso a {modulo}.')


def _respuesta(filas, total, totales, **extra):
    return {'ok': True, 'total_coincidencias': total, 'mostrados': len(filas), 'limite': LIMITE, 'truncado': total > len(filas), 'totales': totales, 'filas': filas, **extra}


# ───────── consultar_finanzas ─────────
def _ids_de(tabla, texto, campos):
    """Ids de la tabla cuyo nombre/RUT/código contiene `texto` (ORM, hasta 20)."""
    q = Q(rid__iexact=texto)
    for c in campos:
        q |= Q(**{f'datos__{c}__icontains': texto})
    return list(_tabla(tabla).filter(q).values_list('rid', flat=True)[:20])


def consultar_finanzas(user, args):
    f = _permitidos('consultar_finanzas', args)
    tipo = _enum(f.get('tipo'), ('compra', 'venta'), 'tipo')
    desde, hasta = _fecha(f.get('fecha_desde'), 'fecha_desde'), _fecha(f.get('fecha_hasta'), 'fecha_hasta')
    if desde and hasta and desde > hasta:
        raise FiltroInvalido('«fecha_hasta» no puede ser anterior a «fecha_desde».')
    proveedor, cliente = _texto(f.get('proveedor')), _texto(f.get('cliente'))
    cobro = _enum(f.get('estado_cobro'), ESTADOS_COBRO, 'estado_cobro')
    conc = _enum(f.get('estado_conciliacion'), ESTADOS_CONCILIACION, 'estado_conciliacion')
    resumen_disc = f.get('resumen_discrepancias')
    if resumen_disc is not None and not isinstance(resumen_disc, bool):
        raise FiltroInvalido('«resumen_discrepancias» debe ser verdadero o falso.')
    puede_compra = tablas.puede_leer(user, 'facturas')
    puede_venta = tablas.tiene(user, ['facturacion.ver'])
    _exigir(user, puede_compra or puede_venta, 'las finanzas')
    if tipo == 'compra':
        _exigir(user, puede_compra, 'las facturas de compra')
    if tipo == 'venta':
        _exigir(user, puede_venta, 'las facturas de venta')
    if (proveedor or conc or resumen_disc) and tipo == 'venta' or (cliente or cobro) and tipo == 'compra':
        raise FiltroInvalido('«proveedor», «estado_conciliacion» y «resumen_discrepancias» aplican solo a compras; «cliente» y «estado_cobro» solo a ventas.')
    salida = {}
    if tipo in (None, 'compra') and puede_compra:
        salida['compras'] = _compras(desde, hasta, proveedor, conc, bool(resumen_disc))
    if tipo in (None, 'venta') and puede_venta and not (proveedor or conc or resumen_disc):
        salida['ventas'] = _ventas(desde, hasta, cliente, cobro)
    return {'ok': True, 'periodo': {'desde': desde, 'hasta': hasta}, **salida}


def _compras(desde, hasta, proveedor, estado_conciliacion=None, resumen_discrepancias=False):
    """Facturas de compra con su estado de conciliación (orden de compra ↔ recepción ↔ factura), calculado por `erp.conciliacion`.
    `resumen_discrepancias`: monto retenido y ranking de proveedores con más discrepancias, sobre las facturas del periodo (sin filtrar por estado)."""
    qs = _en_rango(_tabla('facturas'), 'fecha', desde, hasta)
    if proveedor:
        ids = _ids_de('proveedores', proveedor, ('razon_social', 'rut'))
        qs = qs.filter(datos__proveedor_id__in=ids) if ids else qs.none()
    conc = conciliacion.conciliar_todas()
    nombres = {r['rid']: r['datos'].get('razon_social', r['rid']) for r in _tabla('proveedores').values('rid', 'datos')}
    del_periodo = set(qs.values_list('rid', flat=True)[:5000])
    resumen = _resumen_discrepancias(qs, del_periodo, conc, nombres) if resumen_discrepancias else None
    if estado_conciliacion:
        del_periodo = {r for r in del_periodo if conc[r]['estado'] == estado_conciliacion}
        qs = qs.filter(rid__in=del_periodo)
    base = qs.annotate(_n=_campo('neto', FloatField()), _i=_campo('iva', FloatField()))
    a = base.aggregate(n=Count('id'), neto=Sum('_n'), iva=Sum('_i'))
    filas = []
    for r in qs.annotate(_d=Substr(_campo('fecha'), 1, 10)).order_by('-_d', '-rid').values('rid', 'datos')[:LIMITE]:
        d, c = r['datos'], conc[r['rid']]
        filas.append({'numero': d.get('numero'), 'fecha': d.get('fecha'), 'proveedor': nombres.get(d.get('proveedor_id'), d.get('proveedor_id')),
                      'neto': round(_num(d.get('neto'))), 'iva': round(_num(d.get('iva'))), 'total': round(_num(d.get('total'))),
                      'orden_compra': d.get('orden_compra_id'), 'estado_conciliacion': c['estado'], 'monto_retenido': c['monto_retenido'],
                      'discrepancias': [x['tipo'] for x in c['discrepancias']]})
    salida = _respuesta(filas, a['n'], {'neto': round(_num(a['neto'])), 'iva': round(_num(a['iva']))})
    if resumen is not None:
        salida['resumen_discrepancias'] = resumen
    return salida


def _resumen_discrepancias(qs, ids, conc, nombres):
    """Monto retenido y ranking de proveedores por discrepancias (solo facturas con orden de compra: son las únicas que se pueden cruzar)."""
    prov_de = {r['rid']: r['datos'].get('proveedor_id') for r in qs.values('rid', 'datos')}
    ranking, por_tipo, retenido, retenido_neto, bloqueadas, pendiente = {}, {}, 0, 0, 0, 0
    for fid in ids:
        c = conc[fid]
        pendiente += c['monto_pendiente_recepcion']
        if c['estado'] not in (conciliacion.BLOQUEADA, conciliacion.LIBERADA):
            continue
        retenido, retenido_neto = retenido + c['monto_retenido'], retenido_neto + c['monto_retenido_neto']
        bloqueadas += c['estado'] == conciliacion.BLOQUEADA
        p = ranking.setdefault(prov_de.get(fid), {'proveedor': nombres.get(prov_de.get(fid), prov_de.get(fid)), 'facturas_con_discrepancia': 0, 'discrepancias': 0, 'monto_retenido': 0})
        p['facturas_con_discrepancia'] += 1
        p['discrepancias'] += len(c['discrepancias'])
        p['monto_retenido'] += c['monto_retenido']
        for d in c['discrepancias']:
            por_tipo[d['tipo']] = por_tipo.get(d['tipo'], 0) + 1
    top = sorted(ranking.values(), key=lambda x: (-x['discrepancias'], -x['monto_retenido']))[:10]
    return {'monto_retenido': retenido, 'monto_retenido_neto': retenido_neto, 'facturas_bloqueadas': bloqueadas, 'monto_pendiente_recepcion': pendiente,
            'por_tipo': por_tipo, 'ranking_proveedores': top,
            'nota': 'Retenido = facturas hoy bloqueadas, con IVA. El ranking cuenta bloqueadas y liberadas. Solo las facturas enlazadas a una orden de compra se pueden cruzar.'}


def _ventas(desde, hasta, cliente, cobro):
    qs = FacturaDTE.objects.filter(estado_sii=FacturaDTE.EstadoSII.ACEPTADO, emitido_en__isnull=False)
    zona = timezone.get_current_timezone()  # rango de instantes: `__date` depende de tablas de zona horaria que MySQL puede no tener
    if desde:
        qs = qs.filter(emitido_en__gte=timezone.make_aware(datetime.combine(date.fromisoformat(desde), time.min), zona))
    if hasta:
        qs = qs.filter(emitido_en__lt=timezone.make_aware(datetime.combine(date.fromisoformat(hasta) + timedelta(days=1), time.min), zona))
    if cliente:
        qs = qs.filter(Q(receptor_razon_social__icontains=cliente) | Q(receptor_rut__icontains=cliente))
    if cobro:
        qs = qs.filter(estado_cobro=cobro)
    a = qs.aggregate(n=Count('id'), neto=Sum('monto_neto'), iva=Sum('monto_iva'), total=Sum('monto_total'))
    filas = [{'folio': f.folio_sii, 'fecha': timezone.localtime(f.emitido_en).date().isoformat(), 'cliente': f.receptor_razon_social, 'rut': f.receptor_rut,
              'neto': f.monto_neto, 'iva': f.monto_iva, 'total': f.monto_total, 'estado_cobro': f.estado_cobro}
             for f in qs.order_by('-emitido_en')[:LIMITE]]
    return _respuesta(filas, a['n'], {'neto': a['neto'] or 0, 'iva': a['iva'] or 0, 'total': a['total'] or 0})


# ───────── consultar_kardex ─────────
def consultar_kardex(user, args):
    f = _permitidos('consultar_kardex', args)
    categoria, proveedor = _texto(f.get('categoria')), _texto(f.get('proveedor'))
    dias = _numero(f.get('sin_movimiento_dias'), 'sin_movimiento_dias', 0, 3650)
    orden = _enum(f.get('ordenar_por'), ORDENES_KARDEX, 'ordenar_por') or 'valor_total'
    _exigir(user, tablas.puede_leer(user, 'cardex'), 'la bodega y el Cardex')
    con_costo = tablas.ver_costos(user)
    nota = None
    if orden == 'valor_total' and not con_costo:
        orden, nota = 'antiguedad', 'Tu rol no ve costos: el valor no se muestra y se ordenó por antigüedad.'

    arts = _tabla('articulos').exclude(datos__activo=False)
    if categoria:
        arts = arts.filter(datos__categoria__icontains=categoria)
    if proveedor:
        ids = _ids_de('proveedores', proveedor, ('razon_social', 'rut'))
        arts = arts.filter(datos__proveedor_id__in=ids) if ids else arts.none()
    permitidos = set(arts.values_list('rid', flat=True))
    mov = (_tabla('cardex').annotate(art=_campo('articulo_id'), cant=_campo('cantidad', FloatField()), sig=_campo('signo', FloatField()), dia=Substr(_campo('fecha'), 1, 10))
           .filter(datos__articulo_id__in=permitidos).values('art').annotate(stock=Sum(F('cant') * F('sig')), ultimo=Max('dia')))
    hoy = timezone.localdate()
    datos = {r['rid']: r['datos'] for r in arts.values('rid', 'datos')}
    filas = []
    for m in mov:
        stock = _num(m['stock'])
        if stock <= 0 or not m['ultimo']:
            continue
        d = datos[m['art']]
        inactivo = (hoy - date.fromisoformat(m['ultimo'])).days
        if dias is not None and inactivo < dias:
            continue
        fila = {'sku': d.get('sku'), 'nombre': d.get('nombre'), 'categoria': d.get('categoria'), 'stock': stock, 'unidad': d.get('unidad'),
                'ultimo_movimiento': m['ultimo'], 'dias_sin_movimiento': inactivo}
        if con_costo:
            fila['valor_total'] = round(stock * _num(d.get('costo_unitario')))
        filas.append(fila)
    filas.sort(key=lambda x: -(x['valor_total'] if orden == 'valor_total' else x['dias_sin_movimiento']))
    totales = {'valor_total': sum(x['valor_total'] for x in filas)} if con_costo else {}
    return _respuesta(filas[:LIMITE], len(filas), totales, ordenado_por=orden, **({'nota': nota} if nota else {}))


# ───────── consultar_operaciones ─────────
def consultar_operaciones(user, args):
    f = _permitidos('consultar_operaciones', args)
    estado = _enum(f.get('estado'), ESTADOS_OBRA, 'estado')
    margen = _numero(f.get('margen_menor_a'), 'margen_menor_a', -1000, 100)
    obra = _texto(f.get('obra'))
    _exigir(user, tablas.puede_leer(user, 'obras'), 'las obras')
    ve_margen = tablas.tiene(user, ['costos.ver'])
    if margen is not None:
        _exigir(user, ve_margen, 'los márgenes de las obras')

    qs = _tabla('obras')
    if estado:
        qs = qs.filter(datos__estado=estado)
    if obra:
        qs = qs.filter(Q(rid__iexact=obra) | Q(datos__nombre__icontains=obra))
    obras = list(qs.order_by('rid').values('rid', 'datos')[:500])
    presupuestos = {}
    if ve_margen:
        ids = [o['datos'].get('presupuesto_id') for o in obras if o['datos'].get('presupuesto_id')]
        presupuestos = {p['rid']: p['datos'] for p in _tabla('presupuestos').filter(rid__in=ids).values('rid', 'datos')}
    clientes = {c['rid']: c['datos'].get('razon_social', c['rid']) for c in _tabla('clientes').values('rid', 'datos')} if tablas.puede_leer(user, 'clientes') else {}
    filas = []
    for o in obras:
        d = o['datos']
        fila = {'id': o['rid'], 'nombre': d.get('nombre'), 'estado': d.get('estado'), 'tipo': d.get('tipo'), 'cliente': clientes.get(d.get('cliente_id'), d.get('cliente_id')),
                'fecha_inicio': d.get('fecha_inicio'), 'fecha_fin_estimada': d.get('fecha_fin_estimada'), 'presupuesto': d.get('presupuesto_id')}
        if ve_margen:
            p = presupuestos.get(d.get('presupuesto_id'))
            r = dominio.simular_rentabilidad(p) if p else None
            fila['margen_pct'] = r['margen_pct'] if r else None
            fila['venta_neta'] = r['venta_neto'] if r else None
        if margen is not None and (fila.get('margen_pct') is None or fila['margen_pct'] >= margen):
            continue
        filas.append(fila)
    if ve_margen:
        filas.sort(key=lambda x: (x['margen_pct'] is None, x['margen_pct'] if x['margen_pct'] is not None else 0))
    resumen = {'por_estado': {}}
    for x in filas:
        resumen['por_estado'][x['estado']] = resumen['por_estado'].get(x['estado'], 0) + 1
    return _respuesta(filas[:LIMITE], len(filas), resumen, **({} if ve_margen else {'nota': 'Tu rol no ve márgenes: no se muestran.'}))


# ───────── consultar_presupuestos ─────────
def consultar_presupuestos(user, args):
    """Presupuestos/cotizaciones con su margen proyectado. Sin `estado` devuelve los pendientes de aprobación (ENVIADO). Los márgenes exigen `costos.ver`."""
    f = _permitidos('consultar_presupuestos', args)
    estado = _enum(f.get('estado'), ESTADOS_PRESUPUESTO, 'estado') or 'ENVIADO'
    margen = _numero(f.get('margen_menor_a'), 'margen_menor_a', -1000, 100)
    cliente = _texto(f.get('cliente'))
    _exigir(user, tablas.puede_leer(user, 'presupuestos'), 'los presupuestos')
    ve_margen = tablas.tiene(user, ['costos.ver'])
    if margen is not None:
        _exigir(user, ve_margen, 'los márgenes de los presupuestos')
    qs = _tabla('presupuestos').filter(datos__estado=estado)
    if cliente:
        ids = _ids_de('clientes', cliente, ('razon_social', 'rut'))
        qs = qs.filter(datos__cliente_id__in=ids) if ids else qs.none()
    nombres = {c['rid']: c['datos'].get('razon_social', c['rid']) for c in _tabla('clientes').values('rid', 'datos')} if tablas.puede_leer(user, 'clientes') else {}
    filas = []
    for p in qs.order_by('rid').values('rid', 'datos')[:500]:
        d = p['datos']
        fila = {'id': p['rid'], 'titulo': d.get('titulo'), 'cliente': nombres.get(d.get('cliente_id'), d.get('cliente_id')), 'estado': d.get('estado'), 'fecha': d.get('fecha')}
        if ve_margen:
            r = dominio.simular_rentabilidad(d)
            fila.update(venta_neta=r['venta_neto'], costo_total=r['costo_total'], margen_pct=r['margen_pct'], bajo_margen_minimo=r['bajo_minimo'])
            if margen is not None and r['margen_pct'] >= margen:
                continue
        filas.append(fila)
    if ve_margen:
        filas.sort(key=lambda x: x['margen_pct'])
    totales = {'estado': estado, 'venta_neta': sum(x.get('venta_neta', 0) for x in filas)} if ve_margen else {'estado': estado}
    if ve_margen:
        totales['bajo_margen_minimo'] = sum(1 for x in filas if x['bajo_margen_minimo'])
    nota = f'Margen mínimo del negocio: {dominio.MARGEN_MINIMO} %; bajo ese valor solo el Administrador General puede aprobar.' if ve_margen else 'Tu rol no ve márgenes: no se muestran.'
    return _respuesta(filas[:LIMITE], len(filas), totales, nota=nota)


CONSULTAS = {'consultar_finanzas': consultar_finanzas, 'consultar_kardex': consultar_kardex, 'consultar_operaciones': consultar_operaciones, 'consultar_presupuestos': consultar_presupuestos}


def ejecutar(user, nombre, args):
    """Corre una consulta con el usuario autenticado. Devuelve el JSON para el modelo; los errores de permiso y de filtros también son JSON (nunca excepciones)."""
    try:
        r = CONSULTAS[nombre](user, args if isinstance(args, dict) else {})
        logger.info('ai_consulta user=%s rol=%s herramienta=%s filtros=%s total=%s', user.pk, user.role, nombre, sorted(_permitidos(nombre, args if isinstance(args, dict) else {})),
                    r.get('total_coincidencias', '-'))
        return r
    except PermisoDenegado as e:
        logger.warning('ai_consulta_403 user=%s rol=%s herramienta=%s', user.pk, user.role, nombre)
        return {'ok': False, 'status': 403, 'error': f'{e} Explícaselo con amabilidad a la persona; no intentes otra herramienta para esquivarlo.'}
    except FiltroInvalido as e:
        return {'ok': False, 'status': 400, 'error': str(e)}
