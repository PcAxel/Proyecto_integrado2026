import io
import uuid

from django.test import override_settings
from PIL import Image
from pymongo.errors import PyMongoError

from accounts.tests.base import RoleTestCase
from evidencias import mongo
from erp.models import Registro
from obras.models import ReporteTerreno


def png_bytes(size=(8, 8)):
    buf = io.BytesIO()
    Image.new('RGB', size, (200, 30, 30)).save(buf, 'PNG')
    return buf.getvalue()


def upload(content=None, name='foto.png', ctype='image/png'):
    from django.core.files.uploadedfile import SimpleUploadedFile
    return SimpleUploadedFile(name, content if content is not None else png_bytes(), content_type=ctype)


class MongoTestCase(RoleTestCase):
    """Usa una base Mongo exclusiva por ejecución y la elimina al terminar."""

    def setUp(self):
        super().setUp()
        self.db_name = f'fyag_test_{uuid.uuid4().hex[:8]}'
        self.override = override_settings(MONGO_DB_NAME=self.db_name)
        self.override.enable()
        try:
            mongo.ping()
        except PyMongoError:
            self.override.disable()
            self.skipTest('MongoDB no disponible (configura MONGO_URI)')

    def tearDown(self):
        mongo.get_client().drop_database(self.db_name)
        self.override.disable()


class MongoConnectionTests(MongoTestCase):
    def test_ping(self):
        self.assertEqual(mongo.ping()['ok'], 1.0)

    def test_insert_and_read_back(self):
        _id = mongo.get_evidencias().insert_one({'x': 1}).inserted_id
        self.assertEqual(mongo.get_evidencias().find_one({'_id': _id})['x'], 1)


class EvidenciaFlowTests(MongoTestCase):
    def setUp(self):
        super().setUp()
        self.obra = Registro.objects.create(tabla='obras', rid='OB-0001', datos={'nombre': 'Cámara fría'})
        self.form = {'obra': 'OB-0001', 'latitud': '-33.4489', 'longitud': '-70.6693',
                     'descripcion': 'Compresor instalado', 'dispositivo_modelo': 'Pixel 7',
                     'dispositivo_so': 'Android 15', 'app_version': '0.1.0'}

    def post(self, **extra):
        return self.client.post('/api/evidencias/', {**self.form, 'foto': upload(), **extra}, format='multipart')

    def test_upload_stores_in_mongo_and_only_objectid_in_mysql(self):
        tec = self.as_role('TECNICO')
        r = self.post()
        self.assertEqual(r.status_code, 201, r.data)
        oid = r.data['evidencia_id']

        reporte = ReporteTerreno.objects.get(pk=r.data['reporte_id'])
        self.assertEqual(reporte.evidencia_id, oid)
        self.assertEqual(len(oid), 24)

        from bson import ObjectId
        doc = mongo.get_evidencias().find_one({'_id': ObjectId(oid)})
        self.assertEqual(doc['tecnico_id'], tec.pk)
        self.assertEqual(doc['gps']['latitud'], -33.4489)
        self.assertEqual(doc['dispositivo']['modelo'], 'Pixel 7')
        self.assertIsNotNone(doc['capturada_en'])
        self.assertEqual(doc['foto']['content_type'], 'image/png')

        # La foto se recupera íntegra desde GridFS
        foto = self.client.get(f'/api/evidencias/{oid}/foto/')
        self.assertEqual(foto.status_code, 200)
        self.assertEqual(foto['Content-Type'], 'image/png')
        self.assertEqual(foto.content, png_bytes())
        self.assertEqual(self.client.get(f'/api/evidencias/{oid}/').data['gps']['longitud'], -70.6693)

    def test_rejects_non_image_even_with_image_content_type(self):
        self.as_role('TECNICO')
        r = self.post(foto=upload(b'<script>alert(1)</script>', 'x.png', 'image/png'))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(mongo.get_evidencias().count_documents({}), 0)

    def test_rejects_invalid_gps(self):
        self.as_role('TECNICO')
        self.assertEqual(self.post(latitud='91').status_code, 400)

    def test_rejects_oversized(self):
        self.as_role('TECNICO')
        with override_settings(EVIDENCIA_MAX_BYTES=10):
            self.assertEqual(self.post().status_code, 400)

    def test_finanzas_cannot_upload(self):
        self.as_role('FINANZAS')
        self.assertEqual(self.post().status_code, 403)

    def test_technician_sees_only_own_evidence(self):
        self.as_role('TECNICO')
        oid = self.post().data['evidencia_id']
        # otro técnico
        from accounts.models import CustomUser
        from django.utils import timezone
        otro = CustomUser.objects.create_user('otro@fyag.cl', 'Clave-Segura-123', role='TECNICO',
                                              terms_accepted_at=timezone.now())
        self.client.force_authenticate(otro)
        self.assertEqual(self.client.get(f'/api/evidencias/{oid}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/evidencias/{oid}/foto/').status_code, 404)
        self.assertEqual(len(self.client.get('/api/reportes/').data), 0)
        # operaciones sí ve todo
        self.as_role('OPERACIONES')
        self.assertEqual(self.client.get(f'/api/evidencias/{oid}/').status_code, 200)

    def test_invalid_oid_is_404(self):
        self.as_role('OPERACIONES')
        self.assertEqual(self.client.get('/api/evidencias/no-es-un-oid/').status_code, 404)

    def test_mongo_down_returns_503_and_creates_no_report(self):
        self.as_role('TECNICO')
        with override_settings(MONGO_URI='mongodb://127.0.0.1:1'):
            mongo._client = None  # fuerza reconexión a la URI inválida
            try:
                r = self.post()
            finally:
                mongo._client = None
        self.assertEqual(r.status_code, 503)
        self.assertEqual(ReporteTerreno.objects.count(), 0)


