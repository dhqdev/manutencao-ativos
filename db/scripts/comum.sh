#!/bin/sh
# Variáveis de conexão com o banco da stack (psql/pg_dump leem PG* do ambiente).
export PGHOST="${PGHOST:-db}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-manutencao}"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "PGPASSWORD (senha do usuário postgres) não definida." >&2
  exit 1
fi
export PGPASSWORD

# Espera o banco aceitar conexões (até ~3 minutos).
aguardar_banco() {
  i=0
  until psql -qtAc "select 1" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 90 ]; then
      echo "O banco em $PGHOST:$PGPORT não respondeu." >&2
      exit 1
    fi
    sleep 2
  done
}
