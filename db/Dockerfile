# Imagem "ops": as tarefas do banco numa imagem só.
#   migrar             aplica db/sql/*.sql (idempotente) — roda a cada deploy
#   cron               chama a rotina do WhatsApp no minuto 1 de cada hora
#   backup             pg_dump + arquivos, todo dia, com retenção (e Backblaze B2)
#   backup-agora       um backup na hora (local + B2) e sai
#   importar-supabase  traz dados e arquivos do Supabase antigo (uma vez)
FROM postgres:17-alpine

RUN apk add --no-cache curl tzdata rclone

ENV TZ=America/Sao_Paulo
COPY sql/ /ops/sql/
COPY scripts/ /ops/
RUN chmod +x /ops/*.sh

ENTRYPOINT ["/ops/entrypoint.sh"]
CMD ["migrar"]
