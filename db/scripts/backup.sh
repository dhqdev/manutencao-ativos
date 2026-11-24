#!/bin/sh
# Backup do banco (pg_dump, formato custom) e dos arquivos (fotos e anexos),
# a cada BACKUP_CADA_DIAS dias (padrão 15; o console pode mudar), com
# retenção, no volume "backups". Com o Backblaze B2 configurado
# (no console do superadmin, aba Integrações, ou pelas variáveis B2_* da
# stack), também manda tudo para fora do servidor — veja INSTALACAO.md.
#
#   backup.sh          fica no ar: roda às BACKUP_HORA:30 quando o último backup
#                      bom tem BACKUP_CADA_DIAS dias ou mais, e atende o
#                      botão "Fazer backup agora" do console
#   backup.sh agora    roda uma vez e sai (para testar ou antes de mexer em algo)
#
# Cada rodada fica registrada em sistema_backups (o console mostra o histórico)
# e o serviço manda sinal de vida em sistema_backup_servico.
set -u
. /ops/comum.sh

DESTINO="${BACKUP_DIR:-/backups}"
HORA="${BACKUP_HORA:-3}"          # hora local (TZ) em que roda
DIAS="${BACKUP_DIAS:-14}"         # quantos dias manter no servidor
ARQUIVOS="${ARQUIVOS_DIR:-/dados/arquivos}"
INTERVALO="${BACKUP_INTERVALO:-15}"  # segundos entre olhadas na fila do console
FUSO="${TZ:-America/Sao_Paulo}"

mkdir -p "$DESTINO"

log() { echo "[backup] $*"; }
aviso() { echo "[backup] $*" >&2; }

# psql com variáveis seguras: o SQL vem pela entrada, os valores por -v.
# Base antiga (sem as tabelas do 71-backup.sql) só faz a consulta falhar: o
# backup em si continua.
sql() { psql -X -qtA "$@" 2>/dev/null; }

credencial() {
  echo "select valor from sistema_credenciais where chave = :'c'" | sql -v c="$1"
}

# --- Backblaze B2 (opcional) ----------------------------------------------------
# Onde as credenciais são lidas, em ordem:
#   1. console do superadmin (sistema_credenciais): b2_key_id, b2_app_key,
#      b2_bucket, b2_pasta, b2_dias, b2_senha_criptografia, b2_modo
#      (e backup_cada_dias, que vale mesmo sem o B2)
#   2. variáveis da stack (reserva, para quem já configurou assim):
#      B2_KEY_ID      keyID da Application Key (Backblaze → Application Keys)
#      B2_APP_KEY     applicationKey (aparece uma vez só, na criação da chave)
#      B2_BUCKET      nome do bucket (privado)
#      B2_PASTA       pasta dentro do bucket (padrão: manutencao)
#      B2_MODO        espelho (padrão) ou historico, veja abaixo
#      B2_DIAS        no modo historico, quantos dias manter os dumps no B2 (padrão: 30)
#      B2_SENHA_CRIPTOGRAFIA  (opcional, o console não pede) criptografa antes de sair do
#                     servidor. GUARDE ESSA SENHA: sem ela o backup não abre.
#
# Pastas no bucket:
#   <pasta>/banco/AAAA/MM/banco-AAAAMMDD-HHMM.dump   dump do banco
#   <pasta>/arquivos/<org_id>/...                    fotos e anexos, um a um
#   <pasta>/arquivos-removidos/AAAAMMDD-HHMM/...     (só no historico) o que foi apagado
# Modo espelho (pedido do dono em 24/11/2026): o bucket fica igual ao app.
# Só o dump mais novo fica (o anterior sai depois que o novo subiu inteiro) e
# o arquivo apagado no app é apagado no bucket. Modo historico: dumps e
# removidos ficam B2_DIAS dias. As credenciais são relidas a cada rodada:
# trocar a chave no console vale já no próximo backup.
B2_ORIGEM=desligado
B2_IMPRESSAO=""

