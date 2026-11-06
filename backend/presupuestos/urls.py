from rest_framework.routers import DefaultRouter

from .views import PresupuestoViewSet

router = DefaultRouter()
router.register('presupuestos', PresupuestoViewSet)
urlpatterns = router.urls