class EvidenciaMongoFuncionesTests(MongoTestCase):
    """Capa de datos (crear, obtener, listar_por_obra, eliminar) sin pasar por HTTP."""

    def nueva(self, obra='OB-1', tecnico=1, contenido=None):
        return mongo.crear(obra_id=obra, tecnico_id=tecnico, foto_bytes=contenido or png_bytes(), content_type='image/png',
                           gps={'latitud': -36.6, 'longitud': -72.1, 'precision_m': 5}, descripcion='prueba')

    def test_crear_guarda_foto_en_gridfs_y_metadatos(self):
        contenido = png_bytes()
        doc = self.nueva(contenido=contenido)
        guardado = mongo.obtener(str(doc['_id']))
        self.assertEqual(guardado['obra_id'], 'OB-1')
        self.assertEqual(guardado['foto']['size'], len(contenido))
        self.assertEqual(mongo.leer_foto(guardado), contenido)

    def test_obtener_con_id_invalido_o_inexistente_devuelve_none(self):
        self.assertIsNone(mongo.obtener('no-es-un-id'))
        self.assertIsNone(mongo.obtener('0' * 24))

    def test_listar_por_obra_filtra_y_ordena_de_mas_reciente_a_mas_antigua(self):
        from datetime import timedelta
        from django.utils import timezone
        base = timezone.now()
        for i in range(3):
            d = self.nueva(obra='OB-1')
            mongo.get_evidencias().update_one({'_id': d['_id']}, {'$set': {'capturada_en': base + timedelta(minutes=i)}})
        self.nueva(obra='OB-2')
        lista = mongo.listar_por_obra('OB-1')
        self.assertEqual(len(lista), 3)
        self.assertEqual([d['capturada_en'] for d in lista], sorted((d['capturada_en'] for d in lista), reverse=True))
        self.assertEqual(len(mongo.listar_por_obra('OB-1', limite=2)), 2)

    def test_listar_por_obra_puede_limitarse_a_un_tecnico(self):
        self.nueva(tecnico=1)
        self.nueva(tecnico=2)
        self.assertEqual(len(mongo.listar_por_obra('OB-1', tecnico_id=2)), 1)

    def test_eliminar_borra_documento_y_archivo(self):
        doc = self.nueva()
        self.assertTrue(mongo.eliminar(str(doc['_id'])))
        self.assertIsNone(mongo.obtener(str(doc['_id'])))
        self.assertEqual(mongo.get_db()['fotos_terreno.files'].count_documents({}), 0)
        self.assertFalse(mongo.eliminar(str(doc['_id'])))
