"""Conteo físico con aprobación y trazabilidad por lote / cilindro."""
from erp.escritura import uid
from erp.models import Registro

from .test_erp import ErpBase, crear
from .test_negocio import Negocio


class ConteoTests(Negocio):
    def setUp(self):
        super().setUp()
        self.lote('OPERACIONES', *self.compra(1, 10))  # stock del sistema: 10

    def contar(self, contado, motivo='', id='CNT-0001', rol='OPERACIONES', **extra):
        return self.insertar(rol, 'conteos', {'id': id, 'articulo_id': 'ART-001', 'contado': contado, 'motivo': motivo, **extra})

    def ajuste(self, id, cantidad, signo, conteo='CNT-0001'):
        return {'op': 'insert', 'tabla': 'cardex', 'fila': {
            'id': id, 'tipo': 'AJUSTE_CONTEO', 'fecha': '2026-11-05T10:00:00', 'articulo_id': 'ART-001', 'cantidad': cantidad,
            'costo_unitario': 1000, 'signo': signo, 'obra_id': None, 'usuario_id': 'U-1', 'referencia': conteo,
            'reversa_de': None, 'salida_origen_id': None}}

    def aprobar_ops(self, mov_id, cantidad, signo):
        return [self.ajuste(mov_id, cantidad, signo),
                {'op': 'patch', 'tabla': 'conteos', 'id': 'CNT-0001', 'cambios': {'estado': 'APROBADO', 'movimiento_id': mov_id}}]

    def test_conteo_que_coincide_queda_conforme_sin_movimiento(self):
        self.assertEqual(self.contar(10).status_code, 200)
        d = self.datos('conteos', 'CNT-0001')
        self.assertEqual((d['estado'], d['diferencia'], d['stock_sistema']), ('CONFORME', 0, 10))

    def test_el_servidor_calcula_la_diferencia_y_pide_motivo(self):
        self.assertEqual(self.contar(7).status_code, 422)  # diferencia -3 sin motivo
        r = self.contar(7, 'faltan 3 por rotura', diferencia=0, stock_sistema=7, estado='CONFORME')  # el cliente miente: se ignora
        self.assertEqual(r.status_code, 200, r.content)
        d = self.datos('conteos', 'CNT-0001')
        self.assertEqual((d['estado'], d['diferencia'], d['stock_sistema'], d['valor_diferencia']), ('PENDIENTE', -3, 10, -3000))
        self.assertEqual(d['creado_por'], uid(self.users['OPERACIONES']))

    def test_roles_y_validaciones_al_contar(self):
        self.assertEqual(self.contar(5, 'x' * 6, rol='FINANZAS').status_code, 403)  # Finanzas aprueba, no cuenta
        self.assertEqual(self.contar(-1, 'motivo largo').status_code, 422)
        self.assertEqual(self.contar(7, 'faltan 3').status_code, 200)
        self.assertEqual(self.contar(6, 'otra vez', id='CNT-0002').status_code, 409)  # ya hay uno pendiente

    def test_aprobar_genera_el_ajuste_y_cambia_el_stock(self):
        self.contar(7, 'faltan 3 por rotura')
        r = self.lote('FINANZAS', *self.aprobar_ops('MOV-000002', 3, -1))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.datos('conteos', 'CNT-0001')['estado'], 'APROBADO')
        from erp import reglas
        movs = [x.fila() for x in Registro.objects.filter(tabla='cardex')]
        self.assertEqual(reglas.stock(movs, 'ART-001'), 7)

    def test_el_ajuste_debe_ser_exactamente_la_diferencia(self):
        self.contar(7, 'faltan 3')
        self.assertEqual(self.lote('FINANZAS', *self.aprobar_ops('MOV-000002', 2, -1)).status_code, 422)
        self.assertEqual(self.lote('FINANZAS', *self.aprobar_ops('MOV-000002', 3, 1)).status_code, 422)

    def test_quien_cuenta_no_aprueba_y_operaciones_no_ajusta(self):
        self.contar(7, 'faltan 3')
        self.assertEqual(self.lote('OPERACIONES', *self.aprobar_ops('MOV-000002', 3, -1)).status_code, 403)
        Registro.objects.filter(tabla='conteos', rid='CNT-0001').update(datos={**self.datos('conteos', 'CNT-0001'), 'creado_por': uid(self.users['FINANZAS'])})
        self.assertEqual(self.lote('FINANZAS', *self.aprobar_ops('MOV-000002', 3, -1)).status_code, 403)  # separación de funciones
        self.assertEqual(self.lote('ADMIN', *self.aprobar_ops('MOV-000002', 3, -1)).status_code, 200)

    def test_sin_el_movimiento_no_se_puede_marcar_aprobado(self):
        self.contar(7, 'faltan 3')
        r = self.parchar('FINANZAS', 'conteos', 'CNT-0001', {'estado': 'APROBADO', 'movimiento_id': 'MOV-000099'})
        self.assertEqual(r.status_code, 422)

    def test_si_el_stock_cambio_desde_el_conteo_hay_que_recontar(self):
        self.contar(7, 'faltan 3')
        self.lote('OPERACIONES', self.mov('MOV-000002', 'SALIDA_OBRA', 2))  # el stock real pasa a 8
        self.assertEqual(self.lote('FINANZAS', *self.aprobar_ops('MOV-000003', 3, -1)).status_code, 409)

    def test_rechazar_exige_motivo_y_no_toca_el_stock(self):
        self.contar(7, 'faltan 3')
        self.assertEqual(self.parchar('FINANZAS', 'conteos', 'CNT-0001', {'estado': 'RECHAZADO'}).status_code, 422)
        self.assertEqual(self.parchar('FINANZAS', 'conteos', 'CNT-0001', {'estado': 'RECHAZADO', 'motivo_rechazo': 'volver a contar'}).status_code, 200)
        self.assertEqual(Registro.objects.filter(tabla='cardex').count(), 1)
        self.assertEqual(self.parchar('FINANZAS', 'conteos', 'CNT-0001', {'estado': 'APROBADO'}).status_code, 409)  # ya resuelto

    def test_un_ajuste_aprobado_no_se_reversa(self):
        self.contar(7, 'faltan 3')
        self.lote('FINANZAS', *self.aprobar_ops('MOV-000002', 3, -1))
        rev = self.mov('MOV-000003', 'REVERSA', 3, signo=1, reversa_de='MOV-000002', referencia='deshacer el ajuste')
        self.assertEqual(self.lote('OPERACIONES', rev).status_code, 422)

    def test_el_ajuste_solo_nace_de_un_conteo(self):
        self.assertEqual(self.lote('FINANZAS', self.ajuste('MOV-000002', 3, -1, conteo='CNT-9999')).status_code, 409)
        self.assertEqual(self.lote('OPERACIONES', self.ajuste('MOV-000002', 3, -1)).status_code, 403)


