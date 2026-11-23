#!/bin/sh
# Traz UMA empresa do Supabase antigo para DENTRO de uma empresa que já existe
# no sistema novo (a de um usuário criado pelo console). Diferente de
# importar-supabase, que copia o banco inteiro (logins e empresas) para um
# banco vazio.
#
#   DESTINO_EMAIL        login do sistema novo, dono da empresa que recebe tudo
#   SUPABASE_DB_URL      connection string do Supabase (Session pooler)
#   SUPABASE_URL         https://xxxx.supabase.co       (para os arquivos)
#   SUPABASE_SECRET_KEY  sb_secret_...                   (para os arquivos)
#   EMPRESA_ANTIGA       id da empresa no Supabase. Opcional quando lá só tem
#                        uma, ou quando o DESTINO_EMAIL é dono de uma só lá.
#                        "todas" junta todas as empresas do Supabase.
#   DESTINO_EMPRESA      id da empresa no sistema novo (só se o usuário for
#                        dono de mais de uma)
#   FORCAR=1             importa mesmo se a empresa de destino já tem ativos
#   SO_ARQUIVOS=1        pula o banco e só baixa os arquivos que faltam
#
# Vem: categorias (as de mesmo nome viram uma só), ativos, periódicas,
# manutenções, anexos, pneus, movimentações de pneus e os arquivos do Storage
# (com o caminho trocado para a pasta da empresa nova). CNPJ, telefone e
# endereço só entram se estiverem vazios na empresa nova.
# Não vem: logins e equipe antigos, configuração e histórico do WhatsApp.
#
# O banco vai numa transação só: qualquer erro desfaz tudo.
set -eu
. /ops/comum.sh

for v in DESTINO_EMAIL SUPABASE_DB_URL; do
  eval "valor=\${$v:-}"
  if [ -z "$valor" ]; then
    echo "Defina $v." >&2
    exit 1
  fi
done

aguardar_banco
trabalho=$(mktemp -d)
trap 'rm -rf "$trabalho"' EXIT

# --- 1. Empresa de destino (sistema novo) ------------------------------------
destino_id=$(psql -X -qtA -v email="$DESTINO_EMAIL" <<'SQL'
select id from auth.users where lower(email) = lower(trim(:'email'))
SQL
)
if [ -z "$destino_id" ]; then
  echo "Não achei o login $DESTINO_EMAIL no sistema novo. Crie pelo console do superadmin antes." >&2
  exit 1
fi

if [ -n "${DESTINO_EMPRESA:-}" ]; then
  alvo=$(psql -X -qtA -v u="$destino_id" -v o="$DESTINO_EMPRESA" <<'SQL'
select org_id from public.org_membros where user_id = :'u' and org_id::text = :'o'
SQL
)
  if [ -z "$alvo" ]; then
    echo "$DESTINO_EMAIL não participa da empresa $DESTINO_EMPRESA." >&2
    exit 1
  fi
else
  psql -X -qtA -F ' | ' -v u="$destino_id" > "$trabalho/destinos.txt" <<'SQL'
select o.id, o.nome from public.org_membros m join public.organizacoes o on o.id = m.org_id
 where m.user_id = :'u' and m.papel = 'proprietario' order by o.created_at
SQL
  if [ "$(grep -c . "$trabalho/destinos.txt" || true)" != "1" ]; then
    echo "$DESTINO_EMAIL precisa ser dono de exatamente uma empresa (ou defina DESTINO_EMPRESA). Empresas dele:" >&2
    cat "$trabalho/destinos.txt" >&2
    exit 1
  fi
  alvo=$(cut -d' ' -f1 "$trabalho/destinos.txt")
fi
alvo_nome=$(psql -X -qtA -v o="$alvo" <<'SQL'
select nome from public.organizacoes where id = :'o'
SQL
)
echo "[importar] destino: empresa \"$alvo_nome\" ($alvo) de $DESTINO_EMAIL"

# --- 2. Empresa(s) de origem (Supabase) --------------------------------------
psql "$SUPABASE_DB_URL" -X -qtA -F ' | ' > "$trabalho/origens.txt" <<'SQL'
select o.id, o.nome,
       (select count(*) from public.ativos a where a.org_id = o.id) || ' ativos',
       (select count(*) from public.manutencoes m where m.org_id = o.id) || ' manutenções',
       coalesce((select string_agg(u.email, ', ') from public.org_membros mm join auth.users u on u.id = mm.user_id
                  where mm.org_id = o.id and mm.papel = 'proprietario'), '-') as dono
  from public.organizacoes o order by o.created_at
SQL

