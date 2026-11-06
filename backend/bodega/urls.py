from rest_framework.routers import DefaultRouter

from .views import ArticuloViewSet, CardexViewSet

router = DefaultRouter()
router.register('articulos', ArticuloViewSet)
router.register('cardex', CardexViewSet, basename='cardex')
urlpatterns = router.urls