configurar_b2() {
  # Intervalo do automático: do console, senão da stack, senão 15 dias.
  cada=$(credencial backup_cada_dias)
  [ -n "$cada" ] || cada="${BACKUP_CADA_DIAS:-}"
  case "$cada" in ''|*[!0-9]*|0) CADA_DIAS=15 ;; *) CADA_DIAS="$cada" ;; esac

  c_id=$(credencial b2_key_id); c_chave=$(credencial b2_app_key); c_bucket=$(credencial b2_bucket)
  if [ -n "$c_id" ] && [ -n "$c_chave" ] && [ -n "$c_bucket" ]; then
    B2_ORIGEM=console
    ID="$c_id"; CHAVE="$c_chave"; BUCKET="$c_bucket"
    PASTA=$(credencial b2_pasta); B2D=$(credencial b2_dias); SENHA=$(credencial b2_senha_criptografia)
    MODO=$(credencial b2_modo)
  elif [ -n "${B2_KEY_ID:-}" ] && [ -n "${B2_APP_KEY:-}" ] && [ -n "${B2_BUCKET:-}" ]; then
    B2_ORIGEM=variaveis
    ID="$B2_KEY_ID"; CHAVE="$B2_APP_KEY"; BUCKET="$B2_BUCKET"
    PASTA="${B2_PASTA:-}"; B2D="${B2_DIAS:-}"; SENHA="${B2_SENHA_CRIPTOGRAFIA:-}"
    MODO="${B2_MODO:-}"
  else
    B2_ORIGEM=desligado
    ID=""; CHAVE=""; BUCKET=""; PASTA=""; B2D=""; SENHA=""; MODO=""
  fi
  case "$MODO" in historico) B2_MODO_USO=historico ;; *) B2_MODO_USO=espelho ;; esac
  B2_BUCKET_USO="$BUCKET"
  B2_PASTA_USO="${PASTA:-manutencao}"
  case "$B2D" in ''|*[!0-9]*) B2_DIAS_USO=30 ;; *) B2_DIAS_USO="$B2D" ;; esac

  # rclone lê a configuração do ambiente: nada de senha em arquivo.
  export RCLONE_CONFIG_B2_TYPE=b2
  export RCLONE_CONFIG_B2_ACCOUNT="$ID"
  export RCLONE_CONFIG_B2_KEY="$CHAVE"
  # Sem isso o B2 só "esconde" o arquivo apagado e continua cobrando por ele.
  export RCLONE_CONFIG_B2_HARD_DELETE=true
  REMOTO="b2:$BUCKET/$B2_PASTA_USO"
  unset RCLONE_CONFIG_B2CRIPTO_TYPE RCLONE_CONFIG_B2CRIPTO_REMOTE RCLONE_CONFIG_B2CRIPTO_PASSWORD
  B2_CRIPTO=false
  if [ "$B2_ORIGEM" != desligado ] && [ -n "$SENHA" ]; then
    export RCLONE_CONFIG_B2CRIPTO_TYPE=crypt
    export RCLONE_CONFIG_B2CRIPTO_REMOTE="$REMOTO"
    RCLONE_CONFIG_B2CRIPTO_PASSWORD=$(rclone obscure "$SENHA")
    export RCLONE_CONFIG_B2CRIPTO_PASSWORD
    REMOTO="b2cripto:"
    B2_CRIPTO=true
  fi

  # Mudou a configuração? Confere a chave na hora: erro de digitação aparece
  # no log (e no console) logo, não só às 3h30 da manhã.
  impressao="$B2_ORIGEM|$ID|$CHAVE|$BUCKET|$B2_PASTA_USO|$B2_DIAS_USO|$SENHA|$B2_MODO_USO|$CADA_DIAS"
  if [ "$impressao" != "$B2_IMPRESSAO" ]; then
    B2_IMPRESSAO="$impressao"
    if [ "$B2_ORIGEM" = desligado ]; then
      log "Backblaze B2 desligado: só o backup local vai rodar (a cada $CADA_DIAS dias)"
    else
      # shellcheck disable=SC2086
      if $RC lsf "b2:$BUCKET" --max-depth 1 >/dev/null 2>&1; then
        if [ "$B2_MODO_USO" = espelho ]; then modo_txt="espelho do app"; else modo_txt="histórico de $B2_DIAS_USO dias"; fi
        log "Backblaze B2 conectado ($B2_ORIGEM): $BUCKET/$B2_PASTA_USO ($modo_txt, a cada $CADA_DIAS dias)$([ "$B2_CRIPTO" = true ] && echo ', criptografado')"
        # Sem senha (o padrão desde 24/11/2026): os arquivos ficam legíveis no
        # painel do B2, protegidos pelo bucket privado e pela chave restrita.
      else
        aviso "AVISO: não consegui acessar o bucket $BUCKET no Backblaze B2. Confira o keyID, a applicationKey e o nome do bucket ($B2_ORIGEM)."
      fi
    fi
  fi
}

