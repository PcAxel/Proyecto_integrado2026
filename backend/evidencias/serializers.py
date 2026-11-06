import io

from django.conf import settings
from django.utils import timezone
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from erp.models import Registro

FORMATOS = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}


class EvidenciaUploadSerializer(serializers.Serializer):
    foto = serializers.FileField()
    obra = serializers.CharField(max_length=30)
    descripcion = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    latitud = serializers.FloatField(min_value=-90, max_value=90)
    longitud = serializers.FloatField(min_value=-180, max_value=180)
    precision_gps_m = serializers.FloatField(required=False, min_value=0)
    capturada_en = serializers.DateTimeField(required=False)
    # Metadatos del equipo reportados por la PWA
    dispositivo_modelo = serializers.CharField(required=False, allow_blank=True, max_length=100)
    dispositivo_so = serializers.CharField(required=False, allow_blank=True, max_length=100)
    app_version = serializers.CharField(required=False, allow_blank=True, max_length=30)

    def validate_obra(self, value):
        if not Registro.objects.filter(tabla='obras', rid=value).exists():
            raise serializers.ValidationError('La obra no existe.')
        return value

    def validate_foto(self, f):
        if f.size > settings.EVIDENCIA_MAX_BYTES:
            raise serializers.ValidationError('La foto excede el tamaño máximo permitido.')
        data = f.read()
        f.seek(0)
        try:
            img = Image.open(io.BytesIO(data))
            img.verify()  # valida el contenido real, no la extensión ni el Content-Type declarado
        except (UnidentifiedImageError, OSError):
            raise serializers.ValidationError('El archivo no es una imagen válida.')
        if img.format not in FORMATOS:
            raise serializers.ValidationError('Formato no permitido (use JPEG, PNG o WebP).')
        f.detected_content_type = FORMATOS[img.format]
        f.bytes = data
        return f

    def validate_capturada_en(self, value):
        if value > timezone.now() + timezone.timedelta(minutes=5):
            raise serializers.ValidationError('La fecha de captura está en el futuro.')
        return value
