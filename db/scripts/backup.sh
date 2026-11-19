#!/bin/sh
# Backup diário do banco (pg_dump, formato custom) e dos arquivos (fotos e
# anexos), com retenção, no volume "backups". Com as variáveis B2_* definidas,
# também manda tudo para o Backblaze B2 (fora do servidor) — veja INSTALACAO.md.
#
#   backup.sh          fica no ar e roda todo dia às BACKUP_HORA:30
#   backup.sh agora    roda uma vez e sai (para testar ou antes de mexer em algo)
set -u
. /ops/comum.sh

DESTINO="${BACKUP_DIR:-/backups}"
HORA="${BACKUP_HORA:-3}"          # hora local (TZ) em que roda
DIAS="${BACKUP_DIAS:-14}"         # quantos dias manter no servidor
ARQUIVOS="${ARQUIVOS_DIR:-/dados/arquivos}"

mkdir -p "$DESTINO"

# --- Backblaze B2 (opcional) ----------------------------------------------------
#   B2_KEY_ID      keyID da Application Key (Backblaze → Application Keys)
#   B2_APP_KEY     applicationKey (aparece uma vez só, na criação da chave)
#   B2_BUCKET      nome do bucket (privado)
#   B2_PASTA       pasta dentro do bucket (padrão: manutencao)
#   B2_DIAS        quantos dias manter os dumps do banco no B2 (padrão: 30)
#   B2_SENHA_CRIPTOGRAFIA  (opcional) criptografa tudo antes de sair do
#                  servidor. GUARDE ESSA SENHA: sem ela o backup não abre.
#
# O banco vai como um arquivo por dia. As fotos/anexos vão espelhados (só o
# que mudou sobe); o que for apagado no sistema fica guardado em
# "arquivos-removidos/<data>" por B2_DIAS dias antes de sumir do B2.
B2_PASTA="${B2_PASTA:-manutencao}"
B2_DIAS="${B2_DIAS:-30}"
B2_LIGADO=false

if [ -n "${B2_KEY_ID:-}" ] || [ -n "${B2_APP_KEY:-}" ] || [ -n "${B2_BUCKET:-}" ]; then
  if [ -z "${B2_KEY_ID:-}" ] || [ -z "${B2_APP_KEY:-}" ] || [ -z "${B2_BUCKET:-}" ]; then
    echo "[backup] AVISO: para o Backblaze B2 preencha B2_KEY_ID, B2_APP_KEY e B2_BUCKET. Só o backup local vai rodar." >&2
  else
    B2_LIGADO=true
    # rclone lê a configuração do ambiente: nada de senha em arquivo.
    export RCLONE_CONFIG_B2_TYPE=b2
    export RCLONE_CONFIG_B2_ACCOUNT="$B2_KEY_ID"
    export RCLONE_CONFIG_B2_KEY="$B2_APP_KEY"
    # Sem isso o B2 só "esconde" o arquivo apagado e continua cobrando por ele.
    export RCLONE_CONFIG_B2_HARD_DELETE=true
    REMOTO="b2:$B2_BUCKET/$B2_PASTA"
    if [ -n "${B2_SENHA_CRIPTOGRAFIA:-}" ]; then
      export RCLONE_CONFIG_B2CRIPTO_TYPE=crypt
      export RCLONE_CONFIG_B2CRIPTO_REMOTE="$REMOTO"
      RCLONE_CONFIG_B2CRIPTO_PASSWORD=$(rclone obscure "$B2_SENHA_CRIPTOGRAFIA")
      export RCLONE_CONFIG_B2CRIPTO_PASSWORD
      REMOTO="b2cripto:"
    fi
  fi
fi

# Repete comandos de rede (B2 fora do ar por um instante não perde o dia).
com_insistencia() {
  for tentativa in 1 2 3; do
    "$@" && return 0
    echo "[backup] tentativa $tentativa falhou, tentando de novo em 30s" >&2
    sleep 30
  done
  return 1
}

RC="rclone --config /dev/null --stats-one-line --stats 0 --retries 3 --low-level-retries 10"

enviar_b2() {
  carimbo="$1"
  [ "$B2_LIGADO" = true ] || return 0
  echo "[backup] enviando para o Backblaze B2 ($B2_BUCKET/$B2_PASTA)"

  if [ -f "$DESTINO/banco-$carimbo.dump" ]; then
    # shellcheck disable=SC2086
    if com_insistencia $RC copyto "$DESTINO/banco-$carimbo.dump" "$REMOTO/banco/banco-$carimbo.dump"; then
      echo "[backup] B2: banco ok"
    else
      echo "[backup] FALHOU o envio do banco para o B2" >&2
    fi
  fi

  if [ -d "$ARQUIVOS" ]; then
    # shellcheck disable=SC2086
    if com_insistencia $RC sync "$ARQUIVOS" "$REMOTO/arquivos" --backup-dir "$REMOTO/arquivos-removidos/$carimbo"; then
      echo "[backup] B2: arquivos ok"
    else
      echo "[backup] FALHOU o envio dos arquivos para o B2" >&2
    fi
  fi

  # Retenção no B2.
  # shellcheck disable=SC2086
  $RC delete "$REMOTO/banco" --min-age "${B2_DIAS}d" --include 'banco-*.dump' 2>&1 | grep -v "^$" || true
  # shellcheck disable=SC2086
  $RC delete "$REMOTO/arquivos-removidos" --min-age "${B2_DIAS}d" --rmdirs 2>/dev/null || true
}