# Caminho dentro do destino. Com criptografia o remoto é "b2cripto:" (já é a
# pasta), e "b2cripto:/banco" viraria uma pasta com nome vazio no meio.
no_b2() { case "$REMOTO" in *:) printf '%s%s' "$REMOTO" "$1" ;; *) printf '%s/%s' "$REMOTO" "$1" ;; esac; }

# Repete comandos de rede (B2 fora do ar por um instante não perde o dia).
com_insistencia() {
  for tentativa in 1 2 3; do
    "$@" && return 0
    aviso "tentativa $tentativa falhou, tentando de novo em 30s"
    sleep 30
  done
  return 1
}

RC="rclone --config /dev/null --stats-one-line --stats 0 --retries 3 --low-level-retries 10"

# Deixa o resultado em B2_RESULTADO: ok | falhou | desligado.
enviar_b2() {
  carimbo="$1"
  B2_RESULTADO=desligado
  [ "$B2_ORIGEM" != desligado ] || return 0
  B2_RESULTADO=ok
  log "enviando para o Backblaze B2 ($B2_BUCKET_USO/$B2_PASTA_USO)"

  if [ -f "$DESTINO/banco-$carimbo.dump" ]; then
    mes=$(printf '%s' "$carimbo" | sed 's/^\([0-9]\{4\}\)\([0-9]\{2\}\).*/\1\/\2/')
    # shellcheck disable=SC2086
    if com_insistencia $RC copyto "$DESTINO/banco-$carimbo.dump" "$(no_b2 "banco/$mes/banco-$carimbo.dump")"; then
      log "B2: banco ok"
    else
      aviso "FALHOU o envio do banco para o B2"
      B2_RESULTADO=falhou
    fi
  fi

  if [ -d "$ARQUIVOS" ]; then
    # Arquivo por arquivo (só o que mudou sobe). No espelho, o que sumiu do
    # app é apagado do bucket; no histórico, vai para arquivos-removidos/.
    guardar=""
    [ "$B2_MODO_USO" = historico ] && guardar="--backup-dir $(no_b2 "arquivos-removidos/$carimbo")"
    # shellcheck disable=SC2086
    if com_insistencia $RC sync "$ARQUIVOS" "$(no_b2 arquivos)" $guardar; then
      log "B2: arquivos ok"
    else
      aviso "FALHOU o envio dos arquivos para o B2"
      B2_RESULTADO=falhou
    fi
  fi

  # Retenção no B2 só depois de um envio bom, pelo mesmo motivo da local:
  # no espelho, o dump anterior só sai quando o novo já está inteiro lá.
  if [ "$B2_RESULTADO" = ok ] && [ "$B2_MODO_USO" = espelho ]; then
    if [ -f "$DESTINO/banco-$carimbo.dump" ]; then
      # shellcheck disable=SC2086
      $RC delete "$(no_b2 banco)" --filter "- banco-$carimbo.dump" --filter "+ banco-*.dump" --filter "- *" --rmdirs 2>&1 | grep -v "^$" || true
    fi
    # Sobra do modo histórico (ou de antes do espelho): nada antigo fica.
    # shellcheck disable=SC2086
    $RC purge "$(no_b2 arquivos-removidos)" >/dev/null 2>&1 || true
  elif [ "$B2_RESULTADO" = ok ]; then
    # shellcheck disable=SC2086
    $RC delete "$(no_b2 banco)" --min-age "${B2_DIAS_USO}d" --include 'banco-*.dump' --rmdirs 2>&1 | grep -v "^$" || true
    # shellcheck disable=SC2086
    $RC delete "$(no_b2 arquivos-removidos)" --min-age "${B2_DIAS_USO}d" --rmdirs 2>/dev/null || true
  fi
}

# Resultado da última rodada, para quem olha o volume (ou um monitor) saber
# se o backup está em dia sem precisar ler o log.
registrar_status() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M')" "$1" >"$DESTINO/ULTIMO-BACKUP.txt" 2>/dev/null || true
}

bytes() { wc -c <"$1" 2>/dev/null | tr -d ' '; }