lista_origens() {
  echo "Empresas no Supabase (id | nome | ativos | manutenções | dono):" >&2
  cat "$trabalho/origens.txt" >&2
  echo "Rode de novo com -e EMPRESA_ANTIGA=<id> (ou EMPRESA_ANTIGA=todas)." >&2
}

case "${EMPRESA_ANTIGA:-}" in
  todas)
    orgs=$(cut -d' ' -f1 "$trabalho/origens.txt" | tr '\n' ',' | sed 's/,$//') ;;
  "")
    if [ "$(grep -c . "$trabalho/origens.txt" || true)" = "1" ]; then
      orgs=$(cut -d' ' -f1 "$trabalho/origens.txt")
    else
      # Mais de uma: vale a do mesmo e-mail, se ele for dono de uma só lá.
      orgs=$(psql "$SUPABASE_DB_URL" -X -qtA -v email="$DESTINO_EMAIL" <<'SQL'
select case when count(*) = 1 then min(m.org_id::text) end
  from public.org_membros m join auth.users u on u.id = m.user_id
 where lower(u.email) = lower(trim(:'email')) and m.papel = 'proprietario'
SQL
)
      if [ -z "$orgs" ]; then
        lista_origens
        exit 1
      fi
    fi ;;
  *)
    orgs=$(awk -F' [|] ' -v id="$EMPRESA_ANTIGA" '$1 == id { print $1 }' "$trabalho/origens.txt")
    if [ -z "$orgs" ]; then
      echo "A empresa $EMPRESA_ANTIGA não existe no Supabase." >&2
      lista_origens
      exit 1
    fi ;;
esac
ORGS="{$orgs}"
echo "[importar] origem no Supabase:"
for o in $(echo "$orgs" | tr ',' ' '); do grep "^$o " "$trabalho/origens.txt" | sed 's/^/  /'; done

# --- 3. Banco ----------------------------------------------------------------
TABELAS="organizacoes categorias ativos planos_manutencao manutencoes manutencao_anexos pneus pneu_movimentacoes"

