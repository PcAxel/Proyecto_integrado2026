import mimetypes
from datetime import date

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Prefetch, Q
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
from ai_agent.throttles import IADiarioThrottle, IARafagaThrottle

from .models import Contrato, DocumentoLaboral, DocumentoRRHH, FichaTrabajador, Finiquito
from . import analitica, sellado
from . import cumplimiento as cu
from .permissions import PuedeVerCumplimiento
from .permissions import AccionesPorRol, acciones
from .serializers import (CalculoSerializer, ContratoSerializer, FichaTrabajadorSerializer, DocumentoLaboralSerializer, DocumentoSerializer, FirmaSerializer, MiDocumentoSerializer, FiniquitoSerializer, PersonalSerializer,
                          nombre_de, serializer_de_edicion)

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
    acciones_por_rol = {Role.ADMIN: CRUD | {'renovar'}, Role.RRHH: CRUD | {'renovar'}, Role.FINANZAS: LECTURA, Role.AUDITOR: LECTURA}
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = Contrato.objects.select_related('empleado', 'finiquito')
        if emp := self.request.query_params.get('empleado'):
            qs = qs.filter(empleado_id=emp)
        return qs

    def create(self, request, *args, **kwargs):
        """Antes de crear un plazo fijo se revisa el historial de la persona (art. 159 N°4). Si el nuevo contrato la deja en riesgo de
        contrato indefinido se responde 409 con la evaluación; RR. HH. puede insistir enviando `confirmar_riesgo_legal: true`."""
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        empleado = s.validated_data['empleado']
        if getattr(getattr(empleado, 'ficha', None), 'tipo_contrato', None) == cu.PLAZO_FIJO:
            previos = [cu.periodo_de(c) for c in Contrato.objects.filter(empleado=empleado).select_related('empleado__ficha', 'finiquito')]
            ev = cu.evaluar_recontratacion(previos, timezone.localdate(), s.validated_data['fecha_inicio'], s.validated_data.get('fecha_termino'))
            if ev['nivel'] != cu.SIN_RIESGO and request.data.get('confirmar_riesgo_legal') is not True:
                return Response({'detail': ev['mensajes'][0], 'code': 'riesgo_indefinido', 'evaluacion': ev}, status=status.HTTP_409_CONFLICT)
        s.save()
        return Response(s.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def renovar(self, request, pk=None):
        """POST /api/rrhh/contratos/<id>/renovar/ {"fecha_termino": "AAAA-MM-DD"} — renueva un plazo fijo y cuenta la renovación.

        La PRIMERA renovación se registra sin más. La SEGUNDA convierte el contrato en indefinido por ley: se responde 409 con la
        advertencia y solo se ejecuta con `aceptar_indefinido: true`, que deja el contrato y la ficha como INDEFINIDO, sin fecha de término."""
        c = self.get_object()
        if c.estado != Contrato.Estado.ACTIVO:
            raise ValidationError('Solo se renueva un contrato activo.')
        if c.tipo_contrato != cu.PLAZO_FIJO:
            raise ValidationError('Solo los contratos a plazo fijo se renuevan.')
        if c.numero_renovacion >= 1:
            if request.data.get('aceptar_indefinido') is not True:
                return Response({'detail': cu.ADVERTENCIA_RENOVACION, 'code': 'segunda_renovacion'}, status=status.HTTP_409_CONFLICT)
            with transaction.atomic():
                FichaTrabajador.objects.filter(usuario=c.empleado).update(tipo_contrato=cu.INDEFINIDO, actualizado_por=request.user)
                c.empleado.ficha.tipo_contrato = cu.INDEFINIDO
                c.numero_renovacion += 1
                c.fecha_termino = None
                c.save(update_fields=['numero_renovacion', 'fecha_termino'])
            return Response(self.get_serializer(c).data)
        try:
            nueva = date.fromisoformat(str(request.data.get('fecha_termino')))
        except ValueError:
            raise ValidationError({'fecha_termino': 'Indica la nueva fecha de término (AAAA-MM-DD).'})
        if not c.fecha_termino or nueva <= c.fecha_termino:
            raise ValidationError({'fecha_termino': 'La nueva fecha debe ser posterior al término actual.'})
        if (nueva - c.fecha_inicio).days + 1 > cu.DIAS_MAX_PLAZO_FIJO:
            raise ValidationError({'fecha_termino': 'Con esa fecha el plazo fijo supera un año: la ley lo considera indefinido.'})
        c.fecha_termino, c.numero_renovacion = nueva, c.numero_renovacion + 1
        c.save(update_fields=['fecha_termino', 'numero_renovacion'])
        return Response(self.get_serializer(c).data)

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
        Role.AUDITOR: acciones('list', 'retrieve', 'comprobante'),  # revisión de cumplimiento: solo lectura
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
    acciones_por_rol = {Role.ADMIN: acciones('list', 'buscar'), Role.RRHH: acciones('list', 'buscar')}

    @action(detail=False, methods=['get'])
    def buscar(self, request):
        """Buscador para elegir una persona: `?search=` (nombre, apellido o correo; hasta 20) o `?ids=1,2` para rehidratar la selección."""
        qs = CustomUser.objects.filter(is_active=True).order_by('first_name', 'last_name', 'email')
        ids = [int(i) for i in str(request.query_params.get('ids', '')).split(',')[:50] if i.strip().isdigit()]
        if ids:
            qs = qs.filter(pk__in=ids)
        else:
            texto = str(request.query_params.get('search', '')).strip()[:60]
            for palabra in texto.split():
                qs = qs.filter(Q(first_name__icontains=palabra) | Q(last_name__icontains=palabra) | Q(email__icontains=palabra))
            qs = qs[:min(int(request.query_params.get('limit', 10) or 10), 20)]
        return Response([{'id': u.id, 'label': nombre_de(u), 'detalle': u.email} for u in qs])

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


class _Cumplimiento(APIView):
    """Cumplimiento laboral y rotación: lectura para RR. HH., Gerencia General y Auditor Externo (acción `cumplimiento.ver`)."""
    permission_classes = [PuedeVerCumplimiento]


class PanelCumplimientoView(_Cumplimiento):
    """GET /api/rrhh/cumplimiento/ — KPIs de rotación, semáforo de plazo fijo, alertas y lista de personas."""

    def get(self, request):
        return Response(analitica.panel(timezone.localdate()))


class HistorialContratacionesView(_Cumplimiento):
    """GET /api/rrhh/cumplimiento/historial/<id>/ — línea de tiempo de una persona: contratos, días trabajados, lagunas y ventana segura."""

    def get(self, request, pk):
        per = analitica.persona_por(empleado=pk)
        if per is None:
            raise NotFound('Esta persona no tiene contratos registrados.')
        return Response(analitica.historial(per, timezone.localdate()))


class EvaluarRecontratacionView(_Cumplimiento):
    """GET /api/rrhh/cumplimiento/evaluar/?rut=12345678-5&fecha_inicio=&fecha_termino= (o ?empleado=<id>) — ¿se puede recontratar a plazo fijo?"""

    def get(self, request):
        q = request.query_params
        per = analitica.persona_por(empleado=q.get('empleado'), rut=q.get('rut')) if (q.get('empleado') or '').isdigit() or q.get('rut') else None
        if per is None:
            raise NotFound('No hay historial de contratos para ese trabajador.')
        try:
            inicio = date.fromisoformat(q['fecha_inicio']) if q.get('fecha_inicio') else None
            termino = date.fromisoformat(q['fecha_termino']) if q.get('fecha_termino') else None
        except ValueError:
            raise ValidationError('Las fechas van como AAAA-MM-DD.')
        hoy = timezone.localdate()
        return Response({'id': per['id'], 'nombre': per['nombre'], 'rut': per['rut'], **cu.tiempos(per['periodos'], hoy),
                         'evaluacion': cu.evaluar_recontratacion(per['periodos'], hoy, inicio, termino)})


class ReporteRotacionIAView(_Cumplimiento):
    """GET /api/rrhh/ia-reporte-rotacion/ — Informe Ejecutivo de Rotación y Riesgo Laboral en Markdown.

    Con clave de IA lo redacta DeepSeek a partir de las métricas (sin nombres ni RUT: viajan códigos y el servidor repone los nombres);
    sin clave, o si el proveedor falla, lo genera el motor analítico del sistema. Es de solo lectura y consume cupo de IA."""
    throttle_classes = [IARafagaThrottle, IADiarioThrottle]

    def get(self, request):
        return Response(analitica.informe_rotacion(request.user, timezone.localdate()))


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
