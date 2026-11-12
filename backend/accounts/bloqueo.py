"""Defensa contra adivinar contraseñas: espera creciente entre intentos y, en oficina, bloqueo a los 5 fallos.

- Oficina (Admin, Finanzas, Operaciones, RR. HH.): esperas de 5 s, 15 s, 30 s y 60 s; el 3.er fallo ofrece recuperar la contraseña (quedan 2 intentos)
  y el 5.º desactiva la cuenta: solo el Administrador la devuelve con «Reactivar».
- Terreno (Técnico): nunca se bloquea por intentos. La espera solo crece (5 s, 30 s, 1 min, 5 min, 10 min… hasta 1 hora).
- Un ingreso correcto, recuperar la contraseña o reactivar la cuenta reinician la cuenta a cero; sin fallos nuevos en 12 horas también se olvida.
- El contador vive en la cuenta (base de datos). Para un correo que no existe se lleva igual en caché, con las mismas reglas, así la respuesta no delata qué correos existen.
"""
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone

from .models import Role

OFICINA = frozenset({Role.ADMIN, Role.FINANZAS, Role.OPERACIONES, Role.RRHH})
MAX_INTENTOS_OFICINA = 5
SUGERIR_RECUPERAR_DESDE = 3
OLVIDO_SEGUNDOS = 12 * 3600
_ESPERA_OFICINA = {1: 5, 2: 15, 3: 30, 4: 60}
_ESPERA_TERRENO = {1: 5, 2: 30, 3: 60}
TOPE_ESPERA_TERRENO = 3600


def es_oficina(rol):
    return rol in OFICINA


def espera_segundos(rol, intentos):
    """Segundos que debe esperar quien lleva `intentos` fallos seguidos."""
    if es_oficina(rol):
        return _ESPERA_OFICINA.get(intentos, 0)
    return _ESPERA_TERRENO.get(intentos) or min((intentos - 3) * 300, TOPE_ESPERA_TERRENO)


def _clave(correo):
    return f'login_fallos:{correo}'


def _estado(intentos, rol, bloqueada=False):
    espera = 0 if bloqueada else espera_segundos(rol, intentos)
    return {
        'intentos_fallidos': intentos,
        # Solo la oficina tiene tope de intentos: el técnico no se queda sin acceso por equivocarse.
        'intentos_restantes': max(MAX_INTENTOS_OFICINA - intentos, 0) if es_oficina(rol) else None,
        'espera_segundos': espera,
        'sugerir_recuperar': intentos >= SUGERIR_RECUPERAR_DESDE,
        'bloqueada': bloqueada,
    }


def _leer(usuario, correo):
    """(intentos, último fallo, espera hasta) vigentes; todo se olvida pasadas 12 horas sin fallos."""
    if usuario:
        n, ultimo, hasta = usuario.intentos_fallidos, usuario.ultimo_fallo_en, usuario.bloqueo_hasta
    else:
        d = cache.get(_clave(correo)) or {}
        n, ultimo, hasta = d.get('n', 0), d.get('ultimo'), d.get('hasta')
    if ultimo and (timezone.now() - ultimo).total_seconds() > OLVIDO_SEGUNDOS:
        return 0, None, None
    return n, ultimo, hasta


def espera_restante(usuario, correo):
    """Segundos que faltan para poder volver a intentar (0 si ya se puede)."""
    _, _, hasta = _leer(usuario, correo)
    return max(int((hasta - timezone.now()).total_seconds() + 0.999), 0) if hasta else 0


def estado_actual(usuario, correo):
    """Estado para mostrar en pantalla (intentos, restantes, espera que falta)."""
    n, _, _ = _leer(usuario, correo)
    e = _estado(n, usuario.role if usuario else Role.ADMIN)
    e['espera_segundos'] = espera_restante(usuario, correo)
    return e


def bloqueada_sin_cuenta(correo):
    """Un correo inexistente alcanzó el tope de oficina: se responde igual que a una cuenta real bloqueada."""
    n, _, _ = _leer(None, correo)
    return n >= MAX_INTENTOS_OFICINA


def registrar_fallo(usuario, correo):
    """Suma un fallo y devuelve el estado para la respuesta. `bloqueada` solo es True en oficina al llegar al tope; bloquear la cuenta lo hace quien llama."""
    n, _, _ = _leer(usuario, correo)
    n += 1
    rol = usuario.role if usuario else Role.ADMIN  # sin cuenta se aplican las reglas de oficina
    bloqueada = es_oficina(rol) and n >= MAX_INTENTOS_OFICINA
    ahora = timezone.now()
    hasta = None if bloqueada else ahora + timedelta(seconds=espera_segundos(rol, n))
    if usuario:
        usuario.intentos_fallidos, usuario.ultimo_fallo_en, usuario.bloqueo_hasta = n, ahora, hasta
        usuario.save(update_fields=['intentos_fallidos', 'ultimo_fallo_en', 'bloqueo_hasta'])
    else:
        cache.set(_clave(correo), {'n': n, 'ultimo': ahora, 'hasta': hasta}, OLVIDO_SEGUNDOS)
    return _estado(n, rol, bloqueada)


def bloquear_cuenta(usuario):
    """Oficina al 5.º fallo: la cuenta queda desactivada y marcada como bloqueada; el Administrador la reactiva desde Usuarios."""
    from .views import _cortar_sesiones
    usuario.is_active = False
    usuario.bloqueada_en = timezone.now()
    usuario.deactivated_at = usuario.bloqueada_en
    usuario.deactivated_by = None
    usuario.save(update_fields=['is_active', 'bloqueada_en', 'deactivated_at', 'deactivated_by'])
    _cortar_sesiones(usuario)


def limpiar(usuario, correo=None):
    """Deja la cuenta (o el correo desconocido) sin fallos ni espera."""
    if usuario:
        if usuario.intentos_fallidos or usuario.ultimo_fallo_en or usuario.bloqueo_hasta or usuario.bloqueada_en:
            usuario.intentos_fallidos, usuario.ultimo_fallo_en, usuario.bloqueo_hasta, usuario.bloqueada_en = 0, None, None, None
            usuario.save(update_fields=['intentos_fallidos', 'ultimo_fallo_en', 'bloqueo_hasta', 'bloqueada_en'])
    if correo:
        cache.delete(_clave(correo))
