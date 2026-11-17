"""Flujo de obra entre áreas: Jefe de Operaciones delega y audita; Finanzas recibe el aviso; la factura cierra el flujo."""
from erp import flujo
from erp.models import Registro
from notificaciones.models import Notification

from .test_erp import crear
from .test_negocio import Negocio


class FlujoObraTests(Negocio):
    def setUp(self):
        super().setUp()
        crear('obras', 'OB-0009', nombre='Cámara 9', tecnicos=[], estado='PLANIFICADA', etapa='CREADO', presupuesto_id='PRE-0009',
              sobrantes_conciliados=True, pendientes_sync=0)
        crear('presupuestos', 'PRE-0009', estado='APROBADO')

    def obra(self, rid='OB-0009'):
        return Registro.objects.get(tabla='obras', rid=rid).datos

    def delegar(self, rol, tecnicos=('T-01',), obra='OB-0009'):
        self.as_role(rol)
        return self.client.post(f'/api/erp/obras/{obra}/delegar/', {'tecnicos': list(tecnicos)}, format='json')

    def auditar(self, rol, obra='OB-0009'):
        self.as_role(rol)
        return self.client.post(f'/api/erp/obras/{obra}/auditoria-ok/', {}, format='json')

    def dejar_lista_para_cierre(self):
        crear('hojas', 'HS-0009', obra_id='OB-0009', tecnico_id='T-01', estado='APROBADA', horas_trabajadas=8, costo_hora_hombre=9000)

    def test_delegar_asigna_tecnicos_y_pone_la_obra_en_curso(self):
        r = self.delegar('OPERACIONES')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((self.obra()['estado'], self.obra()['etapa'], self.obra()['tecnicos']), ('EN_CURSO', 'ASIGNADO_A_TERRENO', ['T-01']))
        log = Registro.objects.filter(tabla='auditoria').last().datos
        self.assertEqual((log['accion'], log['entidad_id'], log['rol'], log['anterior']['etapa'], log['nuevo']['etapa']), ('DELEGAR_A_TERRENO', 'OB-0009', 'SUPERVISOR', 'CREADO', 'ASIGNADO_A_TERRENO'))

    def test_solo_el_jefe_de_operaciones_delega(self):
        for rol in ('JEFE_BODEGA', 'FINANZAS', 'ADMIN', 'TECNICO', 'AUDITOR', 'COMERCIAL', 'RRHH'):
            self.assertEqual(self.delegar(rol).status_code, 403, rol)
        self.assertEqual(self.obra()['etapa'], 'CREADO')

    def test_delegar_exige_tecnicos_validos_y_obra_no_finalizada(self):
        self.assertEqual(self.delegar('OPERACIONES', tecnicos=()).status_code, 422)
        self.assertEqual(self.delegar('OPERACIONES', tecnicos=('T-99',)).status_code, 422)
        self.assertEqual(self.delegar('OPERACIONES', obra='OB-9999').status_code, 404)

    def test_redelegar_no_hace_retroceder_una_obra_en_ejecucion(self):
        self.delegar('OPERACIONES')
        Registro.objects.filter(tabla='obras', rid='OB-0009').update(datos={**self.obra(), 'etapa': 'EN_EJECUCION'})
        self.delegar('OPERACIONES', tecnicos=('T-01', 'T-02'))
        self.assertEqual(self.obra()['etapa'], 'EN_EJECUCION')

    def test_auditoria_ok_finaliza_y_avisa_solo_a_finanzas(self):
        self.delegar('OPERACIONES')
        self.dejar_lista_para_cierre()
        r = self.auditar('OPERACIONES')
        self.assertEqual(r.status_code, 200, r.content)
        o = self.obra()
        self.assertEqual((o['estado'], o['etapa']), ('FINALIZADA', 'AUDITORIA_TERRENO_OK'))
        self.assertEqual(Registro.objects.filter(tabla='auditoria').last().datos['accion'], 'AUDITORIA_TERRENO_OK')
        avisos = Notification.objects.all()
        self.assertEqual({n.usuario_destino.role for n in avisos}, {'FINANZAS'})
        self.assertEqual(avisos.count(), 1)
        n = avisos.first()
        self.assertEqual((n.tipo, n.leida), ('FACTURACION_LISTA', False))
        self.assertEqual(n.mensaje, 'Auditoría de Terreno completada para la Obra Cámara 9 (OB-0009). Lista para facturar.')

    def test_auditoria_ok_rechazada_si_no_cumple_el_cierre_y_no_avisa(self):
        self.delegar('OPERACIONES')  # sin hojas auditadas
        r = self.auditar('OPERACIONES')
        self.assertEqual(r.status_code, 422)
        self.assertIn('horas', r.json()['detail'])
        self.assertEqual(Notification.objects.count(), 0)
        self.assertEqual(self.obra()['estado'], 'EN_CURSO')

    def test_auditoria_ok_exige_obra_delegada_y_permiso(self):
        self.assertEqual(self.auditar('OPERACIONES').status_code, 409)  # sin delegar
        self.delegar('OPERACIONES')
        self.dejar_lista_para_cierre()
        for rol in ('JEFE_BODEGA', 'FINANZAS', 'TECNICO', 'AUDITOR'):
            self.assertEqual(self.auditar(rol).status_code, 403, rol)
        self.assertEqual(self.auditar('OPERACIONES').status_code, 200)
        self.assertEqual(self.auditar('OPERACIONES').status_code, 409)  # una sola vez
        self.assertEqual(Notification.objects.count(), 1)

    def test_el_boton_finalizar_del_panel_de_cierre_tambien_avisa(self):
        self.dejar_lista_para_cierre()
        crear('obras', 'OB-0010', nombre='Otra', tecnicos=['T-01'], estado='EN_CURSO', presupuesto_id='PRE-0009', sobrantes_conciliados=True, pendientes_sync=0)
        crear('hojas', 'HS-0010', obra_id='OB-0010', tecnico_id='T-01', estado='APROBADA', horas_trabajadas=5, costo_hora_hombre=9000)
        r = self.parchar('OPERACIONES', 'obras', 'OB-0010', {'estado': 'FINALIZADA', 'fecha_cierre': '2026-11-17'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Notification.objects.filter(tipo='FACTURACION_LISTA').count(), 1)
        self.assertEqual(self.obra('OB-0010')['etapa'], 'AUDITORIA_TERRENO_OK')

    def test_etapa_de_obras_anteriores_al_flujo(self):
        self.assertEqual(flujo.etapa_de({'estado': 'PLANIFICADA'}), 'CREADO')
        self.assertEqual(flujo.etapa_de({'estado': 'EN_CURSO'}), 'EN_EJECUCION')
        self.assertEqual(flujo.etapa_de({'estado': 'FINALIZADA'}), 'AUDITORIA_TERRENO_OK')
        self.assertEqual(flujo.etapa_de({'estado': 'EN_CURSO', 'etapa': 'FACTURADO'}), 'FACTURADO')

    def test_una_obra_nueva_nace_creado_aunque_el_cliente_diga_otra_cosa(self):
        from erp.escritura import siguiente_id
        nuevo = siguiente_id('obras')
        fila = {'id': nuevo, 'nombre': 'Nueva', 'tipo': 'EMERGENCIA', 'cliente_id': 'CLI-001', 'ubicacion': {'lat': -36.6, 'lng': -72.1}, 'etapa': 'FACTURADO'}
        r = self.insertar('OPERACIONES', 'obras', fila)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.obra(nuevo)['etapa'], 'CREADO')

    def test_la_primera_hoja_de_terreno_pone_la_obra_en_ejecucion(self):
        from erp.escritura import marcar_etapa
        self.delegar('OPERACIONES', obra='OB-0009')
        self.assertTrue(marcar_etapa('OB-0009', 'EN_EJECUCION'))
        self.assertFalse(marcar_etapa('OB-0009', 'ASIGNADO_A_TERRENO'))  # nunca retrocede
        self.assertEqual(self.obra()['etapa'], 'EN_EJECUCION')


