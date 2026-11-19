#!/bin/sh
# Chama a rotina do resumo do WhatsApp no minuto 1 de cada hora. Cada empresa
# recebe uma vez por dia, a partir do horário que escolheu (a rotina decide).
set -u

APP_URL="${APP_URL:-http://app:3000}"
if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET não definida." >&2
  exit 1
fi

segundos_ate_o_minuto_1() {
  m=$(date +%M); s=$(date +%S)
  agora=$(( ${m#0} * 60 + ${s#0} ))
  if [ "$agora" -lt 60 ]; then echo $(( 60 - agora )); else echo $(( 3660 - agora )); fi
}

echo "[cron] no ar: resumo do WhatsApp no minuto 1 de cada hora ($APP_URL)"
while true; do
  sleep "$(segundos_ate_o_minuto_1)"
  echo "[cron] $(date '+%d/%m %H:%M') disparando"
  curl -fsS --max-time 290 \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$APP_URL/api/notificacoes/disparar" \
    || echo "[cron] falhou — a próxima hora tenta de novo"
  echo
  sleep 5
done
