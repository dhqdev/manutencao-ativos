#!/bin/sh
set -eu

case "${1:-migrar}" in
  migrar)            exec /ops/migrar.sh ;;
  cron)              exec /ops/cron.sh ;;
  backup)            exec /ops/backup.sh ;;
  backup-agora)      exec /ops/backup.sh agora ;;
  importar-supabase) exec /ops/importar-supabase.sh ;;
  atualizador)       exec /ops/atualizador.sh ;;
  *)                 exec "$@" ;;
esac
