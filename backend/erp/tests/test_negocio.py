"""Reglas de negocio que el servidor hace cumplir (presupuestos, obras, hojas, retiros, compras)."""
from erp.escritura import uid
from erp.models import Registro

from .test_erp import ErpBase, crear


class Negocio(ErpBase):
    def setUp(self):
        super().setUp()
        self.pres = {'titulo': 'P', 'cliente_id': 'CLI-001', 'tipo_obra': 'INSTALACION',
                     'materiales': [], 'mano_obra': [], 'adicionales': [{'monto': 700}], 'precio_venta_neto': 1000}

    def insertar(self, rol, tabla, fila):
        return self.lote(rol, {'op': 'insert', 'tabla': tabla, 'fila': fila})

    def parchar(self, rol, tabla, rid, cambios):
        return self.lote(rol, {'op': 'patch', 'tabla': tabla, 'id': rid, 'cambios': cambios})

    def datos(self, tabla, rid):
        return Registro.objects.get(tabla=tabla, rid=rid).datos


class PresupuestoTests(Negocio):
    def nuevo(self, **extra):
        r = self.insertar('FINANZAS', 'presupuestos', {'id': 'PRE-0001', **self.pres, 'estado': 'APROBADO', 'aprobado_por': 'U-001', **extra})
        self.assertEqual(r.status_code, 200, r.content)

    def test_nace_borrador_sin_aprobador_aunque_el_cliente_diga_otra_cosa(self):
        self.nuevo()
        d = self.datos('presupuestos', 'PRE-0001')
        self.assertEqual((d['estado'], d['aprobado_por']), ('BORRADOR', None))

    def test_flujo_enviar_aprobar_con_margen_suficiente(self):
        self.nuevo(adicionales=[{'monto': 700}])  # margen 30 %
        self.assertEqual(self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'estado': 'APROBADO'}).status_code, 409)  # sin enviar
        self.assertEqual(self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'estado': 'ENVIADO'}).status_code, 200)
        r = self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'estado': 'APROBADO', 'aprobado_por': 'U-999'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.datos('presupuestos', 'PRE-0001')['aprobado_por'], uid(self.users['FINANZAS']))  # lo fija el servidor
        self.assertEqual(self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'titulo': 'otro'}).status_code, 409)  # aprobado = inmutable

    def test_margen_bajo_solo_lo_aprueba_la_gerencia(self):
        self.nuevo(adicionales=[{'monto': 950}])  # margen 5 %
        self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'estado': 'ENVIADO'})
        self.assertEqual(self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'estado': 'APROBADO'}).status_code, 403)
        self.assertEqual(self.parchar('ADMIN', 'presupuestos', 'PRE-0001', {'estado': 'APROBADO'}).status_code, 200)

    def test_operaciones_no_aprueba_y_rechazo_exige_motivo(self):
        self.nuevo()
        self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'estado': 'ENVIADO'})
        self.assertEqual(self.parchar('OPERACIONES', 'presupuestos', 'PRE-0001', {'estado': 'APROBADO'}).status_code, 403)
        self.assertEqual(self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'estado': 'RECHAZADO'}).status_code, 422)
        self.assertEqual(self.parchar('FINANZAS', 'presupuestos', 'PRE-0001', {'estado': 'RECHAZADO', 'motivo_rechazo': 'precio'}).status_code, 200)

    def test_datos_invalidos_rechazados(self):
        self.assertEqual(self.insertar('FINANZAS', 'presupuestos', {'id': 'PRE-0001', **self.pres, 'cliente_id': 'CLI-999'}).status_code, 422)
        self.assertEqual(self.insertar('FINANZAS', 'presupuestos', {'id': 'PRE-0001', **self.pres, 'precio_venta_neto': -1}).status_code, 422)


