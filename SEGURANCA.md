# Segurança

Registro do que foi auditado, o que estava errado e como está hoje.

---

## Falhas encontradas e corrigidas

### 1. Vazamento de dados entre empresas (grave)

`whatsapp_pendencias()` era `SECURITY DEFINER` **sem checar quem chamava**.
Qualquer usuário autenticado podia passar o id de outra empresa e ler as
manutenções dela — ativos, placas, o que estava atrasado.

Corrigido: virou `SECURITY INVOKER`, então o RLS de quem chama passa a valer.

Testado com duas empresas e dois usuários:

```
ATACANTE (Empresa B) chamando whatsapp_pendencias(Empresa A) -> 0 linhas
DONA (Empresa A) chamando a mesma função                     -> 1 linha
```

### 2. Rotina de notificação inalcançável (grave, e silenciosa)

O proxy redirecionava **toda** requisição sem sessão para `/login` — inclusive
`/api/notificacoes/disparar`. Como o agendador não manda cookie de sessão, o
resumo diário nunca dispararia, e sem erro visível: o cron receberia um `307` e
consideraria sucesso.

Corrigido: rotas sob `/api/` não passam pelo redirecionamento; cada uma
autentica do seu jeito.

```
sem auth        -> 401
segredo errado  -> 401
Bearer correto  -> 200 {"verificadas":1,"enviadas":0,"puladas":1,"falhas":[]}
```

### 3. Open redirect no login

`/login?redirect=//site-falso.com` mandava o usuário recém-autenticado para
outro domínio. É o truque clássico de phishing: o link parte do domínio
legítimo, e a vítima cai numa cópia da tela de login.

Corrigido em `lib/url-segura.ts`, aplicado na página **e** na server action:

```
//evil.com        -> /dashboard
/\evil.com        -> /dashboard
https://evil.com  -> /dashboard
/relatorios       -> /relatorios   (caminho interno passa)
```

### 4. Funções internas ao alcance de qualquer usuário

No PostgreSQL, toda função nasce executável por `PUBLIC`. `seed_categorias_padrao()`
podia ser chamada por qualquer pessoa logada, em qualquer empresa.

Corrigido: `revoke execute on all functions in schema public from public`, com
liberação explícita só do que o app usa. Verificado:

```
seed_categorias_padrao(outra_empresa) -> ERROR: permission denied
```

### 5. Segredo em query string

O disparo aceitava `?segredo=...`, que aparece em log de acesso e no cabeçalho
`Referer`. Agora só o cabeçalho `Authorization`, com comparação de tempo
constante (`timingSafeEqual`) para não vazar o segredo por diferença de latência.

### 6. Anexos sem validação de dono

`registrarAnexo` aceitava qualquer `manutencaoId`. O RLS impedia a leitura, mas
dava para sujar o banco de outra empresa. Agora valida dono, tipo de arquivo e
se o caminho começa pela pasta da própria empresa.

### 7. Sem cabeçalhos de segurança

Nenhum. Hoje, em produção:

```
content-security-policy: default-src 'self'; script-src 'self' 'nonce-...' 'strict-dynamic'; ...
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
cross-origin-opener-policy: same-origin
```

---

### 8. Papéis só existiam no nome (grave)

Técnico e leitor conseguiam criar, editar e excluir ativos, apagar histórico,
mudar os dados da empresa e desconectar o WhatsApp — as policies de RLS só
checavam se a pessoa era membro. Corrigido na migração v2 (hoje em `db/sql/10-schema.sql`):

| | Proprietário / Gestor | Técnico | Leitor |
|---|---|---|---|
| Ver tudo | ✓ | ✓ | ✓ |
| Registrar manutenção e anexos, movimentar pneus | ✓ | ✓ | — |
| Categorias, ativos, periódicas, cadastro de pneus | ✓ | — | — |
| Excluir manutenções / limpar histórico | ✓ | — | — |
| Dados da empresa, WhatsApp, equipe | ✓ | — | — |

A tela esconde os botões (`lib/permissoes.ts`), mas quem barra é o banco.

