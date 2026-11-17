"""Roles corporativos (Super Admin, Ejecutivo Comercial, Auditor Externo): qué ven y qué pueden hacer, validado en el servidor."""
from rest_framework_simplejwt.tokens import AccessToken

from .test_erp import ErpBase

CLIENTE = {'op': 'insert', 'tabla': 'clientes', 'fila': {'id': 'CLI-002', 'rut': '99.000.002-6', 'razon_social': 'Cliente nuevo'}}
PROVEEDOR = {'op': 'insert', 'tabla': 'proveedores', 'fila': {'id': 'PRV-002', 'rut': '99.100.002-K', 'razon_social': 'Proveedor nuevo'}}


class SuperAdminTests(ErpBase):
    def test_administra_accesos_pero_no_ve_el_negocio(self):
        self.as_role('SUPERADMIN')
        self.assertEqual(self.client.get('/api/users/').status_code, 200)
        r = self.client.post('/api/users/', {'email': 'nuevo@fyag.cl', 'first_name': 'N', 'last_name': 'N', 'role': 'COMERCIAL'}, format='json')
        self.assertEqual(r.status_code, 201)
        s = self.snap('SUPERADMIN')
        self.assertEqual((s['presupuestos'], s['obras'], s['cardex'], s['clientes'], s['personal']), ([], [], [], [], []))
        self.assertIn('email', s['usuarios'][0])  # usuarios.ver

    def test_estado_del_sistema_es_solo_de_ti_y_no_expone_claves(self):
        self.as_role('SUPERADMIN')
        r = self.client.get('/api/sistema/estado/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.data), {'servicios', 'integraciones', 'accesos', 'entorno'})
        self.assertIsInstance(r.data['integraciones']['ia'], bool)
        self.assertIsInstance(r.data['integraciones']['correo'], bool)
        self.assertEqual(r.data['accesos']['por_rol']['AUDITOR'], 1)
        for rol in ('ADMIN', 'FINANZAS', 'OPERACIONES', 'RRHH', 'COMERCIAL', 'AUDITOR', 'TECNICO'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/sistema/estado/').status_code, 403, rol)

    def test_no_escribe_tablas_de_negocio(self):
        self.assertEqual(self.lote('SUPERADMIN', CLIENTE).status_code, 403)

    def test_solo_gestores_administran_usuarios(self):
        for rol in ('COMERCIAL', 'AUDITOR', 'FINANZAS', 'OPERACIONES', 'RRHH', 'TECNICO'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/users/').status_code, 403, rol)
        self.as_role('ADMIN')  # la Gerencia lo conserva mientras no haya área de TI
        self.assertEqual(self.client.get('/api/users/').status_code, 200)


class ComercialTests(ErpBase):
    def test_ve_presupuestos_clientes_y_catalogo_para_cotizar(self):
        s = self.snap('COMERCIAL')
        self.assertEqual([c['id'] for c in s['clientes']], ['CLI-001'])
        self.assertIn('costo_unitario', s['articulos'][0])       # necesita el costo para simular el margen
        self.assertIn('costo_hora_hombre', s['personal'][0])
        self.assertNotIn('rut', s['personal'][0])                # pero no los datos personales del trabajador
        self.assertEqual((s['proveedores'], s['obras'], s['cardex'], s['facturas'], s['auditoria']), ([], [], [], [], []))
        self.assertNotIn('email', s['usuarios'][0])

    def test_gestiona_clientes_pero_no_proveedores(self):
        self.assertEqual(self.lote('COMERCIAL', CLIENTE).status_code, 200)
        self.assertEqual(self.lote('COMERCIAL', {'op': 'patch', 'tabla': 'clientes', 'id': 'CLI-001', 'cambios': {'giro': 'Frutícola'}}).status_code, 200)
        self.assertEqual(self.lote('COMERCIAL', PROVEEDOR).status_code, 403)
        self.assertEqual(self.lote('COMERCIAL', {'op': 'patch', 'tabla': 'proveedores', 'id': 'PRV-001', 'cambios': {'comuna': 'X'}}).status_code, 403)

    def test_no_factura(self):
        self.as_role('COMERCIAL')
        self.assertEqual(self.client.get('/api/facturacion/OB-0001/').status_code, 403)
        self.assertEqual(self.client.post('/api/facturacion/emitir/OB-0001/', {}, format='json').status_code, 403)


class AuditorTests(ErpBase):
    def con_token(self, rol):
        """Sesión real (JWT): la regla de solo lectura vive en la autenticación, que `force_authenticate` se salta."""
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.users[rol])}')

    def test_lee_todo_el_negocio(self):
        s = self.snap('AUDITOR')
        for tabla in ('obras', 'clientes', 'proveedores', 'hojas', 'articulos', 'personal'):
            self.assertTrue(s[tabla], tabla)
        self.assertNotIn('email', s['usuarios'][0])  # los accesos son de TI, no de la auditoría

    def test_lee_facturacion_y_finiquitos(self):
        self.con_token('AUDITOR')
        self.assertNotEqual(self.client.get('/api/facturacion/OB-0001/').status_code, 403)
        self.assertEqual(self.client.get('/api/rrhh/finiquitos/').status_code, 200)
        self.assertEqual(self.client.get('/api/rrhh/contratos/').status_code, 200)

    def test_todo_lo_que_no_es_lectura_se_rechaza(self):
        self.con_token('AUDITOR')
        for metodo, url in (('post', '/api/erp/lote/'), ('post', '/api/facturacion/emitir/OB-0001/'), ('post', '/api/users/'), ('post', '/api/ai/chat/'),
                            ('post', '/api/rrhh/finiquitos/'), ('patch', '/api/rrhh/finiquitos/1/'), ('delete', '/api/rrhh/contratos/1/'), ('post', '/api/presupuestos/')):
            r = getattr(self.client, metodo)(url, {}, format='json')
            self.assertEqual((r.status_code, r.data.get('code')), (403, 'solo_lectura'), f'{metodo} {url}')
        self.assertEqual(self.client.get('/api/erp/snapshot/').status_code, 200)

    def test_los_demas_roles_siguen_escribiendo_con_su_token(self):
        self.con_token('FINANZAS')
        r = self.client.post('/api/erp/lote/', {'ops': [CLIENTE]}, format='json')
        self.assertEqual(r.status_code, 200)


class CambioDeRolTests(ErpBase):
    """Cambiar un rol es una acción crítica: solo quien administra accesos, nunca sobre sí mismo."""

    def url(self, rol):
        return f'/api/users/{self.users[rol].pk}/'

    def test_solo_los_gestores_cambian_roles(self):
        for rol in ('FINANZAS', 'OPERACIONES', 'RRHH', 'COMERCIAL', 'AUDITOR', 'TECNICO'):
            self.as_role(rol)
            r = self.client.patch(self.url('TECNICO'), {'role': 'ADMIN'}, format='json')
            self.assertEqual(r.status_code, 403, rol)
        self.users['TECNICO'].refresh_from_db()
        self.assertEqual(self.users['TECNICO'].role, 'TECNICO')

    def test_el_super_admin_cambia_un_rol_y_ajusta_el_acceso_tecnico(self):
        self.as_role('SUPERADMIN')
        r = self.client.patch(self.url('OPERACIONES'), {'role': 'COMERCIAL', 'first_name': 'Ana'}, format='json')
        self.assertEqual((r.status_code, r.data['role'], r.data['first_name']), (200, 'COMERCIAL', 'Ana'))
        r = self.client.patch(self.url('RRHH'), {'role': 'SUPERADMIN'}, format='json')
        self.users['RRHH'].refresh_from_db()
        self.assertTrue(self.users['RRHH'].is_staff)
        self.client.patch(self.url('RRHH'), {'role': 'RRHH'}, format='json')
        self.users['RRHH'].refresh_from_db()
        self.assertFalse(self.users['RRHH'].is_staff or self.users['RRHH'].is_superuser)

    def test_nadie_cambia_su_propio_rol_ni_deja_a_la_gerencia_sin_administrador(self):
        self.as_role('SUPERADMIN')
        r = self.client.patch(self.url('SUPERADMIN'), {'role': 'ADMIN'}, format='json')
        self.assertEqual((r.status_code, r.data['code']), (403, 'self_role'))
        self.assertEqual(self.client.patch(self.url('SUPERADMIN'), {'first_name': 'Yo'}, format='json').status_code, 200)  # su nombre sí
        r = self.client.patch(self.url('ADMIN'), {'role': 'FINANZAS'}, format='json')
        self.assertEqual((r.status_code, r.data['code']), (409, 'last_admin'))
        self.assertEqual(self.client.patch(self.url('TECNICO'), {'role': 'JEFE'}, format='json').status_code, 400)  # rol inexistente


class ResumenTributarioTests(ErpBase):
    def test_lo_ven_gerencia_finanzas_y_auditoria(self):
        from django.utils import timezone

        from facturacion.models import FacturaDTE
        FacturaDTE.objects.create(orden_id='OB-0001', folio_sii=10001, estado_sii='ACEPTADO', pdf_archivo='x.pdf', monto_neto=100_000, monto_iva=19_000,
                                  monto_total=119_000, emitido_en=timezone.now())
        FacturaDTE.objects.create(orden_id='OB-0002', estado_sii='RECHAZADO', monto_neto=50_000, monto_iva=9_500, monto_total=59_500)
        for rol in ('ADMIN', 'FINANZAS', 'AUDITOR'):
            self.as_role(rol)
            r = self.client.get('/api/facturacion/resumen/')
            self.assertEqual(r.status_code, 200, rol)
            self.assertEqual(r.data['mes'], {'emitidas': 1, 'neto': 100_000, 'iva': 19_000, 'total': 119_000})
            self.assertEqual((r.data['rechazadas'], r.data['ultimo_folio'], r.data['tasa_iva']), (1, 10001, 19))
        for rol in ('OPERACIONES', 'RRHH', 'COMERCIAL', 'SUPERADMIN', 'TECNICO'):
            self.as_role(rol)
            self.assertEqual(self.client.get('/api/facturacion/resumen/').status_code, 403, rol)


class AccionesCriticasTests(ErpBase):
    """Las cuatro acciones críticas responden 403 a quien no tiene el permiso, sin depender de lo que oculte la interfaz."""

    def test_emitir_dte(self):
        for rol in ('OPERACIONES', 'RRHH', 'COMERCIAL', 'SUPERADMIN', 'TECNICO'):
            self.as_role(rol)
            self.assertEqual(self.client.post('/api/facturacion/emitir/OB-0001/', {}, format='json').status_code, 403, rol)

    def test_modificar_stock(self):
        for rol in ('FINANZAS', 'RRHH', 'COMERCIAL', 'SUPERADMIN', 'ADMIN'):
            r = self.lote(rol, self.mov('MOV-000001', tipo='SALIDA_OBRA', cantidad=1))
            self.assertEqual((r.status_code, r.data['code']), (403, 'permission_denied'), rol)

    def test_aprobar_presupuestos(self):
        from erp.models import Registro
        Registro.objects.create(tabla='presupuestos', rid='PRE-0001', datos={'estado': 'ENVIADO', 'cliente_id': 'CLI-001', 'items': []})
        aprobar = {'op': 'patch', 'tabla': 'presupuestos', 'id': 'PRE-0001', 'cambios': {'estado': 'APROBADO'}}
        for rol in ('COMERCIAL', 'OPERACIONES', 'RRHH', 'SUPERADMIN', 'TECNICO'):
            self.assertEqual(self.lote(rol, aprobar).status_code, 403, rol)