class LoteTests(Negocio):
    def setUp(self):
        super().setUp()
        self.lote('OPERACIONES', *self.compra(1, 10))  # entrada MOV-000001: 10 unidades

    def nuevo(self, n, cantidad=1, tipo='SERIE', **extra):
        return self.insertar('OPERACIONES', 'lotes', {'id': f'LOT-{n:04d}', 'articulo_id': 'ART-001', 'movimiento_id': 'MOV-000001',
                                                       'tipo': tipo, 'cantidad': cantidad, **extra})

    def test_el_codigo_lo_fija_el_servidor_y_nace_de_una_compra(self):
        self.assertEqual(self.nuevo(1, codigo='MENTIRA').status_code, 200)
        d = self.datos('lotes', 'LOT-0001')
        self.assertEqual((d['codigo'], d['factura_id']), ('ART-001-L0001'.replace('ART-001', 'REF-1'), 'FC-0001'))

    def test_no_se_etiqueta_mas_de_lo_comprado(self):
        self.assertEqual(self.nuevo(1, 6, 'LOTE').status_code, 200)
        self.assertEqual(self.nuevo(2, 5, 'LOTE').status_code, 422)  # 6 + 5 > 10
        self.assertEqual(self.nuevo(2, 4, 'LOTE').status_code, 200)

    def test_serie_es_de_una_unidad_y_los_datos_se_validan(self):
        self.assertEqual(self.nuevo(1, 2, 'SERIE').status_code, 422)
        self.assertEqual(self.nuevo(1, 1, 'RARO').status_code, 422)
        self.assertEqual(self.nuevo(1, 1, vencimiento='mañana').status_code, 422)
        self.assertEqual(self.insertar('OPERACIONES', 'lotes', {'id': 'LOT-0001', 'articulo_id': 'ART-001', 'movimiento_id': 'MOV-999', 'tipo': 'SERIE', 'cantidad': 1}).status_code, 422)

    def test_solo_operaciones_crea_lotes_y_son_inmutables(self):
        self.assertEqual(self.insertar('FINANZAS', 'lotes', {'id': 'LOT-0001', 'articulo_id': 'ART-001', 'movimiento_id': 'MOV-000001', 'tipo': 'SERIE', 'cantidad': 1}).status_code, 403)
        self.nuevo(1)
        self.assertEqual(self.parchar('OPERACIONES', 'lotes', 'LOT-0001', {'cantidad': 99}).status_code, 403)

    def test_salida_por_lote_descuenta_del_lote_y_respeta_su_saldo(self):
        self.nuevo(1, 4, 'LOTE')
        ok = self.mov('MOV-000002', 'SALIDA_OBRA', 3, lote_id='LOT-0001')
        self.assertEqual(self.lote('OPERACIONES', ok).status_code, 200)
        de_mas = self.mov('MOV-000003', 'SALIDA_OBRA', 2, lote_id='LOT-0001')  # el lote tiene 1
        self.assertEqual(self.lote('OPERACIONES', de_mas).status_code, 422)
        sin_lote = self.mov('MOV-000003', 'SALIDA_OBRA', 2)  # del stock general sí hay
        self.assertEqual(self.lote('OPERACIONES', sin_lote).status_code, 200)

    def test_el_lote_debe_ser_del_mismo_articulo_y_las_entradas_no_llevan_lote(self):
        crear('articulos', 'ART-002', sku='OTRO', nombre='Otro', activo=True, costo_unitario=1, stock_minimo=0)
        self.nuevo(1)
        otro = self.mov('MOV-000002', 'SALIDA_OBRA', 1, lote_id='LOT-0001', articulo_id='ART-002')
        self.assertEqual(self.lote('OPERACIONES', otro).status_code, 422)
        self.assertEqual(self.lote('OPERACIONES', *self.compra(2, 1), ).status_code, 200)
        entrada = self.compra(3, 1)
        entrada[1]['fila']['lote_id'] = 'LOT-0001'
        self.assertEqual(self.lote('OPERACIONES', *entrada).status_code, 422)

    def test_reversa_y_reingreso_conservan_el_lote(self):
        self.nuevo(1, 4, 'LOTE')
        self.lote('OPERACIONES', self.mov('MOV-000002', 'SALIDA_OBRA', 3, lote_id='LOT-0001'))
        sin = self.mov('MOV-000003', 'REINGRESO_SOBRANTE', 1, salida_origen_id='MOV-000002', obra_id='OB-0001')
        self.assertEqual(self.lote('OPERACIONES', sin).status_code, 422)  # perdió el lote
        con = self.mov('MOV-000003', 'REINGRESO_SOBRANTE', 1, salida_origen_id='MOV-000002', obra_id='OB-0001', lote_id='LOT-0001')
        self.assertEqual(self.lote('OPERACIONES', con).status_code, 200)
        from erp import reglas
        lote = Registro.objects.get(tabla='lotes', rid='LOT-0001').fila()
        movs = [x.fila() for x in Registro.objects.filter(tabla='cardex')]
        self.assertEqual(reglas.restante_lote(lote, movs), 2)  # 4 - 3 + 1
