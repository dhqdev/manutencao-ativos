#!/usr/bin/env bash
# Prepara uma VM da Oracle Cloud (Ampere A1 / ARM64, Ubuntu 22.04 ou 24.04)
# para rodar o sistema. Rode UMA vez, como root:
#
#   sudo bash preparar-servidor.sh
#
# Faz: instala o Docker, libera as portas 80/443 no firewall da VM, liga o
# modo Swarm e cria a rede pública do Traefik. Pode rodar de novo sem problema.
#
# IMPORTANTE: na Oracle Cloud também é preciso liberar 80 e 443 na Security
# List (ou NSG) da VCN, pelo console — veja INSTALACAO.md, passo 1.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Rode como root (sudo)." >&2; exit 1; fi

echo "==> Arquitetura: $(uname -m)"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Instalando o Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

USUARIO="${SUDO_USER:-ubuntu}"
if id "$USUARIO" >/dev/null 2>&1; then
  usermod -aG docker "$USUARIO" || true
fi

echo "==> Liberando 80 e 443 no firewall da VM"
# As imagens Ubuntu da Oracle vêm com iptables bloqueando tudo menos a 22.
if command -v iptables >/dev/null 2>&1; then
  for porta in 80 443; do
    iptables -C INPUT -p tcp --dport "$porta" -m state --state NEW -j ACCEPT 2>/dev/null \
      || iptables -I INPUT 1 -p tcp --dport "$porta" -m state --state NEW -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save
  else
    DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null 2>&1 || true
    command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save || true
  fi
fi
if command -v firewall-cmd >/dev/null 2>&1; then   # Oracle Linux
  firewall-cmd --permanent --add-service=http --add-service=https && firewall-cmd --reload
fi

echo "==> Modo Swarm"
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active; then
  IP_PRIVADO=$(hostname -I | awk '{print $1}')
  docker swarm init --advertise-addr "$IP_PRIVADO"
fi

docker network inspect rede_publica >/dev/null 2>&1 \
  || docker network create --driver overlay --attachable rede_publica

echo
echo "Servidor pronto. Próximos passos (INSTALACAO.md):"
echo "  1. crie infra/.env com as chaves"
echo "  2. ./deploy.sh"
