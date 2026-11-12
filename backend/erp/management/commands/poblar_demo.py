from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from erp.demo.mundo import Mundo


class Command(BaseCommand):
    help = ('Puebla la base con datos de demostración: ~1000 artículos con SKU para imprimir stickers QR, 16 técnicos con cuenta, clientes, presupuestos, obras '
            '(por hacer, en curso, hechas y cobradas), hojas de servicio, bodega con retiros, flota con revisiones al día, por vencer y vencidas, y fichas y contratos. '
            'Es idempotente (si el catálogo ya está completo no hace nada) y atómico (todo o nada).')

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Permite ejecutar con DEBUG=False (servidor público).')

    def handle(self, *args, force=False, **opts):
        if not settings.DEBUG and not force:
            raise CommandError('Con DJANGO_DEBUG=False hay que pasar --force (las cuentas nuevas necesitan FYAG_SEED_PASSWORD o se generan al azar).')
        m = Mundo(salida=self.stdout.write)
        if not m.poblar():
            return
        self.stdout.write(self.style.SUCCESS('\nDatos creados:'))
        for k, v in sorted(m.resumen.items()):
            self.stdout.write(f'  {k:<26}{v}')
        bajo = sum(1 for a in m.articulos_ if m.stock_final[a['id']] < a['stock_minimo'])
        self.stdout.write(f'\nArtículos bajo su stock mínimo: {bajo} · sin stock: {sum(1 for a in m.articulos_ if m.stock_final[a["id"]] <= 0)}')
        self.stdout.write('\nTécnicos (cada uno entra a la app con su correo; en el primer ingreso vinculan su autenticador):')
        for t in m.tecnicos:
            clave = '(la de FYAG_SEED_PASSWORD)' if m.unica else m.claves.get(t['usuario'].email, 'Tecnico-FYAG-2026' if not m.publico else '(ya existía: no se cambió)')
            self.stdout.write(f"  {t['ficha']}  {t['usuario'].email:<42}{clave}")
        if m.claves:
            self.stdout.write(self.style.WARNING('Guarda estas contraseñas ahora: no se vuelven a mostrar.'))
