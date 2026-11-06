#!/bin/sh
# Aplica las migraciones y arranca el servidor. La base ya está lista: compose espera su healthcheck antes de iniciar esto.
set -e
python manage.py migrate --noinput
exec "$@"
