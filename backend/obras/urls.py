from rest_framework.routers import DefaultRouter

from .views import ObraViewSet, ReporteTerrenoViewSet

router = DefaultRouter()
router.register('obras', ObraViewSet)
router.register('reportes', ReporteTerrenoViewSet, basename='reporte')
urlpatterns = router.urls
