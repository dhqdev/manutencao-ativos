# syntax=docker/dockerfile:1
# App Next.js (saída standalone). Construída para linux/arm64 no GitHub Actions.

FROM node:22-alpine AS dependencias
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
# `npm ci` quando o lockfile está em dia; senão `npm install` resolve.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS execucao
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ARQUIVOS_DIR=/dados/arquivos \
    TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata && mkdir -p /dados/arquivos && chown -R node:node /dados

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# Versão da release (vAAAA.MM.DD-N), passada pelo GitHub Actions. O painel do
# superadmin compara com a última publicada no ghcr.io. Fica no fim para não
# invalidar o cache das camadas de cima.
ARG VERSAO=dev
ENV APP_VERSAO=$VERSAO

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
