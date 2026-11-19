# Imagem "ops": as tarefas do banco numa imagem só.
#   migrar             aplica db/sql/*.sql (idempotente) — roda a cada deploy
#   cron               chama a rotina do WhatsApp no minuto 1 de cada hora
#   backup             pg_dump + arquivos, todo dia, com retenção (e Backblaze B2)
#   backup-agora       um backup na hora (local + B2) e sai
#   importar-supabase  traz dados e arquivos do Supabase antigo (uma vez)
#   atualizador        aplica a versão nova pedida no painel do superadmin
#                      (precisa do socket do Docker; veja atualizador.sh)
FROM postgres:17-alpine

RUN apk add --no-cache curl tzdata rclone docker-cli

# Versão da release (vAAAA.MM.DD-N), passada pelo CI: os serviços que ficam no
# ar comparam com a do banco e aplicam o SQL se o banco estiver atrás.
ARG VERSAO=dev
ENV TZ=America/Sao_Paulo OPS_VERSAO=$VERSAO
COPY sql/ /ops/sql/
COPY scripts/ /ops/
RUN chmod +x /ops/*.sh

ENTRYPOINT ["/ops/entrypoint.sh"]
CMD ["migrar"]