class ObraTests(Negocio):
    def fila(self, **extra):
        return {'id': 'OB-0003', 'nombre': 'Nueva', 'cliente_id': 'CLI-001', 'tipo': 'INSTALACION', 'presupuesto_id': None,
                'ubicacion': {'lat': -36.6, 'lng': -72.1, 'radio_m': 150}, **extra}

    def test_instalacion_exige_presupuesto_aprobado(self):
        self.assertEqual(self.insertar('OPERACIONES', 'obras', self.fila()).status_code, 422)
        crear('presupuestos', 'PRE-0001', estado='ENVIADO')
        self.assertEqual(self.insertar('OPERACIONES', 'obras', self.fila(presupuesto_id='PRE-0001')).status_code, 422)

    def test_emergencia_cu30_y_estado_inicial_forzado(self):
        r = self.insertar('OPERACIONES', 'obras', self.fila(tipo='EMERGENCIA', estado='FINALIZADA', tecnicos=['T-99'], supervisor_id='U-999'))
        self.assertEqual(r.status_code, 200, r.content)
        d = self.datos('obras', 'OB-0003')
        self.assertEqual((d['estado'], d['es_emergencia_sin_presupuesto'], d['tecnicos'], d['supervisor_id']),
                         ('PLANIFICADA', True, [], uid(self.users['OPERACIONES'])))
        self.assertEqual(self.insertar('FINANZAS', 'obras', {**self.fila(tipo='GARANTIA'), 'id': 'OB-0004'}).status_code, 403)

    def test_no_se_finaliza_sin_cumplir_el_cierre(self):
        self.assertEqual(self.parchar('ADMIN', 'obras', 'OB-0001', {'estado': 'FINALIZADA'}).status_code, 422)
        self.assertEqual(self.parchar('FINANZAS', 'obras', 'OB-0001', {'estado': 'FINALIZADA'}).status_code, 403)  # Finanzas no cierra obras

    def test_finaliza_cuando_se_cumplen_los_seis_requisitos(self):
        crear('presupuestos', 'PRE-0001', estado='APROBADO')
        Registro.objects.filter(tabla='obras', rid='OB-0001').update(datos={
            'nombre': 'x', 'tecnicos': ['T-01'], 'estado': 'EN_CURSO', 'presupuesto_id': 'PRE-0001', 'sobrantes_conciliados': True, 'pendientes_sync': 0})
        Registro.objects.filter(tabla='hojas', rid='HS-0001').update(datos={
            'obra_id': 'OB-0001', 'tecnico_id': 'T-01', 'estado': 'APROBADA', 'horas_trabajadas': 8, 'costo_hora_hombre': 9000})
        r = self.parchar('ADMIN', 'obras', 'OB-0001', {'estado': 'FINALIZADA', 'fecha_cierre': '1999-01-01'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotEqual(self.datos('obras', 'OB-0001')['fecha_cierre'], '1999-01-01')

    def test_asignar_tecnicos_valida_fichas(self):
        self.assertEqual(self.parchar('OPERACIONES', 'obras', 'OB-0001', {'tecnicos': ['T-01', 'T-99']}).status_code, 422)
        self.assertEqual(self.parchar('OPERACIONES', 'obras', 'OB-0001', {'tecnicos': ['T-01', 'T-02']}).status_code, 200)
        self.assertEqual(self.parchar('RRHH', 'obras', 'OB-0001', {'tecnicos': ['T-02']}).status_code, 403)


class HojaTests(Negocio):
    def hoja(self, **extra):
        return {'id': 'HS-0003', 'client_id': 'c1', 'obra_id': 'OB-0001', 'tecnico_id': 'T-02', 'fecha': '1999-01-01T00:00:00', 'estado': 'APROBADA',
                'costo_hora_hombre': 1, 'auditoria': {'x': 1}, 'horas_trabajadas': 8, 'firma_cliente': True,
                'checklist_json': {'presion_psi': 98, 'amperaje_a': 18, 'fugas': 'SIN_FUGAS', 'temperatura_c': -18, 'limpieza': 'OK'},
                'fotos': [{'id': 'F1', 'lat': -36.6, 'lng': -72.1, 'simulado': False}, {'id': 'F2', 'lat': -36.6, 'lng': -72.1, 'simulado': False}],
                'materiales': [], 'vehiculo_id': None, 'km_salida': None, 'km_regreso': None, **extra}

    def test_el_servidor_fija_autor_fecha_estado_y_tarifa(self):
        r = self.insertar('TECNICO', 'hojas', self.hoja())
        self.assertEqual(r.status_code, 200, r.content)
        d = self.datos('hojas', 'HS-0003')
        self.assertEqual((d['tecnico_id'], d['estado'], d['costo_hora_hombre'], d['auditoria']), ('T-01', 'ENVIADA', 9000, None))
        self.assertNotEqual(d['fecha'][:4], '1999')

    def test_validaciones(self):
        casos = {
            'checklist incompleto': self.hoja(checklist_json={'presion_psi': 98}),
            'sin horas': self.hoja(horas_trabajadas=0),
            'demasiadas horas': self.hoja(horas_trabajadas=17),
            'pocas fotos': self.hoja(fotos=[{'id': 'F1', 'simulado': False}]),
            'foto con GPS simulado': self.hoja(fotos=[{'id': 'F1', 'simulado': True}, {'id': 'F2', 'simulado': False}]),
            'sin firma': self.hoja(firma_cliente=False),
            'obra ajena': self.hoja(obra_id='OB-0002'),
            'vehiculo en taller': self.hoja(vehiculo_id='VH-02', km_salida=100, km_regreso=200),
            'km invalido': self.hoja(vehiculo_id='VH-01', km_salida=200, km_regreso=100),
            'km desproporcionado': self.hoja(vehiculo_id='VH-01', km_salida=100, km_regreso=99999),
        }
        for nombre, fila in casos.items():
            self.assertIn(self.insertar('TECNICO', 'hojas', fila).status_code, (403, 422), nombre)
        self.assertEqual(Registro.objects.filter(tabla='hojas').count(), 2)  # solo las 2 del setUp

    def test_solo_el_tecnico_envia_y_solo_operaciones_audita(self):
        self.assertEqual(self.insertar('OPERACIONES', 'hojas', self.hoja()).status_code, 403)
        self.assertEqual(self.parchar('TECNICO', 'hojas', 'HS-0001', {'estado': 'APROBADA'}).status_code, 403)
        self.assertEqual(self.parchar('OPERACIONES', 'hojas', 'HS-0001', {'estado': 'DEVUELTA'}).status_code, 422)
        r = self.parchar('OPERACIONES', 'hojas', 'HS-0001', {'estado': 'APROBADA', 'auditoria': {'usuario_id': 'U-999', 'observaciones': 'ok'}})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.datos('hojas', 'HS-0001')['auditoria']['usuario_id'], uid(self.users['OPERACIONES']))
        self.assertEqual(self.parchar('OPERACIONES', 'hojas', 'HS-0001', {'estado': 'DEVUELTA'}).status_code, 409)


class RetiroYComprasTests(Negocio):
    def test_retiro_valida_obra_items_y_estado(self):
        base = {'id': 'SR-0001', 'obra_id': 'OB-0001', 'tecnico_id': 'T-02', 'estado': 'ENTREGADA', 'items': [{'articulo_id': 'ART-001', 'cantidad': 3}]}
        self.assertEqual(self.insertar('TECNICO', 'retiros', {**base, 'obra_id': 'OB-0002'}).status_code, 403)
        self.assertEqual(self.insertar('TECNICO', 'retiros', {**base, 'items': [{'articulo_id': 'ART-001', 'cantidad': 0}]}).status_code, 422)
        self.assertEqual(self.insertar('TECNICO', 'retiros', base).status_code, 200)
        d = self.datos('retiros', 'SR-0001')
        self.assertEqual((d['estado'], d['tecnico_id']), ('PENDIENTE', 'T-01'))

    def test_entregar_genera_salidas_exactas(self):
        self.insertar('TECNICO', 'retiros', {'id': 'SR-0001', 'obra_id': 'OB-0001', 'items': [{'articulo_id': 'ART-001', 'cantidad': 3}]})
        self.lote('OPERACIONES', *self.compra(1, 10))
        self.assertEqual(self.parchar('OPERACIONES', 'retiros', 'SR-0001', {'estado': 'ENTREGADA', 'movimientos': []}).status_code, 422)
        salida = self.mov('MOV-000002', 'SALIDA_OBRA', 3, referencia='Retiro SR-0001')
        r = self.lote('OPERACIONES', salida, {'op': 'patch', 'tabla': 'retiros', 'id': 'SR-0001',
                                              'cambios': {'estado': 'ENTREGADA', 'movimientos': ['MOV-000002']}})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.parchar('OPERACIONES', 'retiros', 'SR-0001', {'estado': 'RECHAZADA', 'motivo_rechazo': 'x'}).status_code, 409)

    def test_factura_totales_los_calcula_el_servidor(self):
        fac = {'id': 'FC-0001', 'numero': '1', 'proveedor_id': 'PRV-001', 'fecha': '2026-11-05', 'descuentos': [10, 0, 0],
               'items': [{'articulo_id': 'ART-001', 'cantidad': 10, 'precio_lista': 1000}], 'neto': 1, 'iva': 1, 'total': 1}
        entrada = self.mov('MOV-000001', cantidad=10, costo_unitario=900, referencia='FC-0001')
        r = self.lote('OPERACIONES', {'op': 'insert', 'tabla': 'facturas', 'fila': fac}, entrada)
        self.assertEqual(r.status_code, 200, r.content)
        d = self.datos('facturas', 'FC-0001')
        self.assertEqual((d['neto'], d['iva'], d['total']), (9000, 1710, 10710))

    def test_factura_duplicada_y_descuentos_invalidos(self):
        self.lote('OPERACIONES', *self.compra(1))
        dup = {'op': 'insert', 'tabla': 'facturas', 'fila': {'id': 'FC-0002', 'numero': 'N1', 'proveedor_id': 'PRV-001',
                                                              'items': [{'articulo_id': 'ART-001', 'cantidad': 1, 'precio_lista': 5}]}}
        self.assertEqual(self.lote('OPERACIONES', dup).status_code, 409)
        mucho = {**dup, 'fila': {**dup['fila'], 'numero': 'N2', 'descuentos': [5, 5, 5, 5]}}
        self.assertEqual(self.lote('OPERACIONES', mucho).status_code, 422)

    def test_nota_de_credito_no_excede_la_factura(self):
        self.lote('OPERACIONES', *self.compra(1, 10, 1000))  # neto 10.000
        nc = lambda n, neto: {'op': 'insert', 'tabla': 'notas_credito', 'fila': {
            'id': f'NC-{n:04d}', 'factura_id': 'FC-0001', 'numero': str(n), 'neto': neto, 'motivo': 'bonificación', 'total': 1}}
        self.assertEqual(self.lote('OPERACIONES', nc(1, 6000)).status_code, 200)
        self.assertEqual(self.lote('OPERACIONES', nc(2, 6000)).status_code, 422)
        self.assertEqual(self.datos('notas_credito', 'NC-0001')['total'], 7140)
