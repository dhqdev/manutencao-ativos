#!/bin/sh
# Backup diário do banco (pg_dump, formato custom) e dos arquivos (fotos e
# anexos), com retenção. Fica no volume "backups" — copie para fora do
# servidor também (veja INSTALACAO.md → Backups).
set -u
. /ops/comum.sh

DESTINO="${BACKUP_DIR:-/backups}"
HORA="${BACKUP_HORA:-3}"          # hora local (TZ) em que roda
DIAS="${BACKUP_DIAS:-14}"         # quantos dias manter
ARQUIVOS="${ARQUIVOS_DIR:-/dados/arquivos}"

mkdir -p "$DESTINO"

fazer_backup() {
  carimbo=$(date +%Y%m%d-%H%M)
  echo "[backup] $carimbo começando"

  if pg_dump -Fc -f "$DESTINO/banco-$carimbo.dump.parcial"; then
    mv "$DESTINO/banco-$carimbo.dump.parcial" "$DESTINO/banco-$carimbo.dump"
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

  find "$DESTINO" -maxdepth 1 \( -name 'banco-*.dump' -o -name 'arquivos-*.tar.gz' \) -mtime +"$DIAS" -delete
}

segundos_ate_a_hora() {
  h=$(date +%H); m=$(date +%M); s=$(date +%S)
  agora=$(( ${h#0} * 3600 + ${m#0} * 60 + ${s#0} ))
  alvo=$(( HORA * 3600 + 30 * 60 ))
  if [ "$agora" -lt "$alvo" ]; then echo $(( alvo - agora )); else echo $(( 86400 - agora + alvo )); fi
}

aguardar_banco
echo "[backup] no ar: todo dia às ${HORA}h30, mantendo ${DIAS} dias em $DESTINO"
[ "${BACKUP_AO_INICIAR:-false}" = "true" ] && fazer_backup

while true; do
  sleep "$(segundos_ate_a_hora)"
  fazer_backup
done