### 9. Convite de usuário não pode vir do formulário

Usuários criados pelo gestor entram direto na empresa pelo trigger
`handle_new_user`, que lê o convite de `raw_app_meta_data` — campo que só a
chave de serviço define. Ler de `raw_user_meta_data` (preenchido pelo
formulário público de cadastro) deixaria qualquer pessoa se colocar dentro de
outra empresa. A troca de senha pelo gestor só vale para quem participa
apenas daquela empresa, para um gestor não tomar a conta do dono de outra.

---

## Content Security Policy

Cada requisição gera um **nonce** novo. Só scripts com aquele nonce rodam, e
`'strict-dynamic'` faz o navegador confiar apenas no que eles carregarem. Na
prática: mesmo que um texto malicioso chegue ao HTML, ele não executa.

Verificado em produção: **10 de 10 scripts com nonce, zero violações no console.**

### ⚠️ Armadilha: página estática quebra com esta CSP

O nonce vem do cabeçalho da requisição, então **só existe em renderização
dinâmica**. Uma página pré-gerada no build sai com os scripts sem nonce e, como
`'strict-dynamic'` faz o navegador ignorar o `'self'`, **todo o JavaScript dela
é bloqueado** — a página aparece, mas nada funciona.

Isso aconteceu de verdade aqui: `/cadastro` e `/recuperar-senha` ficaram com os
10 scripts bloqueados e os formulários não enviavam. Corrigido com
`export const dynamic = "force-dynamic"` em todas as páginas fora do grupo
autenticado (que já é dinâmico por usar cookies).

**Ao criar uma página nova fora de `app/(app)/`, adicione essa linha.** Para
conferir:

```bash
curl -s https://SEU_DOMINIO/pagina-nova \
  | grep -c '<script'            # total
curl -s https://SEU_DOMINIO/pagina-nova \
  | grep -c '<script[^>]*nonce="'  # precisa dar o mesmo número
```

Verificação atual:

```
/login            scripts=10  sem nonce=0     violações no navegador: 0
/cadastro         scripts=10  sem nonce=0     violações no navegador: 0
/recuperar-senha  scripts=10  sem nonce=0
/offline          scripts=11  sem nonce=0     violações no navegador: 0
```

Duas escolhas conscientes:

- `style-src` usa `'unsafe-inline'`. Atributos `style` inline (as cores das
  categorias, as barras dos gráficos) não aceitam nonce. Em `style-src` isso não
  permite executar código — o risco é cosmético, não de execução.
- `connect-src` e `img-src` ficam só no próprio domínio: dados e fotos passam
  pelo app (`/api/arquivos`), nenhum domínio externo é liberado.

---

## Isolamento entre empresas

Todas as tabelas têm RLS. A regra é sempre a mesma: a linha só aparece se o
`org_id` dela estiver entre as empresas de que o usuário é membro.

O app chama o PostgREST com um JWT de 5 minutos `{ sub: <usuário>, role:
"authenticated" }`; o banco lê o `sub` em `auth.uid()` e o RLS filtra. Sem JWT,
o papel `anon` não tem permissão em tabela nenhuma. E o PostgREST nem é
acessível de fora: fica só na rede interna do Swarm.

O teste ponta a ponta do GitHub Actions cria duas empresas e confere que a
segunda não enxerga nada da primeira.

Para evitar recursão infinita, as funções usadas dentro das policies
(`user_org_ids`, `user_admin_org_ids`) são `SECURITY DEFINER`.

---

## Segredos

Nenhuma variável tem prefixo `NEXT_PUBLIC_`: todas são lidas em tempo de
execução, só no servidor, a partir do `infra/.env` da VM (modo 600, fora do
Git). Cada chave tem um papel só — ver INSTALACAO.md → "Trocar chaves".

`lib/whatsapp.ts`, `lib/db/*`, `lib/auth/sessao.ts` e `lib/arquivos.ts` são
`server-only`: se alguém importar num componente de cliente, **o build falha**
em vez de vazar.

## Autenticação própria

