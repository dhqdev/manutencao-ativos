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
# O limite do Traefik vale só para o envio dos formulários: abrir a tela de
# login muitas vezes (escritório inteiro atrás de um IP) não pode dar 429.
for _ in $(seq 1 80); do c=$(codigo "$BASE/login"); [ "$c" = "200" ] || break; done
[ "$c" = "200" ] && ok "abrir o login 80 vezes seguidas não esbarra no limite" || erro "abrir o login esbarrou no limite: $c"

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

confere 401 "limpeza de órfãos sem CRON_SECRET recusa" "$BASE/api/rotinas/orfaos" -X POST
r=$("${C[@]}" -X POST -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/rotinas/orfaos")
echo "$r" | grep -q '"ok":true' && ok "limpeza de órfãos roda ($r)" || erro "limpeza de órfãos: $r"

echo "— arquivos"
confere 403 "arquivo sem assinatura recusado" "$BASE/api/arquivos/11111111-2222-3333-4444-555555555555/x/a.pdf"
confere 403 "envio sem token recusado" "$BASE/api/arquivos/11111111-2222-3333-4444-555555555555/x/a.pdf" -X PUT --data-binary "x"

echo "— painel do Traefik"
# O painel só aparece quando o health check do próprio Traefik passa.
for _ in $(seq 1 30); do [ "$(codigo "https://$TRAEFIK_DOMINIO/dashboard/")" != "404" ] && break; sleep 2; done
confere 401 "painel exige senha" "https://$TRAEFIK_DOMINIO/dashboard/"
confere 200 "painel abre com a senha" "https://$TRAEFIK_DOMINIO/dashboard/" -u "admin:senha-de-teste"

echo "— serviços internos (pela rede da stack)"
interno() { docker run --rm --network manutencao_interna curlimages/curl:latest -s --max-time 10 "$@"; }
interno http://whatsapp:3000/saude | grep -q '"ok":true' && ok "serviço de WhatsApp no ar" || erro "WhatsApp não respondeu"
c=$(interno -o /dev/null -w '%{http_code}' http://whatsapp:3000/sessoes/teste); [ "$c" = "401" ] && ok "WhatsApp exige chave (401)" || erro "WhatsApp sem chave respondeu $c"
interno -H "Authorization: Bearer $WHATSAPP_API_KEY" http://whatsapp:3000/sessoes/manut_teste | grep -q '"status":"desconectado"' && ok "WhatsApp aceita a chave do app" || erro "WhatsApp recusou a chave"
# Token do banco do WhatsApp: só pela rede interna e só com a chave.
interno -X POST -H "Authorization: Bearer $WHATSAPP_API_KEY" http://app:3000/api/whatsapp/token | grep -q '"token"' && ok "app emite o token do WhatsApp na rede interna" || erro "app não emitiu o token do WhatsApp"
c=$(interno -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer errada" http://app:3000/api/whatsapp/token); [ "$c" = "401" ] && ok "token do WhatsApp exige a chave (401)" || erro "token do WhatsApp sem chave: $c"
confere 404 "token do WhatsApp não sai pela internet" "$BASE/api/whatsapp/token" -X POST -H "Authorization: Bearer $WHATSAPP_API_KEY"

echo "— migrador terminou"
docker service ps manutencao_migrador --format '{{.CurrentState}}' | head -1 | grep -q "Complete" && ok "migrador: Complete" || erro "migrador: $(docker service ps manutencao_migrador --format '{{.CurrentState}} {{.Error}}' | head -3)"

echo "— atualizador (botão Atualizar do console do superadmin)"
banco() { docker exec -i "$(docker ps -qf name=manutencao_db -n 1)" psql -U postgres -d manutencao -qtA "$@"; }
for _ in $(seq 1 30); do banco -c "select 1 from sistema_atualizador where visto_em > now() - interval '1 minute'" | grep -q 1 && break; sleep 2; done
banco -c "select stack from sistema_atualizador" | grep -qx manutencao && ok "atualizador no ar (sinal de vida no banco)" || erro "atualizador sem sinal: $(docker service logs --tail 5 manutencao_atualizador 2>&1)"
# Versão que não existe no registro: tem que recusar sem mexer em nenhum serviço.
banco -c "insert into sistema_atualizacoes (versao) values ('v2000.01.01-1')" >/dev/null
for _ in $(seq 1 30); do [ "$(banco -c "select estado from sistema_atualizacoes order by id desc limit 1")" = "erro" ] && break; sleep 2; done
r=$(banco -c "select estado || ': ' || coalesce(mensagem, '') from sistema_atualizacoes order by id desc limit 1")
echo "$r" | grep -q "^erro: .*não foi encontrada" && ok "versão inexistente recusada sem alterar nada" || erro "atualizador com versão inexistente: $r"
docker service inspect --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' manutencao_app | grep -q ":$TAG" && ok "app continua na versão testada" || erro "atualizador mexeu no app"
banco -c "insert into sistema_atualizacoes (versao) values ('x; rm -rf /')" >/dev/null 2>&1 && erro "banco aceitou versão fora do padrão" || ok "banco recusa versão fora do padrão"

echo "— permissões do banco (RLS e funções)"
r=$(banco -c "select string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity")
[ -z "$r" ] && ok "toda tabela pública com RLS" || erro "tabelas sem RLS: $r"
r=$(banco -c "select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')")
[ -z "$r" ] && ok "nenhuma função executável sem login" || erro "funções abertas ao anon: $r"
r=$(banco -c "select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'auth\_%' or p.proname like 'admin\_%') and has_function_privilege('authenticated', p.oid, 'execute')")
[ -z "$r" ] && ok "auth_* e admin_* só para o servidor" || erro "funções de servidor abertas ao usuário: $r"
r=$(banco -c "select count(*) from pg_policy where polrelid = 'public.org_membros'::regclass and polcmd <> 'r'")
[ "$r" = "0" ] && ok "org_membros sem escrita direta" || erro "org_membros tem $r policy(ies) de escrita"
r=$(banco -c "select string_agg(table_name, ', ') from information_schema.role_table_grants where grantee = 'whatsapp_servico' and table_name not in ('whatsapp_sessoes', 'whatsapp_conexoes')")
[ -z "$r" ] && ok "papel do WhatsApp só nas tabelas dele" || erro "whatsapp_servico enxerga: $r"

banco -c "select versao from sistema_esquema" | grep -Eq '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$' \
  && ok "migrador gravou a versão do esquema" || erro "sistema_esquema sem versão: $(banco -c "select versao from sistema_esquema" 2>&1)"
echo "— backup (pg_dump 17 contra o banco da stack)"
docker run --rm --network manutencao_interna -e PGHOST=db -e PGPASSWORD="$POSTGRES_PASSWORD" \
  --entrypoint sh "$IMAGEM_BASE/ops:$TAG" -c '. /ops/comum.sh && pg_dump -Fc -f /tmp/b.dump && test -s /tmp/b.dump && pg_restore -l /tmp/b.dump | grep -q "TABLE DATA public ativos"' \
  && ok "pg_dump gera um backup restaurável" || erro "backup falhou"
docker run --rm --network manutencao_interna -e PGHOST=db -e PGPASSWORD="$POSTGRES_PASSWORD" -e BACKUP_DIR=/tmp/bk \
  --entrypoint sh "$IMAGEM_BASE/ops:$TAG" -c '/ops/backup.sh agora >/dev/null && grep -q "^.* ok banco-" /tmp/bk/ULTIMO-BACKUP.txt' \
  && ok "backup-agora termina com sucesso e registra o status" || erro "backup-agora falhou"
[ "$(banco -c "select count(*) from sistema_backups where estado = 'ok' and arquivo like 'banco-%'")" -ge 1 ] \
  && ok "backup registrado no histórico do console" || erro "backup-agora não registrou a rodada em sistema_backups"
for _ in $(seq 1 30); do [ -n "$(banco -c "select 1 from sistema_backup_servico where visto_em > now() - interval '1 minute'")" ] && break; sleep 2; done
[ -n "$(banco -c "select 1 from sistema_backup_servico where visto_em > now() - interval '1 minute'")" ] \
  && ok "serviço backup no ar (sinal de vida no banco)" || erro "serviço backup sem sinal: $(docker service logs --tail 5 manutencao_backup 2>&1)"

echo
if [ "$falhas" -gt 0 ]; then echo "$falhas verificação(ões) falharam."; exit 1; fi
echo "Todas as verificações passaram."
