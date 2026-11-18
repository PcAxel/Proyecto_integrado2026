from django.urls import path
from . import reset_views, views

urlpatterns = [
    path('auth/login/', views.LoginView.as_view()),
    path('auth/verify-setup-2fa/', views.VerifySetup2FAView.as_view()),
    path('auth/2fa/verify/', views.TwoFactorVerifyView.as_view()),
    path('auth/recuperar/', views.RecuperarSolicitarView.as_view()),
    path('auth/recuperar/confirmar/', views.RecuperarConfirmarView.as_view()),
    path('auth/refresh/', views.RefreshView.as_view()),
    path('auth/logout/', views.LogoutView.as_view()),
    path('auth/accept-terms/', views.AcceptTermsView.as_view()),
    path('auth/me/', views.MeView.as_view()),
    # Recuperar la contraseña con las vistas nativas de Django (enlace por correo): /api/auth/reset/ …
    path('auth/reset/', reset_views.SolicitarRestablecimiento.as_view(), name='password_reset'),
    path('auth/reset/done/', reset_views.RestablecimientoEnviado.as_view(), name='password_reset_done'),
    path('auth/reset/confirm/<uidb64>/<token>/', reset_views.ConfirmarRestablecimiento.as_view(), name='password_reset_confirm'),
    path('auth/reset/complete/', reset_views.RestablecimientoCompleto.as_view(), name='password_reset_complete'),
    path('health/', views.HealthView.as_view()),
    path('users/', views.UserCreateView.as_view()),
    path('users/<int:pk>/', views.UserDetailView.as_view()),
    path('users/<int:pk>/password/', views.UserPasswordView.as_view()),
    path('users/<int:pk>/desactivar/', views.UserDesactivarView.as_view()),
    path('users/<int:pk>/reactivar/', views.UserReactivarView.as_view()),
]
