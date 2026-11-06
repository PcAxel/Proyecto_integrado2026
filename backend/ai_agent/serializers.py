import io

from django.conf import settings
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers


class FacturaEntradaSerializer(serializers.Serializer):
    """Texto extraído por OCR y/o la imagen de la factura. El rol NO viene aquí: lo decide el servidor."""
    texto = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    imagen = serializers.ImageField(required=False)

    def validate_texto(self, v):
        if len(v) > settings.AI_MAX_CHARS_TEXTO:
            raise serializers.ValidationError(f'El texto supera el máximo de {settings.AI_MAX_CHARS_TEXTO} caracteres.')
        return v

    def validate_imagen(self, f):
        if f.size > settings.AI_MAX_BYTES_IMAGEN:
            raise serializers.ValidationError('La imagen supera los 5 MB.')
        try:
            Image.open(io.BytesIO(f.read())).verify()  # contenido real, no el Content-Type declarado
        except (UnidentifiedImageError, OSError):
            raise serializers.ValidationError('El archivo no es una imagen válida.')
        finally:
            f.seek(0)
        return f

    def validate(self, attrs):
        texto, imagen = attrs.get('texto', ''), attrs.get('imagen')
        if not texto and not imagen:
            raise serializers.ValidationError('Envía el texto extraído de la factura (OCR) o su imagen.')
        if imagen and not settings.AI_SOPORTA_IMAGEN:
            if not texto:
                raise serializers.ValidationError({'imagen': 'Este servidor no procesa imágenes directamente: envía el texto extraído por OCR.'})
            attrs.pop('imagen')  # con texto disponible, la imagen no se manda al modelo
        return attrs


class ReporteEntradaSerializer(serializers.Serializer):
    notas = serializers.CharField(min_length=5, trim_whitespace=True)

    def validate_notas(self, v):
        if len(v) > settings.AI_MAX_CHARS_NOTAS:
            raise serializers.ValidationError(f'Las notas superan el máximo de {settings.AI_MAX_CHARS_NOTAS} caracteres.')
        return v


class MensajeChatSerializer(serializers.Serializer):
    # Solo turnos de persona y de asistente: el cliente no puede inyectar mensajes `system`.
    role = serializers.ChoiceField(choices=['user', 'assistant'])
    content = serializers.CharField(trim_whitespace=True, max_length=10_000)


class ChatEntradaSerializer(serializers.Serializer):
    """Historial de la conversación (el cliente lo conserva; el servidor no guarda nada). El rol sale del usuario autenticado."""
    mensajes = MensajeChatSerializer(many=True, allow_empty=False)

    def validate_mensajes(self, msgs):
        if len(msgs) > settings.AI_CHAT_MAX_MENSAJES:
            msgs = msgs[-settings.AI_CHAT_MAX_MENSAJES:]  # la conversación larga se recorta por el principio
        if msgs[-1]['role'] != 'user':
            raise serializers.ValidationError('El último mensaje debe ser del usuario.')
        if any(len(m['content']) > settings.AI_CHAT_MAX_CHARS_MENSAJE for m in msgs):
            raise serializers.ValidationError(f'Cada mensaje puede tener hasta {settings.AI_CHAT_MAX_CHARS_MENSAJE:,} caracteres.'.replace(',', '.'))
        if sum(len(m['content']) for m in msgs) > settings.AI_CHAT_MAX_CHARS_TOTAL:
            raise serializers.ValidationError('La conversación es demasiado larga. Empieza una nueva.')
        return msgs
