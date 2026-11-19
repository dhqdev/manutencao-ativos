#!/bin/sh
# Aplica todo o SQL de /ops/sql em ordem. Os arquivos são idempotentes: rodar
# de novo não estraga nada, só acrescenta o que faltar. Qualquer erro para
# tudo e o serviço sai com falha (o Swarm tenta de novo).
set -eu
. /ops/comum.sh

if [ -z "${AUTHENTICATOR_PASSWORD:-}" ]; then
  echo "AUTHENTICATOR_PASSWORD não definida (senha com que o PostgREST conecta)." >&2
  exit 1
fi

echo "[migrador] aguardando o banco em $PGHOST..."
aguardar_banco

saida=$(mktemp)
for arquivo in /ops/sql/*.sql; do
  echo "[migrador] aplicando $(basename "$arquivo")"
  if ! psql -v ON_ERROR_STOP=1 -q \
      -v senha_authenticator="$AUTHENTICATOR_PASSWORD" \
      -f "$arquivo" >"$saida" 2>&1; then
    cat "$saida" >&2
    echo "[migrador] FALHOU em $(basename "$arquivo")" >&2
    exit 1
  fi
  # Mostra o que não for aviso de rotina.
  grep -v "^NOTICE\|already exists, skipping\|does not exist, skipping\|^psql:.*NOTICE" "$saida" || true
done
rm -f "$saida"

psql -qc "notify pgrst, 'reload schema'"
echo "[migrador] banco em dia."
