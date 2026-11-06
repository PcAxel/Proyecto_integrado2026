from rest_framework.routers import DefaultRouter

from .views import TrabajadorViewSet

router = DefaultRouter()
router.register('trabajadores', TrabajadorViewSet)
urlpatterns = router.urls
