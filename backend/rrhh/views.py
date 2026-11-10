import mimetypes

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
import hashlib

import pyotp
from django.core.cache import cache
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.ip import ip_cliente
from django.http import FileResponse
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import CustomUser, Role

from .models import Contrato, DocumentoLaboral, DocumentoRRHH, FichaTrabajador, Finiquito
from . import sellado
from .permissions import AccionesPorRol, acciones
from .serializers import (CalculoSerializer, ContratoSerializer, FichaTrabajadorSerializer, DocumentoLaboralSerializer, DocumentoSerializer, FirmaSerializer, MiDocumentoSerializer, FiniquitoSerializer, PersonalSerializer,
                          serializer_de_edicion)

CRUD = acciones('list', 'retrieve', 'create', 'partial_update', 'destroy')
LECTURA = acciones('list', 'retrieve')


def entregar(campo):
    """Descarga controlada: siempre como adjunto y sin que el navegador adivine el tipo."""
    if not campo:
        raise NotFound('No hay archivo.')
    resp = FileResponse(campo.open('rb'), as_attachment=True, filename=campo.name.rsplit('/', 1)[-1],
                        content_type=mimetypes.guess_type(campo.name)[0] or 'application/octet-stream')
    resp['X-Content-Type-Options'] = 'nosniff'
    resp['Cache-Control'] = 'private, no-store'
    return resp


class ContratoViewSet(viewsets.ModelViewSet):
    """RR. HH. y Admin: CRUD. Finanzas: solo lectura. Un contrato finiquitado no se toca ni se borra."""
    serializer_class = ContratoSerializer
    permission_classes = [AccionesPorRol]
    acciones_por_rol = {Role.ADMIN: CRUD, Role.RRHH: CRUD, Role.FINANZAS: LECTURA}
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = Contrato.objects.select_related('empleado', 'finiquito')
        if emp := self.request.query_params.get('empleado'):
            qs = qs.filter(empleado_id=emp)
        return qs

    def perform_destroy(self, c):
        if c.estado == Contrato.Estado.FINIQUITADO or hasattr(c, 'finiquito'):
            raise ValidationError('Un contrato con finiquito no se puede eliminar.')
        c.delete()


class DocumentoViewSet(viewsets.ModelViewSet):
    """Amonestaciones, anexos y cartas: contienen datos laborales sensibles, por eso Finanzas no tiene acceso."""
    serializer_class = DocumentoSerializer
    permission_classes = [AccionesPorRol]
    acciones_por_rol = {Role.ADMIN: CRUD | {'archivo'}, Role.RRHH: CRUD | {'archivo'}}
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = DocumentoRRHH.objects.select_related('empleado')
        if emp := self.request.query_params.get('empleado'):
            qs = qs.filter(empleado_id=emp)
        return qs

    def perform_create(self, s):
        s.save(subido_por=self.request.user)

    @action(detail=True, methods=['get'])
    def archivo(self, request, pk=None):
        return entregar(self.get_object().archivo_pdf)


class FiniquitoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin,
                       mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    RR. HH.: crea y corrige el cálculo (mientras está pendiente); no toca `estado_pago`.
    Finanzas: solo registra el pago (estado → PAGADO + comprobante).
    Admin: supervisión completa. Un finiquito pagado es inmutable para todos.
    """
    permission_classes = [AccionesPorRol]
    acciones_por_rol = {
        Role.ADMIN: CRUD | {'calcular', 'comprobante'},
        Role.RRHH: acciones('list', 'retrieve', 'create', 'partial_update', 'calcular', 'comprobante'),
        Role.FINANZAS: acciones('list', 'retrieve', 'partial_update', 'comprobante'),
    }
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = Finiquito.objects.select_related('contrato__empleado')
        if estado := self.request.query_params.get('estado_pago'):
            qs = qs.filter(estado_pago=estado)
        return qs

    def get_serializer_class(self):
        return FiniquitoSerializer

    def create(self, request, *args, **kwargs):
        s = CalculoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if Finiquito.objects.filter(contrato=s.validated_data['contrato']).exists():
            raise ValidationError({'contrato': 'Este contrato ya tiene un finiquito.'})
        return Response(FiniquitoSerializer(s.crear(request.user)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        f = self.get_object()
        clase = serializer_de_edicion(request, f, request.data)
        s = clase(f, data=request.data, partial=True, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save()
        return Response(FiniquitoSerializer(Finiquito.objects.select_related('contrato__empleado').get(pk=f.pk)).data)

    def perform_destroy(self, f):
        if f.estado_pago != Finiquito.EstadoPago.PENDIENTE:
            raise ValidationError('Un finiquito pagado no se puede eliminar.')
        f.delete()

    @action(detail=False, methods=['post'])
    def calcular(self, request):
        """Vista previa de montos sin guardar nada: es la misma función que usa `create`."""
        s = CalculoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        m = s.montos()
        return Response({'anios_servicio': m.anios_servicio, 'indemnizacion_anios': m.indemnizacion_anios, 'indemnizacion_aviso': m.indemnizacion_aviso,
                         'monto_indemnizacion': m.indemnizacion, 'vacaciones': m.vacaciones, 'monto_total': m.total})

    @action(detail=True, methods=['get'])
    def comprobante(self, request, pk=None):
        return entregar(self.get_object().comprobante_pago)


class PersonalViewSet(viewsets.GenericViewSet, mixins.ListModelMixin):
    """Tabla de personal con su estado contractual."""
    serializer_class = PersonalSerializer
    permission_classes = [AccionesPorRol]
    acciones_por_rol = {Role.ADMIN: acciones('list'), Role.RRHH: acciones('list')}

    def get_queryset(self):
        contratos = Prefetch('contratos', queryset=Contrato.objects.select_related('finiquito').order_by('-fecha_inicio', '-id'))
        return CustomUser.objects.filter(is_active=True).select_related('ficha').prefetch_related(contratos).order_by('first_name', 'last_name', 'email')


class FichaTrabajadorViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Ficha laboral y previsional (RUT, AFP, salud, tipo de contrato, ingreso). La cuenta de acceso la crea el Administrador; esta ficha la
    completa y edita RR. HH. (o el Administrador). Contiene datos personales y previsionales: no la ven Finanzas, Operaciones ni los técnicos.
    Las fichas no se eliminan."""
    serializer_class = FichaTrabajadorSerializer
    permission_classes = [AccionesPorRol]
    acciones_por_rol = {Role.ADMIN: acciones('list', 'retrieve', 'create', 'update', 'partial_update', 'opciones'),
                        Role.RRHH: acciones('list', 'retrieve', 'create', 'update', 'partial_update', 'opciones')}

    def get_queryset(self):
        qs = FichaTrabajador.objects.select_related('usuario')
        if u := self.request.query_params.get('usuario'):
            qs = qs.filter(usuario_id=u)
        return qs

    def perform_create(self, s):
        s.save(actualizado_por=self.request.user)

    def perform_update(self, s):
        s.save(actualizado_por=self.request.user)

    @action(detail=False, methods=['get'])
    def opciones(self, request):
        """Listas cerradas para los formularios: AFP, sistema de salud, isapres y tipos de contrato."""
        def lista(choices):
            return [{'value': v, 'label': l} for v, l in choices]
        return Response({'afp': lista(FichaTrabajador.AFP.choices), 'sistema_salud': lista(FichaTrabajador.SistemaSalud.choices),
                         'isapre': lista(FichaTrabajador.Isapre.choices), 'tipo_contrato': lista(FichaTrabajador.TipoContrato.choices)})


class DocumentoLaboralViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """RR. HH. sube el PDF y lo asigna (queda PENDIENTE). No se edita: para corregir se elimina el pendiente y se sube otro.
    Un documento firmado no se puede eliminar."""
    serializer_class = DocumentoLaboralSerializer
    permission_classes = [AccionesPorRol]
    acciones_por_rol = {Role.ADMIN: acciones('list', 'retrieve', 'create', 'destroy', 'archivo', 'firma', 'firmado'),
                        Role.RRHH: acciones('list', 'retrieve', 'create', 'destroy', 'archivo', 'firma', 'firmado')}
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = DocumentoLaboral.objects.select_related('trabajador')
        if t := self.request.query_params.get('trabajador'):
            qs = qs.filter(trabajador_id=t)
        if e := self.request.query_params.get('estado'):
            qs = qs.filter(estado=e)
        return qs

    def perform_create(self, s):
        s.save(subido_por=self.request.user)

    def perform_destroy(self, d):
        if d.estado == DocumentoLaboral.Estado.FIRMADO:
            raise ValidationError('Un documento firmado es evidencia y no se puede eliminar.')
        d.delete()

    @action(detail=True, methods=['get'])
    def archivo(self, request, pk=None):
        return entregar(self.get_object().archivo_pdf)

    @action(detail=True, methods=['get'])
    def firma(self, request, pk=None):
        return entregar(self.get_object().firma_imagen)

    @action(detail=True, methods=['get'])
    def firmado(self, request, pk=None):
        return entregar(self.get_object().archivo_firmado)


class MisDocumentosViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """El trabajador ve únicamente sus propios contratos y anexos. Filtrar por dueño hace que los ajenos devuelvan 404."""
    serializer_class = MiDocumentoSerializer

    def get_queryset(self):
        qs = DocumentoLaboral.objects.filter(trabajador=self.request.user)
        if e := self.request.query_params.get('estado'):
            qs = qs.filter(estado=e)
        return qs

    @action(detail=True, methods=['get'])
    def archivo(self, request, pk=None):
        return entregar(self.get_object().archivo_pdf)

    @action(detail=True, methods=['get'])
    def firmado(self, request, pk=None):
        return entregar(self.get_object().archivo_firmado)


class FirmarDocumentoView(APIView):
    """POST /api/rrhh/firmar-documento/<id>/ con {"firma": "<PNG Base64>", "codigo_2fa": "123456"}.

    - Solo firma el dueño del documento (RR. HH. o Admin reciben 404): nadie firma por el trabajador.
    - El código 2FA acredita que quien dibuja es el titular de la cuenta y no alguien con su teléfono desbloqueado.
    - IP y hora las fija el servidor; el trazo es único del documento (su huella no puede repetirse en otro).
    - Resultado: PDF original intacto + PDF firmado con hoja de constancia.
    """
    parser_classes = [JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'firma'

    @transaction.atomic
    def post(self, request, pk):
        doc = get_object_or_404(DocumentoLaboral.objects.select_related('trabajador').select_for_update(), pk=pk, trabajador=request.user)
        if doc.estado == DocumentoLaboral.Estado.FIRMADO:
            raise ValidationError('Este documento ya fue firmado.')
        s = FirmaSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        verificar_2fa(request.user, s.validated_data['codigo_2fa'])
        png = s.validated_data['firma']
        hash_firma = hashlib.sha256(png).hexdigest()
        if DocumentoLaboral.objects.filter(hash_firma=hash_firma).exists():
            raise ValidationError('Esa firma ya se usó en otro documento. Dibújala de nuevo para este.')
        if hash_de(doc.archivo_pdf) != doc.hash_pdf:
            raise ValidationError('El documento fue alterado después de subirse. Avisa a Recursos Humanos.')

        ahora, ip = timezone.now(), ip_cliente(request)
        try:
            with doc.archivo_pdf.open('rb') as original:
                firmado = sellado.sellar_pdf(original, doc=doc, firmante=request.user, firma_png=png, ip=ip, fecha=ahora,
                                             hash_original=doc.hash_pdf, hash_firma=hash_firma)
        except sellado.PdfInvalido as e:
            raise ValidationError(str(e))
        doc.firma_imagen.save('firma.png', ContentFile(png), save=False)
        doc.archivo_firmado.save('firmado.pdf', ContentFile(firmado), save=False)
        doc.hash_firma, doc.hash_firmado = hash_firma, hashlib.sha256(firmado).hexdigest()
        doc.ip_firma, doc.agente_firma, doc.fecha_firma = ip, request.META.get('HTTP_USER_AGENT', '')[:255], ahora
        doc.estado = DocumentoLaboral.Estado.FIRMADO
        doc.save()
        return Response(MiDocumentoSerializer(doc).data)


def verificar_2fa(usuario, codigo):
    """Código TOTP vigente y no usado antes: un código espiado o repetido no sirve para firmar."""
    if not (usuario.is_2fa_enabled and usuario.otp_secret):
        raise ValidationError({'codigo_2fa': 'Activa la verificación en dos pasos para poder firmar.'})
    if not pyotp.TOTP(usuario.otp_secret).verify(codigo, valid_window=1):
        raise ValidationError({'codigo_2fa': 'El código de verificación no es válido.'})
    if not cache.add(f'firma-otp:{usuario.pk}:{codigo}', 1, 120):
        raise ValidationError({'codigo_2fa': 'Ese código ya se usó. Espera el siguiente.'})


def hash_de(campo):
    from .archivos import sha256
    with campo.open('rb') as f:
        return sha256(f)
