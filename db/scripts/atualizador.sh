#!/bin/sh
# Atualizador: aplica a versão nova quando o superadmin clica em "Atualizar"
# no painel (/admin). Fica de olho na tabela sistema_atualizacoes; para cada
# pedido:
#
#   1. baixa as 3 imagens da versão (app, whatsapp, ops) — se faltar uma, para
#   2. roda o migrador da versão nova e espera ele terminar (SQL em dia)
#   3. troca a imagem dos outros serviços da stack, um de cada vez, esperando
#      cada um ficar de pé (o app volta sozinho se a versão nova não subir)
#   4. por último troca a própria imagem
#
# Precisa do socket do Docker (/var/run/docker.sock) e roda num manager.
# Só troca a imagem dos serviços da PRÓPRIA stack cujas imagens vêm da mesma
# base que a dele (ex.: ghcr.io/dhqdev/manutencao-ativos/*): banco, PostgREST e
# Traefik ficam na versão que estão; o PostgREST só é reiniciado no fim, para
# reler o esquema. Mudanças no arquivo da stack (variável nova, serviço
# novo) continuam pedindo um deploy pela stack (deploy.sh ou Portainer).
set -u
. /ops/comum.sh

INTERVALO="${ATUALIZADOR_INTERVALO:-10}"
ESPERA_MIGRADOR="${ATUALIZADOR_ESPERA_MIGRADOR:-600}"
VERSAO_VALIDA='^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$'

log() { echo "[atualizador] $*"; }

# psql com variáveis seguras: o SQL vem pela entrada, os valores por -v.
sql() { psql -X -qtA -v ON_ERROR_STOP=1 "$@"; }

if ! docker info >/dev/null 2>&1; then
  log "sem acesso ao Docker. Monte /var/run/docker.sock e rode num manager." >&2
  sleep 60
  exit 1
fi

# Quem sou eu: a stack passa o nome do serviço por template do Swarm
# (ATUALIZADOR_SERVICO={{.Service.Name}}); sem ele, as etiquetas do contêiner.
EU="${ATUALIZADOR_SERVICO:-}"
if [ -z "$EU" ]; then
  EU=$(docker inspect --format '{{index .Config.Labels "com.docker.swarm.service.name"}}' "$(hostname)" 2>/dev/null || true)
fi
STACK=""
[ -n "$EU" ] && STACK=$(docker service inspect --format '{{index .Spec.Labels "com.docker.stack.namespace"}}' "$EU" 2>/dev/null || true)
if [ -z "$EU" ] || [ -z "$STACK" ]; then
  log "não achei meu serviço numa stack do Swarm (ATUALIZADOR_SERVICO=${ATUALIZADOR_SERVICO:-vazio})." >&2
  sleep 60
  exit 1
fi

imagem_do_servico() {
  docker service inspect --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' "$1"
}

# "ghcr.io/x/y/ops:v2026.11.19-3@sha256:..." -> base "ghcr.io/x/y", tag "v2026.11.19-3"
sem_digest() { printf '%s' "${1%%@*}"; }
tag_de() { t=$(sem_digest "$1"); case "${t##*/}" in *:*) printf '%s' "${t##*:}" ;; *) printf 'latest' ;; esac; }
repo_de() { t=$(sem_digest "$1"); case "${t##*/}" in *:*) printf '%s' "${t%:*}" ;; *) printf '%s' "$t" ;; esac; }

MINHA_IMAGEM=$(imagem_do_servico "$EU")
BASE=$(repo_de "$MINHA_IMAGEM"); BASE="${BASE%/*}"
log "no ar: stack $STACK, serviço $EU, imagens de $BASE"

sinal_de_vida() {
  sql -v stack="$STACK" -v imagem="$BASE" -v versao="$(tag_de "$(imagem_do_servico "$EU")")" >/dev/null <<'SQL'
insert into public.sistema_atualizador (id, visto_em, stack, imagem, versao)
values (1, now(), :'stack', :'imagem', :'versao')
on conflict (id) do update
   set visto_em = excluded.visto_em, stack = excluded.stack,
       imagem = excluded.imagem, versao = excluded.versao;
SQL
}

# Conta o andamento para o painel.
andamento() {
  sql -v id="$1" -v msg="$2" >/dev/null <<'SQL'
update public.sistema_atualizacoes set mensagem = :'msg' where id = :'id'::bigint;
SQL
}

terminar() { # id estado mensagem
  sql -v id="$1" -v estado="$2" -v msg="$3" >/dev/null <<'SQL'
update public.sistema_atualizacoes
   set estado = :'estado', mensagem = :'msg', concluido_em = now()
 where id = :'id'::bigint;
SQL
}

