from django.utils import timezone

from accounts.tests.base import RoleTestCase
from erp.escritura import uid
from erp.models import Registro


def crear(tabla, rid, **datos):
    return Registro.objects.create(tabla=tabla, rid=rid, datos=datos)


class ErpBase(RoleTestCase):
    def setUp(self):
        super().setUp()
        crear('obras', 'OB-0001', nombre='Cámara 3', tecnicos=['T-01'], estado='EN_CURSO')
        crear('obras', 'OB-0002', nombre='Túnel', tecnicos=['T-02'], estado='EN_CURSO')
        crear('articulos', 'ART-001', sku='REF-1', nombre='Gas', categoria='Ref', unidad='un', costo_unitario=1000, stock_minimo=1, activo=True)
        crear('proveedores', 'PRV-001', rut='76.554.120-4', razon_social='Frigotec', activo=True)
        crear('clientes', 'CLI-001', rut='76.115.402-8', razon_social='Packing', activo=True)
        crear('personal', 'T-01', nombre='Jorge', cargo='Técnico', costo_hora_hombre=9000, usuario_id=uid(self.users['TECNICO']), activo=True)
        crear('personal', 'T-02', nombre='Luis', cargo='Técnico', costo_hora_hombre=8000, usuario_id='U-999', activo=True)
        crear('hojas', 'HS-0001', obra_id='OB-0001', tecnico_id='T-01', estado='ENVIADA')
        crear('hojas', 'HS-0002', obra_id='OB-0002', tecnico_id='T-02', estado='ENVIADA')
        crear('flota', 'VH-01', patente='AB-1', estado='ACTIVO', activo=True, km_actual=100, vencimiento_revision='2027-01-01', vencimiento_seguro='2027-01-01')
        crear('flota', 'VH-02', patente='AB-2', estado='EN_TALLER', activo=True, km_actual=100, vencimiento_revision='2027-01-01', vencimiento_seguro='2027-01-01')

    def snap(self, rol):
        self.as_role(rol)
        return self.client.get('/api/erp/snapshot/').json()

    def lote(self, rol, *ops):
        self.as_role(rol)
        return self.client.post('/api/erp/lote/', {'ops': list(ops)}, format='json')

    def compra(self, n, cantidad=10, precio=1000):
        """Factura + su entrada de bodega (las entradas solo nacen de una factura)."""
        fac = {'op': 'insert', 'tabla': 'facturas', 'fila': {
            'id': f'FC-{n:04d}', 'numero': f'N{n}', 'proveedor_id': 'PRV-001', 'fecha': '2026-11-05', 'descuentos': [],
            'items': [{'articulo_id': 'ART-001', 'cantidad': cantidad, 'precio_lista': precio}]}}
        return [fac, self.mov(f'MOV-{n:06d}', cantidad=cantidad, costo_unitario=precio, referencia=f'FC-{n:04d}')]

    def mov(self, id, tipo='ENTRADA_COMPRA', cantidad=10, **extra):
        signo = {'ENTRADA_COMPRA': 1, 'SALIDA_OBRA': -1, 'REINGRESO_SOBRANTE': 1}.get(tipo, 1)
        fila = {'id': id, 'tipo': tipo, 'fecha': '2026-11-05T10:00:00', 'articulo_id': 'ART-001', 'cantidad': cantidad,
                'costo_unitario': 1000, 'signo': signo, 'obra_id': 'OB-0001' if tipo == 'SALIDA_OBRA' else None,
                'usuario_id': 'U-001', 'referencia': 'x', 'reversa_de': None, 'salida_origen_id': None, **extra}
        return {'op': 'insert', 'tabla': 'cardex', 'fila': fila}


