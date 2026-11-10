from rrhh.models import FichaTrabajador
from rrhh.validadores import digito_verificador


def crear_ficha(usuario, tipo='INDEFINIDO', **extra):
    """Ficha válida para una cuenta (el contrato exige que exista: de ahí sale el tipo de contrato). RUT único derivado del id de la cuenta."""
    cuerpo = str(20_000_000 + usuario.pk)
    datos = dict(rut=f'{cuerpo}-{digito_verificador(cuerpo)}', afp='HABITAT', sistema_salud='FONASA', tipo_contrato=tipo, fecha_ingreso='2022-01-01')
    return FichaTrabajador.objects.create(usuario=usuario, **{**datos, **extra})
