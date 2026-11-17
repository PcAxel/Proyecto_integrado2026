#!/usr/bin/env bash
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input

# Opcionales, se activan con variables de entorno en Render (quitarlas después de usarlas):
# APEX_SEED_DEMO=1  → carga los datos de demostración (idempotente: si el catálogo ya está completo no hace nada). Con FYAG_SEED_PASSWORD
#                       (mín. 12 caracteres) todas las cuentas de técnicos nuevas usan esa contraseña; sin ella se generan al azar y salen en este log.
# FYAG_RESET_2FA_EMAIL=correo@fyag.cl → reinicia el autenticador de esa cuenta en CADA despliegue mientras la variable exista.
# FYAG_CREAR_CUENTA_EMAIL=bodega@fyag.cl (+ FYAG_CREAR_CUENTA_ROL=JEFE_BODEGA, FYAG_CREAR_CUENTA_NOMBRE="Jefe de Bodega" y la clave en FYAG_CUENTA_PASSWORD, mín. 10 caracteres)
#                       → crea esa cuenta si no existe (nunca toca una existente); al primer ingreso la persona vincula su autenticador.
# FYAG_RESTABLECER_CUENTA_EMAIL=ti@apexsystems.cl (+ FYAG_RESTABLECER_CUENTA_ROL=SUPERADMIN solo si la cuenta no existe, y la clave nueva en FYAG_CUENTA_PASSWORD)
#                       → si la cuenta no existe la crea; si existe le fija esa clave, quita el bloqueo por intentos y la reactiva (no toca el autenticador).
# Un fallo aquí no debe impedir el despliegue.
if [ "${APEX_SEED_DEMO:-}" = "1" ]; then
  python manage.py poblar_demo --force || echo "poblar_demo falló: el despliegue continúa sin los datos de demostración"
fi
if [ -n "${FYAG_RESET_2FA_EMAIL:-}" ]; then
  python manage.py reset_2fa "$FYAG_RESET_2FA_EMAIL" || echo "reset_2fa falló: revisa el correo indicado"
fi
if [ -n "${FYAG_CREAR_CUENTA_EMAIL:-}" ]; then
  python manage.py crear_cuenta "$FYAG_CREAR_CUENTA_EMAIL" --rol "${FYAG_CREAR_CUENTA_ROL:-JEFE_BODEGA}" --nombre "${FYAG_CREAR_CUENTA_NOMBRE:-Jefe de Bodega}" || echo "crear_cuenta falló: revisa las variables FYAG_CREAR_CUENTA_* y FYAG_CUENTA_PASSWORD"
fi
if [ -n "${FYAG_RESTABLECER_CUENTA_EMAIL:-}" ]; then
  python manage.py restablecer_cuenta "$FYAG_RESTABLECER_CUENTA_EMAIL" ${FYAG_RESTABLECER_CUENTA_ROL:+--rol "$FYAG_RESTABLECER_CUENTA_ROL"} || echo "restablecer_cuenta falló: revisa FYAG_RESTABLECER_CUENTA_EMAIL y FYAG_CUENTA_PASSWORD"
fi