# --- Registro no banco (histórico do console) -----------------------------------
# Pega o pedido do console, se houver; senão abre uma linha nova. Sem as
# tabelas (base antiga) RODADA fica vazia e só o registro é pulado.
abrir_rodada() {
  RODADA=$(echo "update sistema_backups set estado = 'executando', iniciado_em = now()
                 where estado = 'pendente' returning id" | sql)
  if [ -z "$RODADA" ]; then
    RODADA=$(echo "insert into sistema_backups (origem, estado, iniciado_em)
                   values (:'origem', 'executando', now()) on conflict do nothing returning id" | sql -v origem="$1")
  fi
}

fechar_rodada() {
  [ -n "$RODADA" ] || return 0
  echo "update sistema_backups set estado = :'estado', b2 = :'b2', arquivo = nullif(:'arquivo', ''),
          bytes_banco = nullif(:'bb', '')::bigint, bytes_arquivos = nullif(:'ba', '')::bigint,
          mensagem = nullif(:'msg', ''), concluido_em = now()
        where id = :'id'" \
    | sql -v id="$RODADA" -v estado="$1" -v b2="$B2_RESULTADO" -v arquivo="$ARQUIVO_BANCO" \
          -v bb="$BYTES_BANCO" -v ba="$BYTES_ARQUIVOS" -v msg="$MENSAGEM" >/dev/null
}

sinal_de_vida() {
  destino=""
  [ "$B2_ORIGEM" != desligado ] && destino="$B2_BUCKET_USO/$B2_PASTA_USO"
  echo "insert into sistema_backup_servico (id, visto_em, hora, dias, b2_origem, b2_destino, cada_dias, b2_modo)
        values (1, now(), :'hora', :'dias', :'origem', nullif(:'destino', ''), :'cada', :'modo')
        on conflict (id) do update set visto_em = excluded.visto_em, hora = excluded.hora,
          dias = excluded.dias, b2_origem = excluded.b2_origem, b2_destino = excluded.b2_destino,
          cada_dias = excluded.cada_dias, b2_modo = excluded.b2_modo" \
    | sql -v hora="$HORA" -v dias="$DIAS" -v origem="$B2_ORIGEM" -v destino="$destino" \
          -v cada="$CADA_DIAS" -v modo="$B2_MODO_USO" >/dev/null
}

# O automático só roda quando o último backup bom (automático ou do botão)
# tem CADA_DIAS dias ou mais, contando em dias do fuso da stack. Sem nenhum
# backup bom, ou sem a tabela (base antiga), está vencido: melhor sobrar
# backup do que faltar. Falhou? Tenta de novo no dia seguinte.
backup_vencido() {
  r=$(echo "select coalesce((max(iniciado_em) at time zone :'fuso')::date + :'cada'::int
                 <= (now() at time zone :'fuso')::date, true)
            from sistema_backups where estado = 'ok'" | sql -v fuso="$FUSO" -v cada="$CADA_DIAS")
  [ "$r" != f ]
}

fazer_backup() {
  origem="${1:-manual}"
  carimbo=$(date +%Y%m%d-%H%M)
  banco_ok=false
  ARQUIVO_BANCO=""; BYTES_BANCO=""; BYTES_ARQUIVOS=""; MENSAGEM=""; B2_RESULTADO=desligado
  configurar_b2
  abrir_rodada "$origem"
  log "$carimbo começando ($origem)"

  # O dump só vale se o pg_restore conseguir ler o índice dele: um arquivo
  # truncado (disco cheio, conexão caída) passaria por "ok" e só seria
  # descoberto na hora de restaurar.
  if pg_dump -Fc -f "$DESTINO/banco-$carimbo.dump.parcial" \
    && pg_restore --list "$DESTINO/banco-$carimbo.dump.parcial" >/dev/null; then
    mv "$DESTINO/banco-$carimbo.dump.parcial" "$DESTINO/banco-$carimbo.dump"
    banco_ok=true
    ARQUIVO_BANCO="banco-$carimbo.dump"
    BYTES_BANCO=$(bytes "$DESTINO/$ARQUIVO_BANCO")
    log "banco ok ($(du -h "$DESTINO/$ARQUIVO_BANCO" | cut -f1))"
  else
    rm -f "$DESTINO/banco-$carimbo.dump.parcial"
    aviso "FALHOU o backup do banco"
    MENSAGEM="Falhou o backup do banco (veja o log do serviço backup)."
  fi

  if [ -d "$ARQUIVOS" ]; then
    if tar -czf "$DESTINO/arquivos-$carimbo.tar.gz.parcial" -C "$(dirname "$ARQUIVOS")" "$(basename "$ARQUIVOS")"; then
      mv "$DESTINO/arquivos-$carimbo.tar.gz.parcial" "$DESTINO/arquivos-$carimbo.tar.gz"
      BYTES_ARQUIVOS=$(bytes "$DESTINO/arquivos-$carimbo.tar.gz")
      log "arquivos ok ($(du -h "$DESTINO/arquivos-$carimbo.tar.gz" | cut -f1))"
    else
      rm -f "$DESTINO/arquivos-$carimbo.tar.gz.parcial"
      aviso "FALHOU o backup dos arquivos"
      MENSAGEM="${MENSAGEM:+$MENSAGEM }Falhou o pacote das fotos e anexos."
    fi
  fi

  # Retenção só depois de um backup bom: se o banco ficar dias falhando, as
  # cópias antigas são justamente as únicas que restam — não podem sumir.
  if [ "$banco_ok" = true ]; then
    find "$DESTINO" -maxdepth 1 \( -name 'banco-*.dump' -o -name 'arquivos-*.tar.gz' \) -mtime +"$DIAS" -delete
  else
    aviso "retenção adiada: nenhuma cópia antiga é apagada enquanto o backup do banco falhar"
  fi
  # Sobras de rodadas interrompidas (container parado no meio do dump).
  find "$DESTINO" -maxdepth 1 -name '*.parcial' -mmin +360 -delete 2>/dev/null || true

  enviar_b2 "$carimbo"
  [ "$B2_RESULTADO" = falhou ] && MENSAGEM="${MENSAGEM:+$MENSAGEM }Falhou o envio para o Backblaze B2 (confira a chave e o bucket)."

  if [ "$banco_ok" = true ]; then
    registrar_status "ok banco-$carimbo.dump"
    fechar_rodada ok
  else
    registrar_status "FALHOU (veja o log do serviço backup)"
    fechar_rodada erro
  fi
  log "$carimbo terminado"
  [ "$banco_ok" = true ]
}

minutos_agora() { h=$(date +%H); m=$(date +%M); echo $(( ${h#0} * 60 + ${m#0} )); }
passou_da_hora() { [ "$(minutos_agora)" -ge $(( HORA * 60 + 30 )) ]; }
tem_pedido() { [ -n "$(echo "select 1 from sistema_backups where estado = 'pendente' limit 1" | sql)" ]; }

aguardar_banco

if [ "${1:-}" = "agora" ]; then
  # Código de saída de verdade: quem roda à mão (ou num script antes de mexer
  # no servidor) precisa saber se o backup falhou.
  fazer_backup manual
  exit $?
fi

# Banco atrás da imagem (o Swarm não rodou o migrador de novo)? Atualiza
# aqui mesmo, antes de usar as tabelas novas.
garantir_esquema

# Rodada que ficou "executando" quando o serviço caiu nunca vai terminar:
# sem isto ela travaria a fila (só um backup ativo por vez).
echo "update sistema_backups set estado = 'erro', concluido_em = now(),
        mensagem = 'Interrompido: o serviço backup reiniciou no meio da rodada.'
      where estado = 'executando'" | sql >/dev/null

configurar_b2
sinal_de_vida
log "no ar: a cada ${CADA_DIAS} dias às ${HORA}h30, mantendo ${DIAS} dias em $DESTINO"

# Subiu depois da hora de hoje: o próximo agendado é amanhã (como antes).
ultimo_dia=""
passou_da_hora && ultimo_dia=$(date +%F)
if [ "${BACKUP_AO_INICIAR:-false}" = "true" ]; then fazer_backup manual || true; fi

while true; do
  sleep "$INTERVALO"
  configurar_b2
  sinal_de_vida
  if tem_pedido; then
    fazer_backup manual || true
  elif [ "$ultimo_dia" != "$(date +%F)" ] && passou_da_hora; then
    ultimo_dia=$(date +%F)
    if backup_vencido; then
      fazer_backup agendado || true
    else
      log "automático de hoje pulado: o último backup bom tem menos de $CADA_DIAS dias"
    fi
  fi
  sinal_de_vida
done
