#!/usr/bin/env bash
# Build de Render (Build Command: ./build.sh). Se detiene ante cualquier error.
set -o errexit
# mysqlclient solo se usa con MySQL local/Docker y necesita librerías del sistema que Render no trae.
grep -vi '^mysqlclient' requirements.txt > /tmp/requirements-render.txt
pip install -r /tmp/requirements-render.txt
python manage.py collectstatic --noinput
python manage.py migrate --noinput
