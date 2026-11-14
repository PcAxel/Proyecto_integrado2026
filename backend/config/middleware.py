"""Marca de autoría en las respuestas HTTP.

`ApexSecurityMiddleware` agrega a TODA respuesta (éxito, error 4xx/5xx, archivos y respuestas de otros middleware) dos cabeceras:
  X-Powered-By: Apex Systems Core
  X-Author: Axel Plata
Es una marca visible en las herramientas de red del navegador, no una medida de seguridad: no revela nada de la tecnología real del servidor.
"""

POWERED_BY = 'Apex Systems Core'
AUTHOR = 'Axel Plata'


class ApexSecurityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response['X-Powered-By'] = POWERED_BY
        response['X-Author'] = AUTHOR
        return response