class SnapshotTests(ErpBase):
    def test_anonimo_no_accede(self):
        self.assertEqual(self.client.get('/api/erp/snapshot/').status_code, 401)

    def test_cada_rol_solo_recibe_las_tablas_que_puede_leer(self):
        self.assertGreater(len(self.snap('ADMIN')['obras']), 0)
        s = self.snap('RRHH')
        self.assertEqual((s['obras'], s['articulos'], s['presupuestos'], s['cardex']), ([], [], [], []))
        self.assertGreater(len(s['personal']), 0)

    def test_costos_ocultos_a_quien_no_los_ve(self):
        self.assertIn('costo_unitario', self.snap('FINANZAS')['articulos'][0])
        self.assertNotIn('costo_unitario', self.snap('TECNICO')['articulos'][0])

    def test_tecnico_solo_ve_lo_suyo(self):
        s = self.snap('TECNICO')
        self.assertEqual([o['id'] for o in s['obras']], ['OB-0001'])
        self.assertEqual([h['id'] for h in s['hojas']], ['HS-0001'])
        self.assertEqual([p['id'] for p in s['personal']], ['T-01'])
        self.assertEqual([v['id'] for v in s['flota']], ['VH-01'])  # sin vehículos en taller
        self.assertNotIn('vencimiento_seguro', s['flota'][0])
        self.assertEqual((s['cardex'], s['presupuestos'], s['clientes']), ([], [], []))

    def test_usuarios_sin_datos_sensibles_para_quien_no_administra(self):
        u = self.snap('FINANZAS')['usuarios'][0]
        self.assertNotIn('email', u)
        self.assertIn('email', self.snap('ADMIN')['usuarios'][0])


