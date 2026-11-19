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

# Superadmin (opcional): SUPERADMIN_EMAIL + SUPERADMIN_SENHA. Valores ruins
# não derrubam o deploy: o aviso aparece no log e o resto segue.
set -- -v senha_authenticator="$AUTHENTICATOR_PASSWORD"
SA_EMAIL=$(printf '%s' "${SUPERADMIN_EMAIL:-}" | tr -d '[:space:]')
SA_SENHA="${SUPERADMIN_SENHA:-}"
if [ -n "$SA_EMAIL" ]; then
  if ! printf '%s' "$SA_EMAIL" | grep -Eq '^[^@]+@[^@]+\.[^@]+$'; then
    echo "[migrador] AVISO: SUPERADMIN_EMAIL inválido ($SA_EMAIL). Superadmin não foi alterado." >&2
    SA_EMAIL=""
  elif [ "${#SA_SENHA}" -lt 8 ] || [ "${#SA_SENHA}" -gt 72 ]; then
    echo "[migrador] AVISO: SUPERADMIN_SENHA precisa ter de 8 a 72 caracteres. Superadmin não foi alterado." >&2
    SA_EMAIL=""
  else
    set -- "$@" -v superadmin_email="$SA_EMAIL" -v superadmin_senha="$SA_SENHA"
  fi
  # Sem e-mail válido o 30-superadmin.sql não pode tirar o posto de quem já tem.
  [ -n "$SA_EMAIL" ] || set -- "$@" -v superadmin_manter=1
fi

echo "[migrador] aguardando o banco em $PGHOST..."
aguardar_banco

saida=$(mktemp)
for arquivo in /ops/sql/*.sql; do
  echo "[migrador] aplicando $(basename "$arquivo")"
  if ! psql -v ON_ERROR_STOP=1 -q "$@" -f "$arquivo" >"$saida" 2>&1; then
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
