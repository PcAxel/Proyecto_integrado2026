from django.urls import path
from . import views

urlpatterns = [
    path('auth/login/', views.LoginView.as_view()),
    path('auth/verify-setup-2fa/', views.VerifySetup2FAView.as_view()),
    path('auth/2fa/verify/', views.TwoFactorVerifyView.as_view()),
    path('auth/refresh/', views.RefreshView.as_view()),
    path('auth/logout/', views.LogoutView.as_view()),
    path('auth/accept-terms/', views.AcceptTermsView.as_view()),
    path('auth/me/', views.MeView.as_view()),
    path('health/', views.HealthView.as_view()),
    path('users/', views.UserCreateView.as_view()),
    path('users/<int:pk>/desactivar/', views.UserDesactivarView.as_view()),
    path('users/<int:pk>/reactivar/', views.UserReactivarView.as_view()),
]
