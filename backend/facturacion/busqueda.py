"""Ubica la obra que una persona quiere facturar (por id, nombre o cliente) con SUS permisos de lectura. Solo lee: no emite nada.
Lo usa el agente de IA para llevar a Finanzas o al Administrador hasta la obra correcta; la emisión sigue siendo un clic manual en la pantalla."""
import re
import unicodedata
from dataclasses import dataclass, field

from erp import snapshot

from . import ordenes
from .models import FacturaDTE

MAX_COINCIDENCIAS = 6


def _norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s or '').lower()) if unicodedata.category(c) != 'Mn').strip()


def _id_obra(q):
    """«ob-3», «OB 0003» u «ob_12» → «OB-0003» / «OB-0012». None si no parece un id de obra."""
    m = re.fullmatch(r'ob[-\s_]*0*(\d{1,6})', q.strip().lower())
    return f'OB-{int(m.group(1)):04d}' if m else None


@dataclass
class Candidata:
    id: str
    nombre: str
    cliente: str
    estado_obra: str
    situacion: str                      # 'facturable' | 'emitida' | 'no_facturable'
    detalle: str = ''                   # por qué no se puede, o el folio si ya se emitió
    neto: int = 0
    iva: int = 0
    total: int = 0
    folio: int | None = None

    @property
    def rotulo(self):
        return f'{self.id} · {self.nombre} ({self.cliente})'


@dataclass
class Resultado:
    estado: str                         # 'uno' | 'varios' | 'ninguno'
    obra: Candidata | None = None
    lista: list = field(default_factory=list)


def _evaluar(obra, clientes):
    base = dict(id=obra['id'], nombre=obra.get('nombre', obra['id']), cliente=clientes.get(obra.get('cliente_id'), obra.get('cliente_id') or '—'), estado_obra=obra.get('estado', ''))
    factura = FacturaDTE.objects.filter(orden_id=obra['id']).first()
    if factura is not None and factura.estado_sii == FacturaDTE.EstadoSII.ACEPTADO:
        return Candidata(**base, situacion='emitida', detalle=f'ya tiene factura electrónica (folio {factura.folio_sii})', neto=factura.monto_neto, iva=factura.monto_iva,
                         total=factura.monto_total, folio=factura.folio_sii)
    try:
        o = ordenes.orden_facturable(obra['id'])
    except ordenes.OrdenNoFacturable as e:
        return Candidata(**base, situacion='no_facturable', detalle=e.mensaje)
    return Candidata(**base, situacion='facturable', neto=o.neto, iva=o.iva, total=o.total)


def buscar_para_facturar(user, texto) -> Resultado:
    """Obras que coinciden con lo dicho. Si hay varias, se prefieren las que se pueden facturar; si queda una sola, es la elegida."""
    q = _norm(str(texto)[:120])
    if not q:
        return Resultado('ninguno')
    clientes = {c['id']: c.get('razon_social', c['id']) for c in snapshot.tabla_para(user, 'clientes')}
    obras = snapshot.tabla_para(user, 'obras')
    exacto = _id_obra(q)
    if exacto:
        coinciden = [o for o in obras if o['id'] == exacto]
    else:
        palabras = q.split()
        coinciden = [o for o in obras if all(p in _norm(f"{o['id']} {o.get('nombre', '')} {clientes.get(o.get('cliente_id'), '')}") for p in palabras)]
    if not coinciden:
        return Resultado('ninguno')
    evaluadas = [_evaluar(o, clientes) for o in sorted(coinciden, key=lambda o: o['id'])]
    if len(evaluadas) > 1:
        facturables = [c for c in evaluadas if c.situacion == 'facturable']
        if facturables:
            evaluadas = facturables  # quien dice «quiero facturar» se refiere a lo que se puede facturar
    if len(evaluadas) == 1:
        return Resultado('uno', evaluadas[0])
    return Resultado('varios', lista=evaluadas[:MAX_COINCIDENCIAS])
