"""IP real del cliente. Solo se confía en `X-Forwarded-For` de los proxies que nosotros operamos (PROXIES_DE_CONFIANZA).

Con 0 proxies la cabecera se ignora por completo: cualquiera puede enviarla y falsificar su IP en la evidencia.
Con N proxies, el cliente es la N-ésima dirección desde la derecha: las anteriores las escribió el propio cliente.
"""
import ipaddress

from django.conf import settings


def ip_cliente(request):
    remota = request.META.get('REMOTE_ADDR')
    n = settings.PROXIES_DE_CONFIANZA
    cabecera = request.META.get('HTTP_X_FORWARDED_FOR')
    if n <= 0 or not cabecera:
        return remota
    direcciones = [d.strip() for d in cabecera.split(',') if d.strip()]
    candidata = direcciones[-min(n, len(direcciones))]
    try:
        return str(ipaddress.ip_address(candidata))
    except ValueError:
        return remota
