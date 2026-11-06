from django.utils import timezone
from rest_framework import serializers

from .models import MarcaAsistencia


class MarcaSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarcaAsistencia
        fields = ('id', 'tipo', 'fecha', 'lat', 'lng', 'obra', 'client_id')
        read_only_fields = ('id',)
        extra_kwargs = {'fecha': {'required': False}, 'client_id': {'required': False}}

    def validate_fecha(self, value):
        if value > timezone.now() + timezone.timedelta(minutes=2):
            raise serializers.ValidationError('La hora de la marca no puede ser futura.')
        return value

    def validate_lat(self, v):
        if not -90 <= v <= 90:
            raise serializers.ValidationError('Latitud inválida.')
        return v

    def validate_lng(self, v):
        if not -180 <= v <= 180:
            raise serializers.ValidationError('Longitud inválida.')
        return v