# Serviços da stack que usam imagens da nossa base (app, whatsapp, ops).
nossos_servicos() {
  docker service ls --filter "label=com.docker.stack.namespace=$STACK" --format '{{.Name}}' |
    while read -r s; do
      case "$(repo_de "$(imagem_do_servico "$s")")" in
        "$BASE"/*) echo "$s" ;;
      esac
    done
}

# PostgREST da stack (imagem postgrest/...): não é nosso, mas guarda o esquema
# em cache e precisa reler depois do SQL novo.
servicos_postgrest() {
  docker service ls --filter "label=com.docker.stack.namespace=$STACK" --format '{{.Name}}' |
    while read -r s; do
      case "$(repo_de "$(imagem_do_servico "$s")")" in
        postgrest/*|*/postgrest/*) echo "$s" ;;
      esac
    done
}

e_migrador() {
  docker service inspect --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}' "$1" | grep -q '"migrar"'
}

imagem_nova() { # serviço versão -> base/componente:versão
  repo=$(repo_de "$(imagem_do_servico "$1")")
  printf '%s:%s' "$repo" "$2"
}

# Espera a tarefa do migrador com a imagem nova terminar (Complete).
esperar_migrador() { # serviço imagem
  limite=$(( $(date +%s) + ESPERA_MIGRADOR ))
  while [ "$(date +%s)" -lt "$limite" ]; do
    estados=$(docker service ps "$1" --no-trunc --format '{{.Image}}|{{.CurrentState}}|{{.Error}}' | grep "^$2[@|]" || true)
    if printf '%s\n' "$estados" | grep -q '|Complete'; then return 0; fi
    falhas=$(printf '%s\n' "$estados" | grep -c '|Failed\||Rejected' || true)
    if [ "$falhas" -ge 3 ]; then
      ERRO_MIGRADOR=$(printf '%s\n' "$estados" | grep '|Failed\||Rejected' | head -1 | cut -d'|' -f3)
      return 1
    fi
    sleep 5
  done
  ERRO_MIGRADOR="não terminou em ${ESPERA_MIGRADOR}s"
  return 1
}

atualizar() { # id versão
  id="$1"; versao="$2"
  if ! printf '%s' "$versao" | grep -Eq "$VERSAO_VALIDA"; then
    terminar "$id" erro "Versão inválida: $versao"; return
  fi
  log "pedido $id: atualizar para $versao"

  for componente in app whatsapp ops; do
    andamento "$id" "Baixando a imagem $componente:$versao..."
    if ! docker pull -q "$BASE/$componente:$versao" >/dev/null 2>&1; then
      terminar "$id" erro "A imagem $BASE/$componente:$versao não foi encontrada no registro. Nada foi alterado."
      return
    fi
  done

  servicos=$(nossos_servicos)
  migrador=""
  for s in $servicos; do e_migrador "$s" && migrador="$s"; done

  if [ -n "$migrador" ]; then
    andamento "$id" "Atualizando o banco (migrador)..."
    nova=$(imagem_nova "$migrador" "$versao")
    if ! docker service update --quiet --detach --force --image "$nova" "$migrador" >/dev/null 2>&1; then
      terminar "$id" erro "Não consegui iniciar o migrador da versão nova. Nada mais foi alterado."
      return
    fi
    ERRO_MIGRADOR=""
    if ! esperar_migrador "$migrador" "$nova"; then
      terminar "$id" erro "O migrador da versão nova falhou ($ERRO_MIGRADOR). O app continua na versão anterior. Veja: docker service logs $migrador"
      return
    fi
  fi

  for s in $servicos; do
    [ "$s" = "$EU" ] && continue
    [ "$s" = "$migrador" ] && continue
    andamento "$id" "Atualizando $s..."
    if ! saida=$(docker service update --quiet --detach=false --image "$(imagem_nova "$s" "$versao")" "$s" 2>&1); then
      terminar "$id" erro "O serviço $s não subiu na versão nova e voltou para a anterior. Detalhe: $(printf '%s' "$saida" | tail -1)"
      return
    fi
  done

  # O migrador já avisa o PostgREST, mas o aviso se perde se o PostgREST
  # estava reconectando naquela hora: aí ele segue com o esquema antigo e
  # tabela nova responde "not in the schema cache". Avisar de novo no fim é
  # de graça e resolve.
  echo "notify pgrst, 'reload schema'" | sql >/dev/null 2>&1 || true

  # E se o canal de avisos do PostgREST morreu (aconteceu em produção: o
  # container de dias atrás não ouvia mais nada), só reiniciando. Ele usa
  # start-first: o novo sobe antes do velho sair, sem derrubar o site.
  for s in $(servicos_postgrest); do
    andamento "$id" "Recarregando a API do banco ($s)..."
    docker service update --quiet --detach --force "$s" >/dev/null 2>&1 || log "não consegui reiniciar $s"
  done

  terminar "$id" concluida "Sistema atualizado para $versao."
  log "pedido $id: concluído"

  # Por último, eu mesmo (o Swarm troca este contêiner e o loop recomeça).
  docker service update --quiet --detach --image "$(imagem_nova "$EU" "$versao")" "$EU" >/dev/null 2>&1 || true
}

aguardar_banco
garantir_esquema

# Pedido que estava em andamento quando o atualizador caiu não termina mais.
sql >/dev/null <<'SQL'
update public.sistema_atualizacoes
   set estado = 'erro', concluido_em = now(),
       mensagem = coalesce(mensagem, '') || ' — interrompida (o atualizador reiniciou). Confira as versões e peça de novo se preciso.'
 where estado = 'executando';
SQL

while true; do
  sinal_de_vida || log "não consegui gravar o sinal de vida"
  pedido=$(sql <<'SQL' || true
update public.sistema_atualizacoes
   set estado = 'executando', iniciado_em = now(), mensagem = 'Começando...'
 where id = (select id from public.sistema_atualizacoes
              where estado = 'pendente' order by id limit 1
              for update skip locked)
returning id || ' ' || versao;
SQL
)
  if [ -n "$pedido" ]; then
    atualizar "${pedido%% *}" "${pedido#* }"
  fi
  sleep "$INTERVALO"
done
