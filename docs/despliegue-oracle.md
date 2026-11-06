# Despliegue gratuito: Vercel (frontend) + Oracle Cloud (backend y bases de datos)

```
Navegador ──► Vercel (React)  ── /api/* ──► Oracle VM ── Caddy (HTTPS) ──► Gunicorn/Django ──► MySQL
                                                                                          └──► MongoDB
                                                                          PDFs y firmas: disco de la VM
```
Costo mensual: **$0**. Sin dominio propio: la dirección del servidor es `IP-con-guiones.sslip.io` (DNS gratuito que apunta a tu IP)
y Caddy obtiene su certificado HTTPS automáticamente. El navegador solo habla con Vercel (`/api/...`), por eso la cookie de sesión
es del mismo sitio y no hay problemas de CORS en Safari/iPhone.

Qué hay en el repositorio: `backend/Dockerfile`, `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/.env.prod.example`,
`.github/workflows/ci-deploy.yml` y la regla `/api` de `vercel.json`.

## 1. Crear la máquina en Oracle (una sola vez)

1. Crea la cuenta en cloud.oracle.com (pide tarjeta solo para verificar identidad; no se cobra en el plan *Always Free*).
2. **Compute → Instances → Create instance**:
   - Imagen: **Ubuntu 24.04** (aarch64). Forma: **VM.Standard.A1.Flex** con **2 OCPU y 12 GB** (el máximo gratuito en 2026 según las
     fuentes que revisé; confírmalo en tu consola). La forma `E2.1.Micro` (1 GB) **no alcanza** para MySQL + MongoDB.
   - Disco de arranque: 50 GB. IP pública: asignar.
   - Clave SSH: genera una en tu Mac y sube la pública:
     `ssh-keygen -t ed25519 -f ~/.ssh/fyag_oracle -C "fyag-oracle"` → sube `~/.ssh/fyag_oracle.pub`.
   - Si dice *Out of capacity*, reintenta más tarde o prueba otro dominio de disponibilidad: es lo más común en el plan gratuito.
3. **IP fija**: Networking → IP addresses → *Reserved public IPs* → crea una y asígnala a la instancia (así la IP no cambia). Anota la IP,
   por ejemplo `129.151.10.20`. Tu dirección será `129-151-10-20.sslip.io`.
4. **Abrir puertos**: Networking → tu VCN → Security Lists → *Ingress rules*: agrega TCP **80** y **443** desde `0.0.0.0/0`
   (el 22 ya existe). MySQL y MongoDB **no** se publican: solo viven dentro de Docker.
5. Conéctate: `ssh -i ~/.ssh/fyag_oracle ubuntu@129.151.10.20`. Las imágenes de Oracle traen un firewall interno que bloquea 80/443:
   ```bash
   sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
   sudo apt-get update && sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
   ```
6. Instala Docker y crea la carpeta:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   sudo mkdir -p /opt/fyag/deploy /opt/fyag/backend && sudo chown -R $USER /opt/fyag
   ```

## 2. Configuración secreta del servidor (una sola vez)

En la VM crea `/opt/fyag/deploy/.env.prod` (copia de `deploy/.env.prod.example`). Genera las claves ahí mismo:
```bash
openssl rand -base64 50 | tr -d '\n'   # DJANGO_SECRET_KEY
openssl rand -hex 24                   # DB_PASSWORD, DB_ROOT_PASSWORD, MONGO_PASSWORD (una distinta para cada una)
```
Completa `API_HOST` y `DJANGO_ALLOWED_HOSTS` con `129-151-10-20.sslip.io` (tu IP). `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` y
`PWA_INSTALL_URL` llevan la URL de tu proyecto en Vercel (te la da Vercel en el paso 4; puedes editarlo después).
`FYAG_SEED_PASSWORD` (mínimo 12 caracteres) es la contraseña con la que entrarán las cuentas de demostración.
Este archivo **nunca** se sube a git ni se pisa en los despliegues.

## 3. GitHub: despliegue automático

1. Crea una clave exclusiva para desplegar: `ssh-keygen -t ed25519 -f ~/.ssh/fyag_deploy -N ""` y agrega `~/.ssh/fyag_deploy.pub`
   al final de `~/.ssh/authorized_keys` de la VM.
2. Repositorio → *Settings → Secrets and variables → Actions*:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secret | `ORACLE_HOST` | `129.151.10.20` |
   | Secret | `ORACLE_USER` | `ubuntu` |
   | Secret | `ORACLE_SSH_KEY` | contenido completo de `~/.ssh/fyag_deploy` (la privada) |
   | Secret | `ORACLE_KNOWN_HOSTS` | salida de `ssh-keyscan -t ed25519 129.151.10.20` |
   | Variable | `API_HOST` | `129-151-10-20.sslip.io` |

   `ORACLE_KNOWN_HOSTS` fija la huella de tu servidor: el workflow se niega a conectarse a otro.

## 4. Vercel

1. En `vercel.json` cambia el destino de la regla `/api/:path*` por **tu** `API_HOST`
   (`https://129-151-10-20.sslip.io/api/:path*`). Es la única línea que depende de tu servidor.