- Senhas em **bcrypt** (custo 10). Senha errada e e-mail inexistente levam o
  mesmo tempo para responder (não dá para descobrir quem tem conta).
- **Limite de tentativas**: 8 falhas por e-mail ou 30 por IP em 15 minutos
  bloqueiam novas tentativas. O IP vem do Traefik, que descarta o
  `X-Forwarded-For` enviado pelo cliente.
- **Sessões no banco** (`auth.sessoes`): sair, trocar a senha, receber senha
  nova do gestor ou ser excluído derruba a sessão na hora. Duram 30 dias e se
  renovam com o uso.
- Cookie `httpOnly`, `Secure` (com HTTPS) e `SameSite=Lax`, assinado com
  `SESSAO_SECRET` — diferente do `JWT_SECRET` do banco.
- Link de recuperação de senha: uso único, 30 minutos, só o hash fica no banco.
- As funções `auth_*` só podem ser executadas pelo `service_role`.

## Arquivos

Fotos e anexos ficam no volume `manutencao_arquivos`. Nada é público:

- **Leitura** só com link assinado (HMAC, `ARQUIVOS_SECRET`) de 1 hora, gerado
  para caminhos que vieram do banco já filtrados pelo RLS.
- **Envio** só com autorização de 15 minutos para **um** caminho, que começa
  obrigatoriamente pela pasta da empresa; leitor não envia.
- Só imagem (JPG, PNG, WEBP, HEIC) e PDF, até 25 MB, sem sobrescrever.
- Caminhos com `..`, barras extras ou fora do formato são recusados.
- A resposta vem com `Content-Security-Policy: sandbox` e `nosniff`: mesmo um
  arquivo malicioso não executa nada no navegador.

## O que continua sendo responsabilidade sua

- **Backups fora da VM** (INSTALACAO.md → Backups).
- **Atualizar o sistema operacional** da VM e manter o SSH só com chave.
- **Ativar SMTP** se quiser recuperação de senha por e-mail.
- Desligar o cadastro público (`CADASTRO_ABERTO='false'`) se o sistema for só
  para a sua empresa.

## Como reproduzir a auditoria

O GitHub Actions faz tudo isso a cada push (`testes/verificar-stack.sh` e
`testes/e2e.mjs`). À mão:

```bash
# Cabeçalhos
curl -sI https://SEU_DOMINIO/login | grep -iE "content-security|x-frame|strict-transport"

# Open redirect
curl -s "https://SEU_DOMINIO/login?redirect=//evil.com" | grep 'name="redirect"'
# esperado: value="/dashboard"

# Rotina protegida
curl -s -o /dev/null -w "%{http_code}\n" https://SEU_DOMINIO/api/notificacoes/disparar
# esperado: 401

# O banco não responde de fora
curl -s https://SEU_DOMINIO/organizacoes | head -c 100   # esperado: página do app, não JSON
```

---

## Integridade entre empresas

O RLS confere só o `org_id` da própria linha. Antes desta migração, dava para
gravar, na empresa A, uma manutenção apontando para o **ativo ou o plano da
empresa B** (bastava conhecer o id, que aparece na URL de `/ativos/[id]`). Como
o trigger `trg_avancar_plano` roda como `SECURITY DEFINER`, ele então alterava
o horímetro do ativo e as datas do plano **da outra empresa**.

Agora um trigger `BEFORE` (`garantir_mesma_empresa`) recusa a gravação quando
ativo → categoria, plano → ativo, manutenção → ativo/plano, anexo → manutenção
ou pneu → ativo apontam para outra empresa. Linhas antigas não são tocadas.

## Credenciais do WhatsApp (whatsapp_sessoes)

As chaves de criptografia de cada número conectado ficam na tabela
`whatsapp_sessoes`, com RLS ligado e **nenhuma policy**: nem `anon` nem
`authenticated` leem nada. Só o serviço de WhatsApp (como `service_role`)
acessa. Quem tiver essas linhas consegue mandar mensagem como a empresa —
trate o `JWT_SECRET` e os backups com o mesmo cuidado.