class AprobacionDeObraTests(Negocio):
    """Una obra nueva espera la aprobación de Finanzas antes de poder delegarse a terreno."""

    def setUp(self):
        super().setUp()
        crear('presupuestos', 'PRE-0020', estado='APROBADO', titulo='Cámara', cliente_id='CLI-001')
        from erp.escritura import siguiente_id
        self.nueva = siguiente_id('obras')
        fila = {'id': self.nueva, 'nombre': 'Cámara nueva', 'tipo': 'INSTALACION', 'cliente_id': 'CLI-001', 'presupuesto_id': 'PRE-0020',
                'ubicacion': {'lat': -36.6, 'lng': -72.1}, 'aprobacion_finanzas': 'APROBADA'}
        self.assertEqual(self.insertar('OPERACIONES', 'obras', fila).status_code, 200)

    def obra(self, rid=None):
        return Registro.objects.get(tabla='obras', rid=rid or self.nueva).datos

    def post(self, rol, accion, datos=None, rid=None):
        self.as_role(rol)
        return self.client.post(f'/api/erp/obras/{rid or self.nueva}/{accion}/', datos or {}, format='json')

    def test_nace_pendiente_aunque_el_cliente_diga_aprobada_y_avisa_a_finanzas(self):
        self.assertEqual(self.obra()['aprobacion_finanzas'], 'PENDIENTE')
        n = Notification.objects.get()
        self.assertEqual((n.usuario_destino.role, n.tipo), ('FINANZAS', 'GENERAL'))
        self.assertIn(self.nueva, n.mensaje)
        self.assertIn('Espera tu aprobación', n.mensaje)

    def test_mientras_esta_pendiente_no_se_delega_ni_se_inicia(self):
        r = self.post('OPERACIONES', 'delegar', {'tecnicos': ['T-01']})
        self.assertEqual(r.status_code, 409)
        self.assertIn('aprobación de Finanzas', r.json()['detail'])
        self.assertEqual(self.parchar('OPERACIONES', 'obras', self.nueva, {'estado': 'EN_CURSO'}).status_code, 409)
        self.assertEqual(self.obra()['estado'], 'PLANIFICADA')

    def test_finanzas_aprueba_y_le_avisa_a_operaciones_que_ya_puede_delegar(self):
        self.assertEqual(self.post('FINANZAS', 'aprobar').status_code, 200)
        o = self.obra()
        self.assertEqual((o['aprobacion_finanzas'], o['motivo_rechazo_finanzas']), ('APROBADA', None))
        aviso = Notification.objects.filter(usuario_destino__role='OPERACIONES').get()
        self.assertIn('Ya puedes delegarla a terreno', aviso.mensaje)
        self.assertEqual(self.post('OPERACIONES', 'delegar', {'tecnicos': ['T-01']}).status_code, 200)
        self.assertEqual(Registro.objects.filter(tabla='auditoria', datos__accion='APROBAR_OBRA').count(), 1)

    def test_solo_finanzas_resuelve_y_una_sola_vez(self):
        for rol in ('OPERACIONES', 'JEFE_BODEGA', 'ADMIN', 'TECNICO', 'AUDITOR', 'COMERCIAL'):
            self.assertEqual(self.post(rol, 'aprobar').status_code, 403, rol)
            self.assertEqual(self.post(rol, 'rechazar', {'motivo': 'x'}).status_code, 403, rol)
        self.assertEqual(self.post('FINANZAS', 'aprobar').status_code, 200)
        self.assertEqual(self.post('FINANZAS', 'aprobar').status_code, 409)
        self.assertEqual(self.post('FINANZAS', 'aprobar', rid='OB-9999').status_code, 404)

    def test_rechazar_exige_motivo_y_se_lo_dice_a_quien_la_creo(self):
        self.assertEqual(self.post('FINANZAS', 'rechazar', {'motivo': '  '}).status_code, 422)
        self.assertEqual(self.post('FINANZAS', 'rechazar', {'motivo': 'El cliente no tiene crédito aprobado'}).status_code, 200)
        o = self.obra()
        self.assertEqual((o['aprobacion_finanzas'], o['motivo_rechazo_finanzas']), ('RECHAZADA', 'El cliente no tiene crédito aprobado'))
        self.assertIn('crédito', Notification.objects.filter(usuario_destino__role='OPERACIONES').get().mensaje)
        self.assertEqual(self.post('OPERACIONES', 'delegar', {'tecnicos': ['T-01']}).status_code, 409)  # rechazada: sigue bloqueada

    def test_no_se_aprueba_sola_por_el_lote_generico(self):
        for cambios in ({'aprobacion_finanzas': 'APROBADA'}, {'tecnicos': ['T-01'], 'aprobacion_finanzas': 'APROBADA'}):
            self.assertEqual(self.parchar('OPERACIONES', 'obras', self.nueva, cambios).status_code, 403)
            self.assertEqual(self.parchar('FINANZAS', 'obras', self.nueva, cambios).status_code, 403)
        self.assertEqual(self.obra()['aprobacion_finanzas'], 'PENDIENTE')

    def test_emergencia_nace_exenta_y_las_obras_antiguas_se_consideran_aprobadas(self):
        from erp.escritura import siguiente_id
        nueva = siguiente_id('obras')
        fila = {'id': nueva, 'nombre': 'Falla urgente', 'tipo': 'EMERGENCIA', 'cliente_id': 'CLI-001', 'ubicacion': {'lat': -36.6, 'lng': -72.1}}
        self.assertEqual(self.insertar('OPERACIONES', 'obras', fila).status_code, 200)
        self.assertEqual(self.obra(nueva)['aprobacion_finanzas'], 'EXENTA')
        self.assertTrue(flujo.puede_operar(self.obra(nueva)))
        self.assertEqual(flujo.aprobacion_de({'estado': 'EN_CURSO'}), 'APROBADA')  # obra anterior a la regla: sin campo
        self.assertEqual(Notification.objects.filter(tipo='GENERAL', mensaje__contains=nueva).count(), 0)  # la exenta no molesta a Finanzas
