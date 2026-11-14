from django.test import SimpleTestCase, TestCase

from config.middleware import ApexSecurityMiddleware


class CabecerasApexTests(TestCase):
    def esperar(self, r):
        self.assertEqual((r['X-Powered-By'], r['X-Author']), ('Apex Systems Core', 'Axel Plata'))

    def test_van_en_respuestas_correctas_y_de_error(self):
        self.esperar(self.client.get('/api/health/'))                     # 200
        self.esperar(self.client.get('/api/auth/me/'))                    # 401
        self.esperar(self.client.get('/api/no-existe/'))                  # 404
        self.esperar(self.client.delete('/api/health/'))                  # 405
        self.esperar(self.client.post('/api/auth/login/', {}, content_type='application/json'))  # 400

    def test_van_tambien_en_el_admin_y_las_redirecciones(self):
        self.esperar(self.client.get('/admin/'))

    def test_no_revela_la_tecnologia_real(self):
        r = self.client.get('/api/health/')
        for valor in (r['X-Powered-By'], r['X-Author']):
            self.assertFalse(any(x in valor.lower() for x in ('django', 'python', 'gunicorn', 'rest')))


class MiddlewareAisladoTests(SimpleTestCase):
    def test_agrega_las_dos_cabeceras_a_cualquier_respuesta(self):
        from django.http import HttpResponse, StreamingHttpResponse
        for respuesta in (HttpResponse('x'), StreamingHttpResponse(iter([b'a', b'b']))):
            r = ApexSecurityMiddleware(lambda _req, resp=respuesta: resp)(None)
            self.assertEqual((r['X-Powered-By'], r['X-Author']), ('Apex Systems Core', 'Axel Plata'))
