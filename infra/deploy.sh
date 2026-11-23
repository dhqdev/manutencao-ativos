#!/usr/bin/env bash
# Sobe (ou atualiza) tudo no Docker Swarm deste servidor.
#
#   ./deploy.sh                 usa TAG do .env (padrão: latest)
#   TAG=abc1234 ./deploy.sh     versão específica (o GitHub Actions faz assim)
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Falta infra/.env. Crie a partir de .env.exemplo (veja INSTALACAO.md)." >&2
  exit 1
fi

TAG_PEDIDA="${TAG:-}"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
export TAG="${TAG_PEDIDA:-${TAG:-latest}}"
# always = confere no registro se há imagem nova; never = usa a imagem local (CI).
RESOLVER="${RESOLVER_IMAGEM:-always}"

obrigatorias=(DOMINIO TRAEFIK_DOMINIO ACME_EMAIL POSTGRES_PASSWORD AUTHENTICATOR_PASSWORD JWT_SECRET SESSAO_SECRET ARQUIVOS_SECRET CRON_SECRET WHATSAPP_API_KEY TRAEFIK_PAINEL_USUARIOS)
for v in "${obrigatorias[@]}"; do
  if [ -z "${!v:-}" ]; then echo "Variável $v vazia em infra/.env" >&2; exit 1; fi
  # Valor de exemplo é público (está no repositório): quem o lê forja sessões.
  case "${!v}" in TROQUE*|*TROQUE-*) echo "Variável $v ainda com o valor de exemplo (TROQUE-...). Gere um valor seu." >&2; exit 1;; esac
done
case "${SUPERADMIN_SENHA:-}" in TROQUE*) echo "SUPERADMIN_SENHA ainda com o valor de exemplo. Escolha uma senha sua." >&2; exit 1;; esac

if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active; then
  echo "Este servidor não está em modo Swarm. Rode: docker swarm init" >&2
  exit 1
fi

docker network inspect rede_publica >/dev/null 2>&1 \
  || docker network create --driver overlay --attachable rede_publica

echo "==> traefik"
docker stack deploy --detach=true --with-registry-auth --resolve-image "$RESOLVER" -c traefik.yml traefik

echo "==> manutencao (versão $TAG)"
docker stack deploy --detach=true --with-registry-auth --resolve-image "$RESOLVER" --prune -c stack.yml manutencao

# O migrador aplica o SQL da versão nova e termina. --force garante que ele
# rode a cada deploy, mesmo que a imagem não tenha mudado.
docker service update --force --detach manutencao_migrador >/dev/null

echo
docker stack services manutencao
echo
echo "Pronto. Acompanhe com: docker service logs -f manutencao_app"
