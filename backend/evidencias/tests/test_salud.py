import io
from contextlib import redirect_stdout
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from rest_framework.test import APITestCase

from evidencias import mongo, salud
from evidencias.tests.test_mongo import MongoTestCase


def correr_comando():
    salida = io.StringIO()
    with redirect_stdout(salida):
        call_command('verificar_conexiones', stdout=salida)
    return salida.getvalue()


class ComprobacionesBasicasTests(TestCase):
    """Sin variables de producción: SQLite y la caché local de Django."""

    def test_base_de_datos_responde(self):
        r = salud.comprobar_postgresql()
        self.assertIn('vendor', r)
        self.assertIn('version', r)

    def test_cache_escribe_lee_y_no_deja_rastro(self):
        salud.comprobar_valkey()
        self.assertEqual(cache.get('verificacion:inexistente'), None)

    def test_cache_limpia_la_clave_aunque_falle_la_lectura(self):
        with mock.patch.object(cache, 'get', return_value='otro'), mock.patch.object(cache, 'delete') as borrar:
            with self.assertRaises(RuntimeError):
                salud.comprobar_valkey()
        borrar.assert_called_once()


class EndpointSaludTests(APITestCase):
    def setUp(self):
        cache.clear()  # el contador de límite de uso vive en la caché y se comparte entre pruebas

    def test_todo_ok_devuelve_200_y_solo_estados(self):
        with mock.patch('evidencias.salud.mongo.ping'):
            r = self.client.get('/api/salud/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {'estado': 'ok', 'postgresql': 'ok', 'valkey': 'ok', 'mongodb': 'ok'})

    def test_un_servicio_caido_devuelve_503_sin_detalles(self):
        with mock.patch('evidencias.salud.mongo.ping', side_effect=Exception('mongodb://usuario:secreto@host/db')):
            r = self.client.get('/api/salud/')
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json(), {'estado': 'fallo', 'postgresql': 'ok', 'valkey': 'ok', 'mongodb': 'fallo'})
        self.assertNotIn('secreto', r.content.decode())

    def test_no_pide_autenticacion(self):
        with mock.patch('evidencias.salud.mongo.ping'):
            self.assertEqual(self.client.get('/api/salud/').status_code, 200)

    def test_respeta_el_limite_de_uso_anonimo(self):
        cache.clear()
        with mock.patch('evidencias.salud.mongo.ping'):
            codigos = [self.client.get('/api/salud/').status_code for _ in range(25)]
        self.assertIn(429, codigos)


class ComandoVerificarTests(TestCase):
    def test_falla_con_codigo_de_error_si_una_base_no_responde(self):
        with mock.patch('evidencias.salud.comprobar_mongodb', side_effect=ConnectionError('mongodb://u:clave@h')):
            salida = io.StringIO()
            with redirect_stdout(salida), self.assertRaises(CommandError) as ctx:
                call_command('verificar_conexiones', stdout=salida)
        self.assertNotIn('clave', salida.getvalue() + str(ctx.exception))
        self.assertIn('MongoDB: FALLO (ConnectionError)', salida.getvalue())
        self.assertIn('PostgreSQL: OK', salida.getvalue())

    def test_mensaje_final_con_las_tres_bases(self):
        with mock.patch('evidencias.salud.comprobar_mongodb'):
            self.assertIn('TODO OK: PostgreSQL, Valkey y MongoDB responden correctamente', correr_comando())


class MongoRealTests(MongoTestCase):
    """Solo corren si hay un MongoDB alcanzable (se saltan solos en la CI)."""

    def test_comprobacion_completa_y_limpieza(self):
        salud.comprobar_mongodb()
        self.assertEqual(mongo.get_db()[salud.COLECCION_PRUEBA].count_documents({}), 0)
        self.assertEqual(mongo.get_db()['fotos_terreno.files'].count_documents({}), 0)

    def test_comando_completo(self):
        self.assertIn('TODO OK', correr_comando())

    def test_endpoint_real(self):
        r = self.client.get('/api/salud/')
        self.assertEqual(r.status_code, 200)