2. No hace falta ninguna variable de entorno: en producción el frontend usa `/api` solo.
3. Anota la URL de tu proyecto (`https://algo.vercel.app`) y ponla en `.env.prod` (CORS, CSRF, PWA_INSTALL_URL).

## 5. Primer despliegue

Haz `git push` a `main`. El workflow: prueba el frontend y el backend → sube el código a la VM → `docker compose up -d --build`
(la primera construcción en ARM tarda varios minutos) → comprueba `https://<API_HOST>/api/health/`.
Vercel despliega el frontend por su cuenta en el mismo push.

Después carga los datos de demostración (usuarios, obras, bodega, contratos, finiquitos y un anexo por firmar):
```bash
cd /opt/fyag/deploy
docker compose --env-file .env.prod exec backend python manage.py seed_fyag --demo --force
```
Entra con `rrhh@fyag.cl`, `finanzas@fyag.cl`, `operaciones@fyag.cl`, `tecnico@fyag.cl`, `admin@fyag.cl` y la contraseña de
`FYAG_SEED_PASSWORD`. En el primer ingreso de cada cuenta aparece el QR para vincular un autenticador (Google Authenticator, etc.).
Si pierdes un código: `docker compose --env-file .env.prod exec backend python manage.py reset_2fa correo@fyag.cl`.

> **Importante:** `seed_fyag` crea cuentas con una contraseña que tú conoces. El primero que entra a una cuenta vincula su
> autenticador, así que haz el primer ingreso de **todas** las cuentas apenas siembres los datos, antes de compartir la dirección.

## 6. Verificación (hazla una vez)

- [ ] `https://<API_HOST>/api/health/` responde `{"status":"ok"}` y `https://<API_HOST>/admin/` da 404.
- [ ] Entras desde tu `*.vercel.app`, inicias sesión, refrescas la página y la sesión sigue (cookie de renovación).
- [ ] **IP de las firmas:** firma el anexo del técnico desde tu celular con datos móviles, y mira la IP guardada:
      `docker compose --env-file .env.prod exec backend python manage.py shell -c "from rrhh.models import DocumentoLaboral as D; print([d.ip_firma for d in D.objects.all()])"`.
      Debe ser **tu IP pública** (compárala con whatismyip.com). Si sale una IP de Vercel o `172.x`, avísame: hay que ajustar la cadena de proxies.
- [ ] Sube un PDF grande (8–9 MB) como RRHH: Vercel podría limitar el tamaño de las peticiones reenviadas (no lo pude comprobar).
- [ ] La IA responde (si pusiste `DEEPSEEK_API_KEY`).

## 7. Día a día

- **Actualizar:** `git push`. Nada más.
- **Logs:** `docker compose --env-file .env.prod logs -f backend` (los correos de alta también salen ahí si no configuras SMTP).
- **Estado:** `docker compose --env-file .env.prod ps`.
- **Dónde están los datos:** volúmenes de Docker (`mysql_datos`, `mongo_datos`, `archivos`) en el disco de la VM.
  `docker compose down -v` **los borra**: no lo uses salvo que quieras empezar de cero.

## 8. Límites que aceptaste o debes conocer

- **Sin respaldos:** si la VM o su disco fallan, se pierde todo. Decisión tuya, adecuada para una demostración.
- **Oracle puede recuperar instancias gratuitas inactivas** (hay una política publicada de uso mínimo): entra y úsala de vez en cuando,
  y revisa su documentación vigente. Antes de la presentación, verifica que el servidor responde.
- **`sslip.io` es un servicio de terceros:** si cae, tu API no se resuelve. Si Caddy no logra el certificado (límites compartidos de
  Let's Encrypt), usa un subdominio gratuito de DuckDNS y cambia `API_HOST` y `vercel.json`.
- **La IP del cliente viaja en la cabecera `X-Vercel-Forwarded-For`.** Quien llame al servidor directamente (sin pasar por Vercel)
  podría falsificarla. No puede firmar en nombre de otro (exige sesión y código 2FA), pero la IP del registro sería de poca confianza.
  Para una demostración es aceptable; para producción real se necesita un dominio propio y una conexión Vercel→servidor autenticada.
- **Vercel Hobby es solo para uso no comercial**: encaja con un proyecto académico y de portafolio.
- Los correos de alta salen en el log mientras no configures un SMTP.
