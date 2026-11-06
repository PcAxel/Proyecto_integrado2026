from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import CustomUser, Role


class RoleTestCase(APITestCase):
    """Crea un usuario por rol y permite autenticarse como cada uno."""

    def setUp(self):
        cache.clear()
        self.users = {r: CustomUser.objects.create_user(f'{r.lower()}@fyag.cl', 'Clave-Segura-123', role=r,
                                                   terms_accepted_at=timezone.now())
                      for r in Role.values}

    def as_role(self, role):
        self.client.force_authenticate(self.users[role])
        return self.users[role]
