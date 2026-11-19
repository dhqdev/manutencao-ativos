#!/bin/sh
# Traz tudo do Supabase antigo para o banco próprio — UMA vez, logo depois do
# primeiro deploy (veja INSTALACAO.md → "Trazer os dados do Supabase").
#
#   SUPABASE_DB_URL       conexão direta do Postgres do Supabase
#                         (Project Settings → Database → Connection string → URI)
#   SUPABASE_URL          https://xxxx.supabase.co           (para os arquivos)
#   SUPABASE_SECRET_KEY   chave secreta (sb_secret_...)       (para os arquivos)
#
# O que vem: logins (com as MESMAS senhas — o hash bcrypt é copiado), empresas,
# perfis, equipes, categorias, ativos, periódicas, manutenções, anexos, pneus,
# configuração do WhatsApp e histórico de envios. E os arquivos do Storage.
# As conexões de WhatsApp voltam como "desconectado": cada empresa lê o QR de
# novo (as sessões da Evolution não servem para o servidor novo).
set -eu
. /ops/comum.sh

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Defina SUPABASE_DB_URL (connection string do Postgres do Supabase)." >&2
  exit 1
fi

aguardar_banco

if [ "$(psql -qtAc 'select count(*) from public.organizacoes')" != "0" ] && [ "${FORCAR:-}" != "1" ]; then
  echo "O banco novo já tem empresas cadastradas. Para importar mesmo assim (pode duplicar), rode com FORCAR=1." >&2
  exit 1
fi

TABELAS="organizacoes profiles org_membros categorias ativos planos_manutencao manutencoes manutencao_anexos whatsapp_conexoes whatsapp_envios pneus pneu_movimentacoes"
trabalho=$(mktemp -d)

echo "[importar] 1/4 logins (auth.users)"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -qc "\copy (
  select id, email, encrypted_password, coalesce(raw_user_meta_data, '{}'), coalesce(raw_app_meta_data, '{}'),
         email_confirmed_at, last_sign_in_at, created_at, coalesce(updated_at, created_at)
    from auth.users
   where deleted_at is null
) to '$trabalho/usuarios.csv' with csv"

echo "[importar] 2/4 dados do schema public"
lista=""
for t in $TABELAS; do
  # Só exporta o que existe lá (pneus, por exemplo, vieram numa migração posterior).
  if [ "$(psql "$SUPABASE_DB_URL" -qtAc "select to_regclass('public.$t') is not null")" = "t" ]; then
    lista="$lista -t public.$t"
  fi
done
# shellcheck disable=SC2086
pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges $lista -f "$trabalho/dados.sql"

echo "[importar] 3/4 gravando no banco novo"
# session_replication_role = replica desliga triggers e checagem de chave
# estrangeira durante a carga: o cadastro não cria empresa nova para cada login
# importado, e a ordem das tabelas não importa.
# printf, não echo: o echo de alguns shells interpreta "\c" de "\copy".
{
  printf '%s\n' "begin;" "set session_replication_role = replica;"
  printf '%s\n' "\\copy auth.users (id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, last_sign_in_at, created_at, updated_at) from '$trabalho/usuarios.csv' with csv"
  grep -v "^SET \|^SELECT pg_catalog.set_config\|^\\\\restrict\|^\\\\unrestrict" "$trabalho/dados.sql"
  printf '%s\n' "update public.whatsapp_conexoes set status = 'desconectado';" "commit;"
} > "$trabalho/carga.sql"
psql -v ON_ERROR_STOP=1 -q -f "$trabalho/carga.sql"

echo "[importar] logins: $(psql -qtAc 'select count(*) from auth.users') · empresas: $(psql -qtAc 'select count(*) from public.organizacoes') · ativos: $(psql -qtAc 'select count(*) from public.ativos') · manutenções: $(psql -qtAc 'select count(*) from public.manutencoes')"

echo "[importar] 4/4 arquivos (fotos e anexos)"
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SECRET_KEY:-}" ]; then
  echo "[importar] SUPABASE_URL / SUPABASE_SECRET_KEY não definidas: pulando os arquivos."
else
  DESTINO="${ARQUIVOS_DIR:-/dados/arquivos}"
  psql "$SUPABASE_DB_URL" -qtAc "select name from storage.objects where bucket_id = 'manutencoes' and name not like '%/.emptyFolderPlaceholder'" > "$trabalho/arquivos.txt"
  total=$(grep -c . "$trabalho/arquivos.txt" || true)
  feitos=0; falhas=0
  while IFS= read -r nome; do
    [ -n "$nome" ] || continue
    if curl -fsS --create-dirs -o "$DESTINO/$nome" \
        -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
        "${SUPABASE_URL%/}/storage/v1/object/manutencoes/$nome"; then
      feitos=$((feitos + 1))
    else
      falhas=$((falhas + 1)); echo "[importar] falhou: $nome" >&2
    fi
  done < "$trabalho/arquivos.txt"
  # O app roda como o usuário "node" (uid 1000) e precisa ler e apagar.
  chown -R 1000:1000 "$DESTINO" 2>/dev/null || true
  echo "[importar] arquivos: $feitos de $total copiados, $falhas falhas"
fi

rm -rf "$trabalho"
echo "[importar] pronto. Os usuários entram com as mesmas senhas de antes."