class EscrituraTests(ErpBase):
    def test_lote_es_atomico(self):
        r = self.lote('OPERACIONES', *self.compra(1), self.mov('MOV-000002', 'SALIDA_OBRA', 999))
        self.assertEqual(r.status_code, 422)
        self.assertEqual((Registro.objects.filter(tabla='cardex').count(), Registro.objects.filter(tabla='facturas').count()), (0, 0))

    def test_id_debe_ser_el_siguiente(self):
        r = self.lote('OPERACIONES', self.mov('MOV-000007', 'SALIDA_OBRA', 1))
        self.assertEqual((r.status_code, r.json()['code']), (409, 'conflicto_id'))

    def test_operaciones_registra_compra_y_salida_con_stock(self):
        r = self.lote('OPERACIONES', *self.compra(1, 10), self.mov('MOV-000002', 'SALIDA_OBRA', 4))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Registro.objects.filter(tabla='cardex').count(), 2)

    def test_entrada_sin_factura_rechazada(self):
        self.assertEqual(self.lote('OPERACIONES', self.mov('MOV-000001')).status_code, 422)
        distinta = self.compra(1, 10)
        distinta[1]['fila']['costo_unitario'] = 1
        self.assertEqual(self.lote('OPERACIONES', *distinta).status_code, 422)

    def test_salida_sin_stock_o_sin_obra_rechazada(self):
        self.assertEqual(self.lote('OPERACIONES', self.mov('MOV-000001', 'SALIDA_OBRA', 1)).status_code, 422)
        self.assertEqual(self.lote('OPERACIONES', *self.compra(1), self.mov('MOV-000002', 'SALIDA_OBRA', 1, obra_id=None)).status_code, 422)

    def test_salida_se_valora_al_costo_vigente_no_al_que_diga_el_cliente(self):
        r = self.lote('OPERACIONES', *self.compra(1), self.mov('MOV-000002', 'SALIDA_OBRA', 1, costo_unitario=1))
        self.assertEqual(r.status_code, 422)

    def test_el_usuario_del_movimiento_lo_sella_el_servidor(self):
        self.lote('OPERACIONES', *self.compra(1), self.mov('MOV-000002', 'SALIDA_OBRA', 1, usuario_id='U-999'))
        self.assertEqual(Registro.objects.get(tabla='cardex', rid='MOV-000002').datos['usuario_id'], uid(self.users['OPERACIONES']))

    def test_reversa_contra_asiento_exacto_y_una_sola_vez(self):
        self.lote('OPERACIONES', *self.compra(1, 10))
        rev = self.mov('MOV-000002', 'REVERSA', 10, signo=-1, reversa_de='MOV-000001', referencia='error de digitación')
        self.assertEqual(self.lote('OPERACIONES', rev).status_code, 200)
        otra = self.mov('MOV-000003', 'REVERSA', 10, signo=-1, reversa_de='MOV-000001', referencia='otra vez')
        self.assertEqual(self.lote('OPERACIONES', otra).status_code, 422)

    def test_reversa_exige_motivo_y_no_deja_stock_negativo(self):
        self.lote('OPERACIONES', *self.compra(1, 10), self.mov('MOV-000002', 'SALIDA_OBRA', 8))
        corta = self.mov('MOV-000003', 'REVERSA', 10, signo=-1, reversa_de='MOV-000001', referencia='no')
        self.assertEqual(self.lote('OPERACIONES', corta).status_code, 422)
        negativo = self.mov('MOV-000003', 'REVERSA', 10, signo=-1, reversa_de='MOV-000001', referencia='reversa de la entrada')
        self.assertEqual(self.lote('OPERACIONES', negativo).status_code, 422)

    def test_reingreso_limitado_a_lo_sacado(self):
        self.lote('OPERACIONES', *self.compra(1, 10), self.mov('MOV-000002', 'SALIDA_OBRA', 4))
        ok = self.mov('MOV-000003', 'REINGRESO_SOBRANTE', 3, salida_origen_id='MOV-000002', obra_id='OB-0001')
        self.assertEqual(self.lote('OPERACIONES', ok).status_code, 200)
        de_mas = self.mov('MOV-000004', 'REINGRESO_SOBRANTE', 2, salida_origen_id='MOV-000002', obra_id='OB-0001')
        self.assertEqual(self.lote('OPERACIONES', de_mas).status_code, 422)

    def test_libros_inmutables_no_se_editan(self):
        self.lote('OPERACIONES', *self.compra(1))
        for tabla, rid in (('cardex', 'MOV-000001'), ('facturas', 'FC-0001')):
            r = self.lote('OPERACIONES', {'op': 'patch', 'tabla': tabla, 'id': rid, 'cambios': {'cantidad': 1}})
            self.assertEqual(r.status_code, 403, tabla)

    def test_rbac_por_tabla(self):
        art = {'op': 'insert', 'tabla': 'articulos', 'fila': {'id': 'ART-002', 'sku': 'N', 'nombre': 'N', 'activo': True}}
        self.assertEqual(self.lote('OPERACIONES', art).status_code, 200)
        for rol in ('FINANZAS', 'RRHH', 'TECNICO'):
            self.assertEqual(self.lote(rol, {**art, 'fila': {**art['fila'], 'id': 'ART-003', 'sku': 'M'}}).status_code, 403, rol)

    def test_solo_rrhh_edita_tarifa_y_solo_ciertos_campos(self):
        cambio = {'op': 'patch', 'tabla': 'personal', 'id': 'T-02', 'cambios': {'costo_hora_hombre': 9999, 'usuario_id': 'U-001'}}
        self.assertEqual(self.lote('FINANZAS', cambio).status_code, 403)
        self.assertEqual(self.lote('RRHH', cambio).status_code, 200)
        datos = Registro.objects.get(tabla='personal', rid='T-02').datos
        self.assertEqual((datos['costo_hora_hombre'], datos['usuario_id']), (9999, 'U-999'))
        malo = {**cambio, 'cambios': {'costo_hora_hombre': -5}}
        self.assertEqual(self.lote('RRHH', malo).status_code, 422)

    def test_auditoria_la_sella_el_servidor(self):
        log = {'op': 'insert', 'tabla': 'auditoria', 'fila': {'id': 'LOG-000001', 'usuario_id': 'U-001', 'usuario_nombre': 'Falso', 'rol': 'ADMIN_GENERAL',
                                                              'entidad': 'X', 'entidad_id': '1', 'accion': 'CREAR', 'fecha': '2000-01-01T00:00:00', 'ip': '1.1.1.1'}}
        self.assertEqual(self.lote('FINANZAS', log).status_code, 200)
        d = Registro.objects.get(tabla='auditoria', rid='LOG-000001').datos
        self.assertEqual((d['usuario_id'], d['rol']), (uid(self.users['FINANZAS']), 'ADMINISTRACION'))
        self.assertNotEqual((d['usuario_nombre'], d['fecha'][:4], d['ip']), ('Falso', '2000', '1.1.1.1'))
        self.assertEqual(self.lote('FINANZAS', {'op': 'patch', 'tabla': 'auditoria', 'id': 'LOG-000001', 'cambios': {'accion': 'x'}}).status_code, 403)

    def test_maestros_validan_rut_y_duplicados(self):
        fila = {'id': 'CLI-002', 'rut': '76.115.402-8', 'razon_social': 'A'}
        self.assertEqual(self.lote('FINANZAS', {'op': 'insert', 'tabla': 'clientes', 'fila': fila}).status_code, 409)  # ya existe
        malo = {**fila, 'rut': '11.111.111-2'}
        self.assertEqual(self.lote('FINANZAS', {'op': 'insert', 'tabla': 'clientes', 'fila': malo}).status_code, 422)
        bueno = {**fila, 'rut': '77.248.913-7'}
        self.assertEqual(self.lote('FINANZAS', {'op': 'insert', 'tabla': 'clientes', 'fila': bueno}).status_code, 200)

    def test_tecnico_odometro_solo_avanza(self):
        sube = {'op': 'patch', 'tabla': 'flota', 'id': 'VH-01', 'cambios': {'km_actual': 150}}
        baja = {'op': 'patch', 'tabla': 'flota', 'id': 'VH-01', 'cambios': {'km_actual': 50}}
        self.assertEqual(self.lote('TECNICO', sube).status_code, 200)
        self.assertEqual(self.lote('TECNICO', baja).status_code, 403)


