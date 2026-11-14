"""Lectura de la ORDEN (obra del ERP) que se va a facturar y de sus datos tributarios. Solo lectura: el ERP guarda sus tablas como filas JSON (`erp.Registro`)."""
from dataclasses import dataclass

from erp import dominio as dom
from erp.models import Registro


class OrdenNoFacturable(Exception):
    def __init__(self, mensaje, status=422, code='orden_no_facturable'):
        super().__init__(mensaje)
        self.mensaje, self.status, self.code = mensaje, status, code


@dataclass(frozen=True)
class OrdenFacturable:
    orden_id: str
    receptor_rut: str
    receptor_razon_social: str
    glosa: str
    neto: int
    iva: int
    total: int


def _fila(tabla, rid):
    r = Registro.objects.filter(tabla=tabla, rid=rid).first() if rid else None
    return r.datos if r else None


def orden_facturable(id_orden) -> OrdenFacturable:
    """Datos para facturar la orden, o `OrdenNoFacturable` con el motivo. Reglas: la obra existe, está FINALIZADA, tiene un presupuesto APROBADO con venta
    neta mayor a cero y su cliente tiene RUT y razón social. Los montos salen del presupuesto aprobado en el servidor, nunca de lo que mande el cliente."""
    obra = _fila('obras', id_orden)
    if obra is None:
        raise OrdenNoFacturable('La orden no existe.', 404, 'orden_inexistente')
    if obra.get('estado') != 'FINALIZADA':
        raise OrdenNoFacturable('Solo se factura una obra finalizada.')
    pre = _fila('presupuestos', obra.get('presupuesto_id'))
    if not pre or pre.get('estado') != 'APROBADO':
        raise OrdenNoFacturable('La obra no tiene un presupuesto aprobado que respalde la factura.')
    neto = dom.numero(pre.get('precio_venta_neto'))
    if neto <= 0:
        raise OrdenNoFacturable('El presupuesto aprobado no tiene un precio de venta mayor a cero.')
    cliente = _fila('clientes', obra.get('cliente_id'))
    if not cliente or not cliente.get('rut') or not cliente.get('razon_social'):
        raise OrdenNoFacturable('El cliente de la obra no tiene RUT y razón social registrados.')
    d = dom.desglosar_total(int(neto))
    return OrdenFacturable(id_orden, cliente['rut'], cliente['razon_social'], str(obra.get('nombre') or pre.get('titulo') or id_orden)[:300], d['neto'], d['iva'], d['total'])