if [ "${SO_ARQUIVOS:-}" != "1" ]; then
  ja_tem=$(psql -X -qtA -v o="$alvo" <<'SQL'
select count(*) from public.ativos where org_id = :'o'
SQL
)
  if [ "$ja_tem" != "0" ] && [ "${FORCAR:-}" != "1" ]; then
    echo "A empresa \"$alvo_nome\" já tem $ja_tem ativo(s). Se já importou, pare aqui; para importar mesmo assim, rode com FORCAR=1." >&2
    exit 1
  fi

  echo "[importar] 1/3 lendo o Supabase"
  psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -qc "\copy (select id, email from auth.users) to '$trabalho/usuarios.csv' with csv"
  lista=""
  for t in $TABELAS; do
    if [ "$(psql "$SUPABASE_DB_URL" -X -qtAc "select to_regclass('public.$t') is not null")" = "t" ]; then
      lista="$lista -t public.$t"
    fi
  done
  # shellcheck disable=SC2086
  pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges $lista -f "$trabalho/dados.sql"

  echo "[importar] 2/3 gravando na empresa \"$alvo_nome\""
  # Os dados antigos entram primeiro num schema de passagem (imp_supabase), com
  # as mesmas colunas das tabelas de verdade; dali vão para public já com a
  # empresa nova. Triggers desligados (replica): as movimentações de pneu e as
  # manutenções não são "aplicadas" de novo sobre o que já vem calculado.
  {
    printf '%s\n' "begin;" "set client_min_messages = warning;" "set session_replication_role = replica;" \
      "drop schema if exists imp_supabase cascade;" "create schema imp_supabase;" \
      "create table imp_supabase.usuarios (id uuid, email text);"
    for t in $TABELAS; do
      printf '%s\n' "create table imp_supabase.$t (like public.$t);"
    done
    printf '%s\n' "\\copy imp_supabase.usuarios from '$trabalho/usuarios.csv' with csv"
    grep -v "^SET \|^SELECT pg_catalog.set_config\|^\\\\restrict\|^\\\\unrestrict" "$trabalho/dados.sql" \
      | sed 's/^COPY public\./COPY imp_supabase./'
    cat <<'SQL'
-- Categorias: a de mesmo nome (sem diferenciar maiúsculas) que já existe na
-- empresa nova é reaproveitada; as outras entram, uma por nome.
create temp table mapa_categoria on commit drop as
with antigas as (
  select c.id, c.nome, c.created_at,
         row_number() over (partition by lower(trim(c.nome)) order by c.created_at, c.id) as n
    from imp_supabase.categorias c
   where c.org_id = any(:'orgs'::uuid[])
)
select a.id as antigo,
       coalesce(
         (select d.id from public.categorias d
           where d.org_id = :'alvo'::uuid and lower(trim(d.nome)) = lower(trim(a.nome)) limit 1),
         (select b.id from antigas b where lower(trim(b.nome)) = lower(trim(a.nome)) and b.n = 1)
       ) as novo
  from antigas a;

insert into public.categorias (id, org_id, nome, descricao, cor, icone, ordem, created_at)
select c.id, :'alvo'::uuid, c.nome, c.descricao,
       case when c.cor ~ '^#[0-9A-Fa-f]{6}$' then c.cor else '#2563eb' end,
       c.icone, c.ordem, c.created_at
  from imp_supabase.categorias c
  join mapa_categoria m on m.antigo = c.id and m.novo = c.id
 where c.org_id = any(:'orgs'::uuid[]);

-- Quem registrou: o mesmo e-mail no sistema novo, se existir.
create temp table mapa_usuario on commit drop as
select u.id as antigo, n.id as novo
  from imp_supabase.usuarios u join auth.users n on lower(n.email) = lower(u.email);

-- Arquivos: o caminho começa pela empresa ({org_id}/...): passa para a nova.
create function pg_temp.caminho(p text, alvo uuid) returns text language sql immutable as
$f$ select regexp_replace(p, '^[0-9a-fA-F-]{36}/', alvo::text || '/') $f$;

-- left join: categoria sem par vira null e o "not null" barra, em vez de o
-- ativo sumir calado.
insert into public.ativos (id, org_id, categoria_id, nome, modelo, marca, identificacao, ano,
                           data_cadastro, horimetro_atual, status, foto_url, observacoes, created_at, updated_at)
select a.id, :'alvo'::uuid, m.novo, a.nome, a.modelo, a.marca, a.identificacao,
       case when a.ano between 1900 and 2200 then a.ano end,
       a.data_cadastro, a.horimetro_atual, a.status, pg_temp.caminho(a.foto_url, :'alvo'::uuid),
       a.observacoes, a.created_at, a.updated_at
  from imp_supabase.ativos a
  left join mapa_categoria m on m.antigo = a.categoria_id
 where a.org_id = any(:'orgs'::uuid[]);

insert into public.planos_manutencao (id, org_id, ativo_id, tipo, descricao, periodicidade_valor,
       periodicidade_unidade, proxima_data, proximo_horimetro, alerta_antecedencia_dias,
       alerta_antecedencia_horas, ultima_data, ultimo_horimetro, responsavel, custo_estimado,
       ativo, observacoes, created_at, updated_at)
select p.id, :'alvo'::uuid, p.ativo_id, p.tipo, p.descricao, p.periodicidade_valor,
       p.periodicidade_unidade, p.proxima_data, p.proximo_horimetro, p.alerta_antecedencia_dias,
       p.alerta_antecedencia_horas, p.ultima_data, p.ultimo_horimetro, p.responsavel, p.custo_estimado,
       p.ativo, p.observacoes, p.created_at, p.updated_at
  from imp_supabase.planos_manutencao p
 where p.org_id = any(:'orgs'::uuid[]);

insert into public.manutencoes (id, org_id, ativo_id, plano_id, tipo, data_manutencao, descricao, pecas,
       valor, responsavel, empresa, nota_fiscal, garantia_dias, horimetro, observacoes, created_by, created_at)
select x.id, :'alvo'::uuid, x.ativo_id, x.plano_id, x.tipo, x.data_manutencao, x.descricao, x.pecas,
       x.valor, x.responsavel, x.empresa, x.nota_fiscal, x.garantia_dias, x.horimetro, x.observacoes,
       u.novo, x.created_at
  from imp_supabase.manutencoes x
  left join mapa_usuario u on u.antigo = x.created_by
 where x.org_id = any(:'orgs'::uuid[]);

insert into public.manutencao_anexos (id, org_id, manutencao_id, nome, path, tipo_mime, tamanho, created_at)
select n.id, :'alvo'::uuid, n.manutencao_id, n.nome, pg_temp.caminho(n.path, :'alvo'::uuid),
       n.tipo_mime, n.tamanho, n.created_at
  from imp_supabase.manutencao_anexos n
 where n.org_id = any(:'orgs'::uuid[]);

insert into public.pneus (id, org_id, numero_fogo, marca, modelo, medida, dot, condicao, status, ativo_id,
       posicao, horimetro_instalacao, km_rodados, sulco_inicial_mm, sulco_atual_mm, pressao_psi, recapagens,
       data_compra, valor_compra, fornecedor, nota_fiscal, localizacao, observacoes, created_at, updated_at)
select p.id, :'alvo'::uuid, p.numero_fogo, p.marca, p.modelo, p.medida, p.dot, p.condicao, p.status, p.ativo_id,
       p.posicao, p.horimetro_instalacao, p.km_rodados, p.sulco_inicial_mm, p.sulco_atual_mm, p.pressao_psi,
       p.recapagens, p.data_compra, p.valor_compra, p.fornecedor, p.nota_fiscal, p.localizacao, p.observacoes,
       p.created_at, p.updated_at
  from imp_supabase.pneus p
 where p.org_id = any(:'orgs'::uuid[]);

insert into public.pneu_movimentacoes (id, org_id, pneu_id, tipo, data, ativo_id, posicao, horimetro,
       sulco_mm, valor, observacoes, created_by, created_at)
select v.id, :'alvo'::uuid, v.pneu_id, v.tipo, v.data, v.ativo_id, v.posicao, v.horimetro,
       v.sulco_mm, v.valor, v.observacoes, u.novo, v.created_at
  from imp_supabase.pneu_movimentacoes v
  left join mapa_usuario u on u.antigo = v.created_by
 where v.org_id = any(:'orgs'::uuid[]);

-- Dados da empresa: só preenche o que estiver vazio na nova (e só com uma origem).
update public.organizacoes d
   set cnpj     = coalesce(nullif(d.cnpj, ''), o.cnpj),
       telefone = coalesce(nullif(d.telefone, ''), o.telefone),
       endereco = coalesce(nullif(d.endereco, ''), o.endereco)
  from imp_supabase.organizacoes o
 where d.id = :'alvo'::uuid and o.id = any(:'orgs'::uuid[])
   and cardinality(:'orgs'::uuid[]) = 1;

select format('[importar] categorias novas: %s · ativos: %s · periódicas: %s · manutenções: %s · anexos: %s · pneus: %s · mov. de pneus: %s',
  (select count(*) from mapa_categoria where antigo = novo),
  (select count(*) from imp_supabase.ativos where org_id = any(:'orgs'::uuid[])),
  (select count(*) from imp_supabase.planos_manutencao where org_id = any(:'orgs'::uuid[])),
  (select count(*) from imp_supabase.manutencoes where org_id = any(:'orgs'::uuid[])),
  (select count(*) from imp_supabase.manutencao_anexos where org_id = any(:'orgs'::uuid[])),
  (select count(*) from imp_supabase.pneus where org_id = any(:'orgs'::uuid[])),
  (select count(*) from imp_supabase.pneu_movimentacoes where org_id = any(:'orgs'::uuid[])));

drop schema imp_supabase cascade;
commit;
SQL
  } > "$trabalho/carga.sql"
  psql -X -v ON_ERROR_STOP=1 -qtA -v alvo="$alvo" -v orgs="$ORGS" -f "$trabalho/carga.sql"