class AsistenciaTests(ErpBase):
    def marca(self, id, tipo, **extra):
        return {'op': 'insert', 'tabla': 'asistencia', 'fila': {'id': id, 'tipo': tipo, 'fecha': '1999-01-01T00:00:00', 'lat': -36.6, 'lng': -72.1,
                                                              'obra_id': None, 'client_id': f'c-{id}', 'tecnico_id': 'T-02', **extra}}

    def test_secuencia_entrada_salida(self):
        self.assertEqual(self.lote('TECNICO', self.marca('ASI-000001', 'SALIDA')).status_code, 409)
        self.assertEqual(self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA')).status_code, 200)
        r = self.lote('TECNICO', self.marca('ASI-000002', 'ENTRADA'))
        self.assertEqual((r.status_code, r.json()['code']), (409, 'secuencia_marca'))
        self.assertEqual(self.lote('TECNICO', self.marca('ASI-000002', 'SALIDA')).status_code, 200)

    def test_hora_y_tecnico_los_fija_el_servidor(self):
        self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA'))
        d = Registro.objects.get(tabla='asistencia', rid='ASI-000001').datos
        self.assertEqual(d['tecnico_id'], 'T-01')
        self.assertTrue(d['fecha'].startswith(timezone.localdate().isoformat()))

    def test_marca_diferida_respeta_la_hora_del_dispositivo_si_es_plausible(self):
        ayer = (timezone.localtime() - timezone.timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M:%S')
        r = self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA', diferida=True, capturado_en=ayer))
        self.assertEqual(r.status_code, 200, r.content)
        d = Registro.objects.get(tabla='asistencia', rid='ASI-000001').datos
        self.assertEqual((d['fecha'], d['diferida']), (ayer, True))
        self.assertGreater(d['recibida_en'], d['fecha'])

    def test_marca_diferida_rechaza_futuro_y_muy_antiguas(self):
        futuro = (timezone.localtime() + timezone.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S')
        viejo = (timezone.localtime() - timezone.timedelta(hours=80)).strftime('%Y-%m-%dT%H:%M:%S')
        self.assertEqual(self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA', diferida=True, capturado_en=futuro)).status_code, 422)
        self.assertEqual(self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA', diferida=True, capturado_en=viejo)).status_code, 422)
        self.assertEqual(self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA', diferida=True, capturado_en='basura')).status_code, 422)

    def test_sin_bandera_diferida_el_servidor_ignora_la_hora_del_cliente(self):
        hace = (timezone.localtime() - timezone.timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M:%S')
        self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA', capturado_en=hace))
        d = Registro.objects.get(tabla='asistencia', rid='ASI-000001').datos
        self.assertEqual(d['diferida'], False)
        self.assertGreater(d['fecha'], hace)

    def test_una_marca_diferida_no_puede_ser_anterior_a_otra_ya_registrada(self):
        self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA'))
        antes = (timezone.localtime() - timezone.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S')
        r = self.lote('TECNICO', self.marca('ASI-000002', 'SALIDA', diferida=True, capturado_en=antes))
        self.assertEqual(r.status_code, 409)

    def test_gps_simulado_rechazado(self):
        self.assertEqual(self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA', gps_simulado=True)).status_code, 422)

    def test_solo_el_tecnico_marca(self):
        self.assertEqual(self.lote('RRHH', self.marca('ASI-000001', 'ENTRADA')).status_code, 403)

    def test_obra_ajena_rechazada(self):
        self.assertEqual(self.lote('TECNICO', self.marca('ASI-000001', 'ENTRADA', obra_id='OB-0002')).status_code, 403)


class DatosSensiblesTests(ErpBase):
    def fila(self, rol, tabla, rid):
        return next(f for f in self.snap(rol)[tabla] if f['id'] == rid)

    def test_el_servidor_no_envia_tarifas_ni_ruts_a_quien_no_los_ve(self):
        crear('personal', 'T-03', nombre='Ana', rut='15.000.000-0', cargo='Técnico', costo_hora_hombre=7000,
              vencimiento_licencia='2027-01-01', fecha_ingreso='2020-01-01', activo=True, usuario_id=uid(self.users['TECNICO']))
        Registro.objects.filter(tabla='personal', rid='T-01').update(datos={'nombre': 'x', 'usuario_id': 'U-998', 'activo': True})
        ops = self.fila('OPERACIONES', 'personal', 'T-03')
        self.assertTrue({'rut', 'vencimiento_licencia', 'fecha_ingreso'}.isdisjoint(ops))
        self.assertIn('costo_hora_hombre', ops)  # Operaciones sí ve costos de obra (costos.ver)
        tec = self.fila('TECNICO', 'personal', 'T-03')  # su propia ficha
        self.assertTrue({'rut', 'costo_hora_hombre', 'vencimiento_licencia'}.isdisjoint(tec))
        self.assertTrue({'rut', 'costo_hora_hombre', 'vencimiento_licencia'} <= set(self.fila('RRHH', 'personal', 'T-03')))

    def test_tarifa_congelada_en_hojas_solo_con_costos_ver(self):
        crear('hojas', 'HS-0009', obra_id='OB-0001', tecnico_id='T-01', estado='ENVIADA', costo_hora_hombre=9000)
        self.assertIn('costo_hora_hombre', self.fila('FINANZAS', 'hojas', 'HS-0009'))
        self.assertNotIn('costo_hora_hombre', self.fila('TECNICO', 'hojas', 'HS-0009'))


class ContadoresTests(ErpBase):
    """Regresión: el técnico no ve la auditoría, así que no puede deducir su siguiente id a partir de lo que ve."""

    def test_la_instantanea_informa_el_total_real_aunque_el_rol_no_lea_la_tabla(self):
        for n in range(1, 4):
            crear('auditoria', f'LOG-{n:06d}', accion='X')
        snap = self.snap('TECNICO')
        self.assertEqual(snap['auditoria'], [])  # no la ve…
        self.assertEqual(snap['_contadores']['auditoria'], 3)  # …pero conoce cuántas hay

    def test_dos_marcas_seguidas_con_su_auditoria_funcionan(self):
        def lote_de_marca(tipo, n_asistencia):
            c = self.snap('TECNICO')['_contadores']
            marca = {'op': 'insert', 'tabla': 'asistencia', 'fila': {
                'id': f"ASI-{c['asistencia'] + 1:06d}", 'tipo': tipo, 'lat': -36.6, 'lng': -72.1, 'obra_id': None,
                'client_id': f'c{n_asistencia}', 'gps_simulado': False}}
            log = {'op': 'insert', 'tabla': 'auditoria', 'fila': {
                'id': f"LOG-{c['auditoria'] + 1:06d}", 'entidad': 'Asistencia', 'entidad_id': 'x', 'accion': tipo}}
            return self.lote('TECNICO', marca, log)

        self.assertEqual(lote_de_marca('ENTRADA', 1).status_code, 200)
        r = lote_de_marca('SALIDA', 2)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Registro.objects.filter(tabla='auditoria').count(), 2)
