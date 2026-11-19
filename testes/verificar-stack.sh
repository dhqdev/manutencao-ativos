#!/usr/bin/env bash
# Verificações da stack no ar (rodadas pelo GitHub Actions depois do deploy):
# segurança, rotina do cron, banco, WhatsApp, backup. Usa infra/.env.
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . infra/.env; set +a

BASE="https://$DOMINIO"
C=(curl -sk --max-time 30 --resolve "$DOMINIO:443:127.0.0.1" --resolve "$DOMINIO:80:127.0.0.1" --resolve "$TRAEFIK_DOMINIO:443:127.0.0.1")
falhas=0
ok()   { echo "  ✓ $1"; }
erro() { echo "  ✗ $1"; falhas=$((falhas + 1)); }
codigo() { "${C[@]}" -o /dev/null -w '%{http_code}' "$@"; }
confere() { local esperado="$1" nome="$2"; shift 2; local c; c=$(codigo "$@"); [ "$c" = "$esperado" ] && ok "$nome ($c)" || erro "$nome: esperado $esperado, veio $c"; }

echo "Verificando $BASE"

echo "— entrada"
c=$(codigo "http://$DOMINIO/login"); case "$c" in 301|302|307|308) ok "HTTP redireciona para HTTPS ($c)";; *) erro "HTTP → HTTPS: veio $c";; esac
confere 200 "tela de login" "$BASE/login"
confere 307 "tela interna sem sessão manda para o login" "$BASE/dashboard"
"${C[@]}" -I "$BASE/login" | grep -qi "content-security-policy" && ok "cabeçalho CSP presente" || erro "sem CSP"
"${C[@]}" -I "$BASE/login" | grep -qi "strict-transport-security" && ok "HSTS presente" || erro "sem HSTS"

echo "— app ↔ banco"
"${C[@]}" "$BASE/api/saude?banco=1" | grep -q '"banco":"ok"' && ok "app → PostgREST → Postgres" || erro "saúde do banco: $("${C[@]}" "$BASE/api/saude?banco=1")"

echo "— o banco NÃO fica exposto na internet"
r=$("${C[@]}" "$BASE/organizacoes"); echo "$r" | grep -q '^\[' && erro "PostgREST respondeu pela internet!" || ok "PostgREST inacessível de fora"
r=$("${C[@]}" "$BASE/rpc/auth_usuario_por_email"); echo "$r" | grep -q '"hash"' && erro "função de auth exposta!" || ok "funções de autenticação inacessíveis de fora"

echo "— rotina do WhatsApp (cron)"
confere 401 "sem CRON_SECRET recusa" "$BASE/api/notificacoes/disparar"
confere 401 "CRON_SECRET errado recusa" "$BASE/api/notificacoes/disparar" -H "Authorization: Bearer errado"
r=$("${C[@]}" -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/notificacoes/disparar")
echo "$r" | grep -q '"verificadas"' && ok "com CRON_SECRET roda ($r)" || erro "rotina: $r"

echo "— arquivos"
confere 403 "arquivo sem assinatura recusado" "$BASE/api/arquivos/11111111-2222-3333-4444-555555555555/x/a.pdf"
confere 403 "envio sem token recusado" "$BASE/api/arquivos/11111111-2222-3333-4444-555555555555/x/a.pdf" -X PUT --data-binary "x"

echo "— painel do Traefik"
confere 401 "painel exige senha" "https://$TRAEFIK_DOMINIO/dashboard/"
confere 200 "painel abre com a senha" "https://$TRAEFIK_DOMINIO/dashboard/" -u "admin:senha-de-teste"

echo "— serviços internos (pela rede da stack)"
interno() { docker run --rm --network manutencao_interna curlimages/curl:latest -s --max-time 10 "$@"; }
interno http://whatsapp:3000/saude | grep -q '"ok":true' && ok "serviço de WhatsApp no ar" || erro "WhatsApp não respondeu"
c=$(interno -o /dev/null -w '%{http_code}' http://whatsapp:3000/sessoes/teste); [ "$c" = "401" ] && ok "WhatsApp exige chave (401)" || erro "WhatsApp sem chave respondeu $c"
interno -H "Authorization: Bearer $WHATSAPP_API_KEY" http://whatsapp:3000/sessoes/manut_teste | grep -q '"status":"desconectado"' && ok "WhatsApp aceita a chave do app" || erro "WhatsApp recusou a chave"

echo "— migrador terminou"
docker service ps manutencao_migrador --format '{{.CurrentState}}' | head -1 | grep -q "Complete" && ok "migrador: Complete" || erro "migrador: $(docker service ps manutencao_migrador --format '{{.CurrentState}} {{.Error}}' | head -3)"

echo "— backup (pg_dump 17 contra o banco da stack)"
docker run --rm --network manutencao_interna -e PGHOST=db -e PGPASSWORD="$POSTGRES_PASSWORD" \
  --entrypoint sh "$IMAGEM_BASE/ops:$TAG" -c '. /ops/comum.sh && pg_dump -Fc -f /tmp/b.dump && test -s /tmp/b.dump && pg_restore -l /tmp/b.dump | grep -q "TABLE DATA public ativos"' \
  && ok "pg_dump gera um backup restaurável" || erro "backup falhou"

echo
if [ "$falhas" -gt 0 ]; then echo "$falhas verificação(ões) falharam."; exit 1; fi
echo "Todas as verificações passaram."
