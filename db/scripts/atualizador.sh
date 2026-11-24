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
#   5. limpa as sobras (limpar_sobras): contêineres parados desta stack e
#      imagens nossas que nenhum contêiner usa mais
#   6. faxina do servidor (faxina_geral, só depois de uma atualização pelo
#      console): toda imagem sem contêiner, cache de build, volume anônimo
#      sem uso e volume com nome que está sem uso E vazio
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

# Sobras de atualização: cada troca de imagem deixa o contêiner antigo parado
# (o Swarm guarda até 5 tarefas por serviço) e a imagem da versão anterior no
# disco. Limpa só o que é desta stack (etiqueta com.docker.stack.namespace) e
# nunca usa -f: contêiner rodando e imagem em uso por qualquer contêiner (de
# qualquer stack) ficam. Volumes não são tocados.
#
# Quem decide se o contêiner parou "normal" é a tarefa do Swarm, não o código
# de saída: a imagem ops herda STOPSIGNAL SIGINT do postgres (parada normal =
# 130) e o PostgREST sai com 255. Olhar o código deixava esses parados para
# sempre (visto no Portainer em 24/11/2026).
#
# Modos:
#   tudo    depois de uma atualização (pedido do dono, 24/11/2026: terminou de
#           atualizar, não sobra contêiner parado): remove todo parado da stack
#   rotina  ao subir e de hora em hora: remove tudo da versão anterior e tudo
#           que o Swarm parou; só segura por 24 h quem QUEBROU na versão atual,
#           para os logs (docker service logs) ainda mostrarem o erro
LIMPEZA_INTERVALO=3600
ultima_limpeza=0
LIMPEZA=""

parados() {
  { docker ps -aq --filter "label=com.docker.stack.namespace=$STACK" --filter status=exited
    docker ps -aq --filter "label=com.docker.stack.namespace=$STACK" --filter status=created
    docker ps -aq --filter "label=com.docker.stack.namespace=$STACK" --filter status=dead; } 2>/dev/null | sort -u
}

# Contêiner "created" de uma tarefa que o Swarm ainda quer de pé está subindo
# agora: não é sobra.
subindo() { # contêiner
  [ "$(docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null)" = "created" ] || return 1
  tarefa=$(docker inspect --format '{{index .Config.Labels "com.docker.swarm.task.id"}}' "$1" 2>/dev/null)
  [ -n "$tarefa" ] || return 1
  [ "$(docker inspect --type task --format '{{.DesiredState}}' "$tarefa" 2>/dev/null)" = "running" ]
}

# Quebrou sozinho (tarefa failed/rejected) e é da imagem que o serviço usa hoje.
quebrou_na_versao_atual() { # contêiner
  info=$(docker inspect --format '{{index .Config.Labels "com.docker.swarm.task.id"}} {{index .Config.Labels "com.docker.swarm.service.name"}} {{.Config.Image}}' "$1" 2>/dev/null) || return 1
  set -- $info
  [ $# -eq 3 ] || return 1
  case "$(docker inspect --type task --format '{{.Status.State}}' "$1" 2>/dev/null)" in
    failed|rejected) ;;
    *) return 1 ;;   # shutdown/complete/tarefa que o Swarm já esqueceu: sobra
  esac
  atual=$(imagem_do_servico "$2" 2>/dev/null) || return 1
  [ "$(sem_digest "$atual")" = "$(sem_digest "$3")" ]
}

# Grava o resultado no banco: o console (Versão e atualização) mostra quando
# foi a última limpeza e quantos parados sobraram.
registrar_limpeza() { # restantes
  sql -v msg="$LIMPEZA" -v parados="$1" >/dev/null 2>&1 <<'SQL' || true
insert into public.sistema_atualizador (id, limpeza_em, limpeza_msg, parados)
values (1, now(), :'msg', :'parados'::int)
on conflict (id) do update
   set limpeza_em = excluded.limpeza_em, limpeza_msg = excluded.limpeza_msg,
       parados = excluded.parados;
SQL
}

