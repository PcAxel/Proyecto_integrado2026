from django.contrib import admin

from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ('email', 'full_name', 'role', 'is_active', 'is_2fa_enabled')
    list_filter = ('role', 'is_active', 'is_2fa_enabled')
    search_fields = ('email', 'first_name', 'last_name')
    # El secreto TOTP y el hash de la contraseña nunca se muestran ni se editan desde el admin.
    exclude = ('password', 'otp_secret')
    readonly_fields = ('terms_accepted_at', 'terms_accepted_ip', 'terms_version')
