#!/usr/bin/env bash
# Bases de datos de DESARROLLO con datos persistentes dentro del proyecto (backend/.datos, ignorado por git).
# Uso:  scripts/bases.sh iniciar | detener | estado | respaldar
# MySQL → puerto 3307 · MongoDB → puerto 27018 (los que usa backend/.env).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DATOS="$RAIZ/.datos"
MYSQL_PUERTO=3307
MONGO_PUERTO=27018
mkdir -p "$DATOS/mysql" "$DATOS/mongo"

mysql_vivo() { mysqladmin --no-defaults -uroot -h127.0.0.1 -P"$MYSQL_PUERTO" ping >/dev/null 2>&1; }
mongo_vivo() { lsof -nP -iTCP:"$MONGO_PUERTO" -sTCP:LISTEN >/dev/null 2>&1; }

iniciar() {
  if [ -z "$(ls -A "$DATOS/mysql")" ]; then
    echo "→ Inicializando MySQL (primera vez)…"
    mysqld --no-defaults --initialize-insecure --datadir="$DATOS/mysql" >"$DATOS/mysql-init.log" 2>&1
  fi
  if ! mysql_vivo; then
    echo "→ Iniciando MySQL en :$MYSQL_PUERTO"
    nohup mysqld --no-defaults --datadir="$DATOS/mysql" --port="$MYSQL_PUERTO" --socket="$DATOS/mysql.sock" \
      --mysqlx=OFF --bind-address=127.0.0.1 >"$DATOS/mysql.log" 2>&1 &
    for _ in $(seq 1 40); do mysql_vivo && break; sleep 1; done
  fi
  mysql --no-defaults -uroot -h127.0.0.1 -P"$MYSQL_PUERTO" -e "
    CREATE DATABASE IF NOT EXISTS fyag_erp CHARACTER SET utf8mb4;
    CREATE USER IF NOT EXISTS 'fyag'@'127.0.0.1' IDENTIFIED BY 'fyag-dev-pass';
    CREATE USER IF NOT EXISTS 'fyag'@'localhost' IDENTIFIED BY 'fyag-dev-pass';
    GRANT ALL ON *.* TO 'fyag'@'127.0.0.1'; GRANT ALL ON *.* TO 'fyag'@'localhost';"
  if ! mongo_vivo; then
    echo "→ Iniciando MongoDB en :$MONGO_PUERTO"
    mongod --dbpath "$DATOS/mongo" --port "$MONGO_PUERTO" --bind_ip 127.0.0.1 --fork --logpath "$DATOS/mongo.log" >/dev/null
  fi
  estado
}

detener() {
  mysqladmin --no-defaults -uroot -h127.0.0.1 -P"$MYSQL_PUERTO" shutdown 2>/dev/null && echo "MySQL detenido" || echo "MySQL no estaba activo"
  mongod --dbpath "$DATOS/mongo" --shutdown >/dev/null 2>&1 && echo "MongoDB detenido" || echo "MongoDB no estaba activo"
}

estado() {
  mysql_vivo && echo "MySQL   ✔ activo (:$MYSQL_PUERTO)  datos: $DATOS/mysql" || echo "MySQL   ✘ detenido"
  mongo_vivo && echo "MongoDB ✔ activo (:$MONGO_PUERTO) datos: $DATOS/mongo" || echo "MongoDB ✘ detenido"
}

respaldar() {
  destino="$DATOS/respaldo_fyag_erp_$(date +%Y%m%d_%H%M%S).sql"
  mysqldump --no-defaults -uroot -h127.0.0.1 -P"$MYSQL_PUERTO" --single-transaction --set-gtid-purged=OFF fyag_erp >"$destino"
  echo "Respaldo MySQL: $destino"
}

case "${1:-estado}" in
  iniciar) iniciar ;; detener) detener ;; estado) estado ;; respaldar) respaldar ;;
  *) echo "Uso: $0 iniciar|detener|estado|respaldar"; exit 1 ;;
esac