limpar_sobras() { # [tudo|rotina]
  modo="${1:-rotina}"
  removidos=0
  for c in $(parados); do
    subindo "$c" && continue
    if [ "$modo" != tudo ] && quebrou_na_versao_atual "$c"; then continue; fi
    docker rm "$c" >/dev/null 2>&1 && removidos=$((removidos + 1))
  done
  antigos=$(docker container prune -f --filter "label=com.docker.stack.namespace=$STACK" --filter until=24h 2>/dev/null | grep -c '^[0-9a-f]\{64\}$' || true)
  removidos=$((removidos + ${antigos:-0}))

  # Imagens da nossa base (app, whatsapp, ops) que nenhum contêiner usa,
  # menos a tag em que eu estou. Remove pelo nome (repo:tag) para não precisar
  # de -f quando a mesma imagem tem mais de uma tag; sem tag, pelo id.
  em_uso=$(docker ps -aq | xargs -r docker inspect --format '{{.Image}}' 2>/dev/null | sort -u)
  minha_tag=$(tag_de "$(imagem_do_servico "$EU")")
  docker image ls --no-trunc --format '{{.ID}} {{.Repository}} {{.Tag}}' 2>/dev/null |
    while read -r iid repo tag; do
      case "$repo" in "$BASE"/*) ;; *) continue ;; esac
      [ "$tag" = "$minha_tag" ] && continue
      printf '%s\n' "$em_uso" | grep -qx "$iid" && continue
      if [ "$tag" = "<none>" ]; then alvo="$iid"; else alvo="$repo:$tag"; fi
      docker image rm "$alvo" >/dev/null 2>&1 && echo "$alvo"
    done > /tmp/imagens-removidas 2>/dev/null || true
  imagens=$(wc -l < /tmp/imagens-removidas 2>/dev/null || echo 0)
  rm -f /tmp/imagens-removidas

  # Confere de verdade: quantos parados a stack ainda tem depois da limpeza.
  restantes=$(parados | wc -l | tr -d ' ')
  LIMPEZA="$removidos contêiner(es) parado(s) e $imagens imagem(ns) antiga(s) removidos; $restantes parado(s) na stack"
  log "limpeza ($modo): $LIMPEZA"
  registrar_limpeza "$restantes"
  ultima_limpeza=$(date +%s)
}

# Faxina do servidor inteiro, pedida pelo dono (24/11/2026) para toda
# atualização feita pelo console. Diferente de limpar_sobras, vale para
# qualquer stack, então a regra dos volumes é dura: volume com nome só sai se
# nenhum contêiner usa E ele está vazio. Volume com dado (o banco, os arquivos,
# os backups, o banco de outra stack com o serviço parado) nunca sai. Nada de
# -f: o Docker recusa apagar imagem ou volume que um contêiner esteja usando.
faxina_geral() {
  liberado=$(docker image prune -a -f 2>/dev/null | sed -n 's/^Total reclaimed space: //p')
  docker builder prune -a -f >/dev/null 2>&1 || true

  minha_ref=$(docker inspect --format '{{.Config.Image}}' "$(hostname)" 2>/dev/null || true)
  volumes=0
  for v in $(docker volume ls -q --filter dangling=true 2>/dev/null); do
    info=$(docker volume inspect --format '{{.Driver}} {{index .Labels "com.docker.volume.anonymous"}}' "$v" 2>/dev/null) || continue
    driver=${info%% *}; anonimo=${info#* }
    [ "$driver" = "local" ] || continue   # NFS, plugin etc.: não é nosso para julgar
    if [ -z "$anonimo" ]; then
      # Volume com nome: olha por dentro, só leitura e sem rede, com a minha
      # própria imagem (já está no disco). Pasta /vazio não existe na imagem,
      # então o Docker não copia nada para dentro do volume.
      [ -n "$minha_ref" ] || continue
      docker run --rm --network none --entrypoint sh -v "$v:/vazio:ro" "$minha_ref" \
        -c '[ -z "$(ls -A /vazio)" ]' >/dev/null 2>&1 || continue
    fi
    docker volume rm "$v" >/dev/null 2>&1 && volumes=$((volumes + 1))
  done

  FAXINA="${liberado:-0B} liberados em imagens; $volumes volume(s) sem uso apagados"
  log "faxina: $FAXINA"
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

  # Contêineres da versão anterior já pararam: limpa agora. O meu antigo (e a
  # imagem ops antiga, que ele usa) sai na faxina do novo atualizador ao subir.
  andamento "$id" "Limpando contêineres, imagens e volumes sem uso..."
  limpar_sobras tudo
  FAXINA=""
  faxina_geral

  terminar "$id" concluida "Sistema atualizado para $versao. Limpeza: $LIMPEZA; $FAXINA."
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

# Acabei de ser trocado por uma atualização do console? Então o que sobrar
# parado é da atualização e sai tudo (modo "tudo"); senão, a rotina.
recente=$(sql <<'SQL' || true
select 1 from public.sistema_atualizacoes
 where estado = 'concluida' and concluido_em > now() - interval '15 minutes'
 limit 1;
SQL
)
MODO_INICIO=rotina
[ "$recente" = "1" ] && MODO_INICIO=tudo

# Ao subir (inclusive logo depois de uma atualização ou de um deploy pela
# stack no Portainer) e depois de hora em hora.
limpar_sobras "$MODO_INICIO"

# O contêiner antigo do atualizador e a imagem ops anterior só ficam livres
# agora. Faxina de novo.
[ "$recente" = "1" ] && faxina_geral

# Revisões depois de subir: num deploy pela stack os serviços trocam ao mesmo
# tempo e o PostgREST é reiniciado sem esperar (start-first), então parte dos
# contêineres antigos ainda está parando na limpeza acima. Passa de novo em
# 1 e em 5 minutos.
revisoes="60 300"
inicio=$(date +%s)

while true; do
  if [ -n "$revisoes" ] && [ $(( $(date +%s) - inicio )) -ge "${revisoes%% *}" ]; then
    limpar_sobras "$MODO_INICIO"
    case "$revisoes" in *" "*) revisoes="${revisoes#* }" ;; *) revisoes="" ;; esac
  fi
  [ $(( $(date +%s) - ultima_limpeza )) -ge "$LIMPEZA_INTERVALO" ] && limpar_sobras
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
