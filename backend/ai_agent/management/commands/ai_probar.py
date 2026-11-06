"""Verifica a mano qué responde el agente según el rol, usando la API real de DeepSeek.

  python manage.py ai_probar --rol TECNICO --tarea reporte --texto "cambie filtro, limpie serpentin, recargue 2kg r410a"
  python manage.py ai_probar --rol FINANZAS --tarea factura --texto "Frigotec Ltda. Factura 4821 05-11-2026 Neto 100.000 IVA 19.000 Total 119.000"
  python manage.py ai_probar --rol RRHH --tarea chat --texto "Ayúdame a redactar una amonestación por atraso"
  python manage.py ai_probar --rol TECNICO --tarea factura      # debe rechazarse: un técnico no puede extraer facturas
  python manage.py ai_probar --rol FINANZAS --tarea factura --solo-prompt   # muestra qué se enviaría, sin llamar a la API
"""
import json
from types import SimpleNamespace

from django.core.management.base import BaseCommand, CommandError

from ai_agent import prompts, services


class Command(BaseCommand):
    help = 'Prueba el agente de IA para un rol y una tarea (consume tokens de la API real, salvo --solo-prompt).'

    def add_arguments(self, parser):
        parser.add_argument('--rol', required=True, choices=['ADMIN', 'FINANZAS', 'OPERACIONES', 'TECNICO', 'RRHH'])
        parser.add_argument('--tarea', required=True, choices=['factura', 'reporte', 'chat'])
        parser.add_argument('--texto', default='', help='Texto de la factura (OCR) o notas del trabajo.')
        parser.add_argument('--solo-prompt', action='store_true', help='No llama a la API: muestra el system prompt y los mensajes.')

    def handle(self, *args, rol, tarea, texto, solo_prompt, **opts):
        if tarea == 'chat':
            if not texto:
                raise CommandError('Indica --texto con tu mensaje.')
            self.stdout.write(self.style.MIGRATE_HEADING(f'System prompt de conversación para {rol}:'))
            self.stdout.write(prompts.system_prompt_chat(rol) + '\n')
            if solo_prompt:
                return
            try:
                self.stdout.write(services.conversar(SimpleNamespace(pk=0), rol, [{'role': 'user', 'content': texto}]))
            except services.ServicioIAError as e:
                raise CommandError(f'{e.code}: {e.mensaje}')
            return
        if rol not in prompts.PROMPT_POR_TAREA[tarea]:
            self.stdout.write(self.style.WARNING(f'✔ Correcto: el rol {rol} NO puede usar la tarea «{tarea}» (el endpoint respondería 403).'))
            return
        if not texto:
            raise CommandError('Indica --texto con el contenido a procesar.')
        etiqueta = 'factura_ocr' if tarea == 'factura' else 'notas_trabajo'
        mensajes = services.construir_mensajes(rol, tarea, etiqueta, texto)
        self.stdout.write(self.style.MIGRATE_HEADING(f'System prompt para {rol} · {tarea}:'))
        self.stdout.write(mensajes[0]['content'] + '\n')
        if solo_prompt:
            return
        usuario = SimpleNamespace(pk=0)
        try:
            if tarea == 'factura':
                self.stdout.write(json.dumps(services.extraer_factura(usuario, rol, texto), ensure_ascii=False, indent=2))
            else:
                self.stdout.write(services.redactar_reporte(usuario, rol, texto)['informe'])
        except services.ServicioIAError as e:
            raise CommandError(f'{e.code}: {e.mensaje}')
