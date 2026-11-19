from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from erp.demo import compras_cruce


class Command(BaseCommand):
    help = ('Crea órdenes de compra, recepciones y facturas de demostración con distintos estados de conciliación (conciliada, pendiente de recepción, faltante, '
            'sobre lo pedido, artículo no pedido, precio mayor y liberada). Es idempotente: si ya hay órdenes de compra no hace nada.')

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Permite ejecutar con DEBUG=False (servidor público).')

    def handle(self, *args, force=False, **opts):
        if not settings.DEBUG and not force:
            raise CommandError('Con DJANGO_DEBUG=False hay que pasar --force: son datos de demostración.')
        n = compras_cruce.poblar(self.stdout.write)
        self.stdout.write(self.style.SUCCESS(f'{n} escenario(s) de compras creados.') if n else 'No se creó nada.')
