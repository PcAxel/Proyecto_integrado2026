from rest_framework.routers import DefaultRouter

from .views import VehiculoViewSet

router = DefaultRouter()
router.register('vehiculos', VehiculoViewSet)
urlpatterns = router.urls
