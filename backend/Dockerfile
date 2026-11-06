# Imagen del backend de FYAG: Django + Gunicorn. Multi-arquitectura (corre igual en ARM de Oracle y en x86).
FROM python:3.13-slim AS construir
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip wheel --wheel-dir /ruedas -r requirements.txt

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
# Solo la librería de ejecución de MySQL; los compiladores se quedan en la etapa anterior.
RUN apt-get update && apt-get install -y --no-install-recommends libmariadb3 && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home fyag && mkdir -p /data/archivos && chown -R fyag:fyag /data
COPY --from=construir /ruedas /ruedas
RUN pip install --no-index --find-links=/ruedas /ruedas/*.whl && rm -rf /ruedas
WORKDIR /app
COPY --chown=fyag:fyag . .
RUN chmod +x docker-entrypoint.sh
USER fyag
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "90", "--worker-tmp-dir", "/dev/shm", "--access-logfile", "-"]
