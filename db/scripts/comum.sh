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

# --- Esquema do banco ------------------------------------------------------------
# Versão da imagem ops (vAAAA.MM.DD-N, gravada pelo CI; "dev" fora dele).
OPS_VERSAO="${OPS_VERSAO:-dev}"

# vAAAA.MM.DD-N -> número que dá para comparar (0 se fora do padrão).
chave_versao() {
  echo "$1" | sed -n 's/^v\([0-9]\{4\}\)\.\([0-9]\{2\}\)\.\([0-9]\{2\}\)-\([0-9]\{1,9\}\)$/\1\2\3 \4/p' \
    | { read -r d n && echo $(( d * 1000000000 + n )) || echo 0; }
}

# Aplica /ops/sql/*.sql em ordem, cada arquivo na sessão que segura a trava
# 727272: se o migrador e outro serviço (garantir_esquema) rodarem juntos, um
# espera o outro em vez de trombar no mesmo "create or replace". Os argumentos
# viram variáveis do psql (-v ...). Termina gravando a versão aplicada.
aplicar_sql() {
  saida=$(mktemp)
  for arquivo in "${SQL_DIR:-/ops/sql}"/*.sql; do
    echo "[esquema] aplicando $(basename "$arquivo")"
    if ! psql -X -v ON_ERROR_STOP=1 -q "$@" \
        -c 'do $$ begin perform pg_advisory_lock(727272); end $$' -f "$arquivo" >"$saida" 2>&1; then
      cat "$saida" >&2
      echo "[esquema] FALHOU em $(basename "$arquivo")" >&2
      rm -f "$saida"
      return 1
    fi
    # Mostra o que não for aviso de rotina.
    grep -v "^NOTICE\|already exists, skipping\|does not exist, skipping\|^psql:.*NOTICE" "$saida" || true
  done
  rm -f "$saida"
  echo "insert into public.sistema_esquema (id, versao, aplicado_em) values (1, :'v', now())
        on conflict (id) do update set versao = excluded.versao, aplicado_em = excluded.aplicado_em" \
    | psql -X -q -v v="$OPS_VERSAO" >/dev/null 2>&1 || true
  # O PostgREST guarda o esquema em cache: sem o aviso, tabela nova responde
  # "not in the schema cache" até ele reiniciar.
  psql -X -qc "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true
}

# Usado pelos serviços que ficam no ar (backup, atualizador) ao subir: se a
# imagem deles é mais nova que o SQL aplicado no banco, aplicam o SQL. Assim
# atualizar a stack no Portainer basta, mesmo quando o Swarm não roda o
# migrador de novo (tarefa antiga "Complete" com a mesma especificação).
# Nunca volta o banco para trás: imagem mais velha que o banco não faz nada.
# Sem SUPERADMIN_* nem AUTHENTICATOR_PASSWORD aqui: o superadmin e a senha do
# PostgREST ficam como o migrador deixou (superadmin_manter).
garantir_esquema() {
  minha=$(chave_versao "$OPS_VERSAO")
  [ "$minha" -gt 0 ] || return 0
  no_banco=$(psql -X -qtAc "select versao from public.sistema_esquema where id = 1" 2>/dev/null || true)
  [ "$(chave_versao "$no_banco")" -lt "$minha" ] || return 0
  echo "[esquema] banco em ${no_banco:-versão desconhecida}, imagem em $OPS_VERSAO: aplicando o SQL"
  aplicar_sql -v superadmin_manter=1 || echo "[esquema] não consegui atualizar o banco; o migrador tenta de novo" >&2
}