fi

# --- 4. Arquivos -------------------------------------------------------------
echo "[importar] 3/3 arquivos (fotos e anexos)"
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SECRET_KEY:-}" ]; then
  echo "[importar] SUPABASE_URL / SUPABASE_SECRET_KEY não definidas: pulando os arquivos."
  exit 0
fi
DESTINO="${ARQUIVOS_DIR:-/dados/arquivos}"
psql "$SUPABASE_DB_URL" -X -qtA -v orgs="$ORGS" > "$trabalho/arquivos.txt" <<'SQL'
select name from storage.objects
 where bucket_id = 'manutencoes' and name not like '%/.emptyFolderPlaceholder'
   and split_part(name, '/', 1) = any(:'orgs'::text[])
SQL
total=0; feitos=0; pulados=0; falhas=0
while IFS= read -r nome; do
  [ -n "$nome" ] || continue
  total=$((total + 1))
  novo="$alvo/${nome#*/}"
  if [ -s "$DESTINO/$novo" ]; then pulados=$((pulados + 1)); continue; fi
  if curl -fsS --create-dirs -o "$DESTINO/$novo" \
      -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
      "${SUPABASE_URL%/}/storage/v1/object/manutencoes/$nome"; then
    feitos=$((feitos + 1))
  else
    falhas=$((falhas + 1)); echo "[importar] falhou: $nome" >&2
  fi
done < "$trabalho/arquivos.txt"
# O app roda como o usuário "node" (uid 1000) e precisa ler e apagar.
chown -R 1000:1000 "$DESTINO/$alvo" 2>/dev/null || true
echo "[importar] arquivos: $total no Supabase, $feitos baixados, $pulados já estavam, $falhas falhas"
[ "$falhas" = "0" ] || echo "[importar] Para tentar de novo só os arquivos: rode o mesmo comando com -e SO_ARQUIVOS=1" >&2
echo "[importar] pronto."