# Resultado da última rodada, para quem olha o volume (ou um monitor) saber
# se o backup está em dia sem precisar ler o log.
registrar_status() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M')" "$1" >"$DESTINO/ULTIMO-BACKUP.txt" 2>/dev/null || true
}

fazer_backup() {
  carimbo=$(date +%Y%m%d-%H%M)
  banco_ok=false
  echo "[backup] $carimbo começando"

  # O dump só vale se o pg_restore conseguir ler o índice dele: um arquivo
  # truncado (disco cheio, conexão caída) passaria por "ok" e só seria
  # descoberto na hora de restaurar.
  if pg_dump -Fc -f "$DESTINO/banco-$carimbo.dump.parcial" \
    && pg_restore --list "$DESTINO/banco-$carimbo.dump.parcial" >/dev/null; then
    mv "$DESTINO/banco-$carimbo.dump.parcial" "$DESTINO/banco-$carimbo.dump"
    banco_ok=true
    echo "[backup] banco ok ($(du -h "$DESTINO/banco-$carimbo.dump" | cut -f1))"
  else
    rm -f "$DESTINO/banco-$carimbo.dump.parcial"
    echo "[backup] FALHOU o backup do banco" >&2
  fi

  if [ -d "$ARQUIVOS" ]; then
    if tar -czf "$DESTINO/arquivos-$carimbo.tar.gz.parcial" -C "$(dirname "$ARQUIVOS")" "$(basename "$ARQUIVOS")"; then
      mv "$DESTINO/arquivos-$carimbo.tar.gz.parcial" "$DESTINO/arquivos-$carimbo.tar.gz"
      echo "[backup] arquivos ok ($(du -h "$DESTINO/arquivos-$carimbo.tar.gz" | cut -f1))"
    else
      rm -f "$DESTINO/arquivos-$carimbo.tar.gz.parcial"
      echo "[backup] FALHOU o backup dos arquivos" >&2
    fi
  fi

  # Retenção só depois de um backup bom: se o banco ficar dias falhando, as
  # cópias antigas são justamente as únicas que restam — não podem sumir.
  if [ "$banco_ok" = true ]; then
    find "$DESTINO" -maxdepth 1 \( -name 'banco-*.dump' -o -name 'arquivos-*.tar.gz' \) -mtime +"$DIAS" -delete
  else
    echo "[backup] retenção adiada: nenhuma cópia antiga é apagada enquanto o backup do banco falhar" >&2
  fi
  # Sobras de rodadas interrompidas (container parado no meio do dump).
  find "$DESTINO" -maxdepth 1 -name '*.parcial' -mmin +360 -delete 2>/dev/null || true

  enviar_b2 "$carimbo"

  if [ "$banco_ok" = true ]; then
    registrar_status "ok banco-$carimbo.dump"
  else
    registrar_status "FALHOU (veja o log do serviço backup)"
  fi
  echo "[backup] $carimbo terminado"
  [ "$banco_ok" = true ]
}

segundos_ate_a_hora() {
  h=$(date +%H); m=$(date +%M); s=$(date +%S)
  agora=$(( ${h#0} * 3600 + ${m#0} * 60 + ${s#0} ))
  alvo=$(( HORA * 3600 + 30 * 60 ))
  if [ "$agora" -lt "$alvo" ]; then echo $(( alvo - agora )); else echo $(( 86400 - agora + alvo )); fi
}

aguardar_banco

if [ "${1:-}" = "agora" ]; then
  # Código de saída de verdade: quem roda à mão (ou num script antes de mexer
  # no servidor) precisa saber se o backup falhou.
  fazer_backup
  exit $?
fi

if [ "$B2_LIGADO" = true ]; then
  # Confere a chave logo na subida: erro de digitação aparece no log na hora,
  # não só às 3h30 da manhã.
  # shellcheck disable=SC2086
  if $RC lsf "b2:$B2_BUCKET" --max-depth 1 >/dev/null 2>&1; then
    echo "[backup] Backblaze B2 conectado: $B2_BUCKET/$B2_PASTA (banco por $B2_DIAS dias)$([ -n "${B2_SENHA_CRIPTOGRAFIA:-}" ] && echo ', criptografado')"
  else
    echo "[backup] AVISO: não consegui acessar o bucket $B2_BUCKET no Backblaze B2. Confira B2_KEY_ID, B2_APP_KEY e B2_BUCKET." >&2
  fi
fi

echo "[backup] no ar: todo dia às ${HORA}h30, mantendo ${DIAS} dias em $DESTINO"
if [ "${BACKUP_AO_INICIAR:-false}" = "true" ]; then fazer_backup || true; fi

while true; do
  sleep "$(segundos_ate_a_hora)"
  fazer_backup || true
done
