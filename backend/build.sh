#!/usr/bin/env bash
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input

# Opcionales, se activan con variables de entorno en Render (quitarlas después de usarlas):
# FYAG_POBLAR_DEMO=1  → carga los datos de demostración (idempotente: si el catálogo ya está completo no hace nada). Con FYAG_SEED_PASSWORD
#                       (mín. 12 caracteres) todas las cuentas de técnicos nuevas usan esa contraseña; sin ella se generan al azar y salen en este log.
# FYAG_RESET_2FA_EMAIL=correo@fyag.cl → reinicia el autenticador de esa cuenta en CADA despliegue mientras la variable exista.
# Un fallo aquí no debe impedir el despliegue.
if [ "${FYAG_POBLAR_DEMO:-}" = "1" ]; then
  python manage.py poblar_demo --force || echo "poblar_demo falló: el despliegue continúa sin los datos de demostración"
fi
if [ -n "${FYAG_RESET_2FA_EMAIL:-}" ]; then
  python manage.py reset_2fa "$FYAG_RESET_2FA_EMAIL" || echo "reset_2fa falló: revisa el correo indicado"
fi
