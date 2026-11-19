#!/bin/sh
set -eu

case "${1:-migrar}" in
  migrar)            exec /ops/migrar.sh ;;
  cron)              exec /ops/cron.sh ;;
  backup)            exec /ops/backup.sh ;;
  importar-supabase) exec /ops/importar-supabase.sh ;;
  *)                 exec "$@" ;;
esac
