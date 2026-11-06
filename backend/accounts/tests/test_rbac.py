from accounts.models import Role

from .base import RoleTestCase

# (url, roles con lectura, roles con escritura) — ADMIN siempre puede
MATRIZ = {
    '/api/presupuestos/': ({'FINANZAS', 'OPERACIONES'}, {'FINANZAS'}),
    '/api/obras/': ({'FINANZAS', 'OPERACIONES', 'TECNICO'}, {'OPERACIONES'}),
    '/api/articulos/': ({'FINANZAS', 'OPERACIONES'}, {'OPERACIONES'}),
    '/api/cardex/': ({'FINANZAS', 'OPERACIONES'}, {'OPERACIONES'}),
    '/api/trabajadores/': ({'FINANZAS', 'RRHH'}, {'RRHH'}),
    '/api/vehiculos/': ({'FINANZAS', 'RRHH'}, {'RRHH'}),
    '/api/reportes/': ({'OPERACIONES', 'TECNICO'}, set()),
}


class RbacMatrixTests(RoleTestCase):
    def test_anonymous_gets_401_everywhere(self):
        for url in MATRIZ:
            self.assertEqual(self.client.get(url).status_code, 401, url)

    def test_read_access_matches_matrix(self):
        for url, (read, _) in MATRIZ.items():
            for role in Role.values:
                self.as_role(role)
                esperado = 200 if role == Role.ADMIN or role in read else 403
                self.assertEqual(self.client.get(url).status_code, esperado, f'GET {url} como {role}')

    def test_write_is_never_allowed_outside_matrix(self):
        """Un POST vacío da 400 si el rol puede escribir (pasó RBAC) y 403 si no."""
        for url, (_, write) in MATRIZ.items():
            if url == '/api/reportes/':
                continue  # solo lectura: POST responde 403/405 según rol
            for role in Role.values:
                self.as_role(role)
                esperado = 400 if role == Role.ADMIN or role in write else 403
                self.assertEqual(self.client.post(url, {}, format='json').status_code, esperado, f'POST {url} como {role}')
