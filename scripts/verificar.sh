#!/usr/bin/env bash
# Verificação local antes do push: as mesmas checagens do job "verificar" do
# GitHub Actions. Roda sozinha no pre-push (.githooks/pre-push) e à mão com
# `npm run verificar`. Se algo falha aqui, falharia no Actions também — melhor
# descobrir antes de subir.
#
#   npm run verificar            tudo (lock, tipos, unidade, build, WhatsApp, shell)
#   VERIFICAR_RAPIDO=1 ...       pula o build do Next (o passo mais lento)
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
cd "$raiz"

passo() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
falha() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

passo "package-lock.json em sincronia com o package.json"
# O CI e o Dockerfile usam `npm ci`, que recusa lock fora de sincronia.
# O --dry-run só confere, não instala nem reescreve nada.
npm ci --dry-run --ignore-scripts --no-audit --no-fund >/dev/null 2>&1 \
  || falha "package-lock.json fora de sincronia: rode \`npm install\` e commite o lock."

if [ ! -d node_modules ]; then
  passo "Dependências do app"
  npm ci --no-audit --no-fund
fi

passo "Tipos (tsc)"
npm run --silent typecheck

passo "Testes de unidade (lib/form, lib/format)"
npm run --silent testar

if [ "${VERIFICAR_RAPIDO:-}" != "1" ]; then
  passo "Build do Next"
  NEXT_TELEMETRY_DISABLED=1 npm run --silent build
fi

passo "Serviço de WhatsApp"
(
  cd whatsapp
  # Lock versionado: a imagem instala exatamente o que foi testado (npm ci).
  npm ci --dry-run --ignore-scripts --no-audit --no-fund >/dev/null 2>&1 \
    || falha "whatsapp/package-lock.json fora de sincronia: rode \`npm install\` em whatsapp/ e commite o lock."
  [ -d node_modules ] || npm ci --no-audit --no-fund
  node --check src/index.js
  npm test --silent
)

passo "Teste ponta a ponta (sintaxe)"
node --check testes/e2e.mjs

passo "Scripts de shell"
for f in db/scripts/*.sh; do sh -n "$f"; done
for f in infra/*.sh testes/*.sh scripts/*.sh .githooks/*; do bash -n "$f"; done

printf '\n\033[1;32m✓ Tudo certo para subir.\033[0m\n'
