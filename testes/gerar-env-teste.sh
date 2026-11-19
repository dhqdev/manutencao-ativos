#!/usr/bin/env bash
# .env descartável para o teste da stack no GitHub Actions (chaves aleatórias,
# domínios .localhost, Let's Encrypt de staging — que recusa .localhost e
# deixa o Traefik usar o certificado padrão dele).
set -euo pipefail
aleatorio() { openssl rand -hex "$1"; }
cat <<ENV
DOMINIO='manutencao.localhost'
TRAEFIK_DOMINIO='traefik.localhost'
ACME_EMAIL='ci@exemplo.com'
ACME_CA='https://acme-staging-v02.api.letsencrypt.org/directory'
IMAGEM_BASE='${IMAGEM_BASE:-ghcr.io/dhqdev/manutencao-ativos}'
TAG='${TAG:-latest}'
POSTGRES_PASSWORD='$(aleatorio 24)'
AUTHENTICATOR_PASSWORD='$(aleatorio 24)'
JWT_SECRET='$(aleatorio 32)'
SESSAO_SECRET='$(aleatorio 32)'
ARQUIVOS_SECRET='$(aleatorio 32)'
CRON_SECRET='$(aleatorio 32)'
WHATSAPP_API_KEY='$(aleatorio 32)'
TRAEFIK_PAINEL_USUARIOS='admin:$(openssl passwd -apr1 senha-de-teste)'
CADASTRO_ABERTO='true'
ENV
