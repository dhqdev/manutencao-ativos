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
outra empresa. A troca de senha pelo gestor só vale para o login que a
própria empresa criou ("Criar usuário") e que participa apenas dela: um gestor
não toma a conta do dono de outra empresa, nem de quem criou a própria conta.
O superadmin nunca entra em equipe (`adicionar_membro` responde como se o
e-mail não existisse) e a senha dele só muda pela stack: `auth_definir_senha`
recusa, e "Esqueci minha senha" não manda link para ele. Sem essas travas, o
gestor de qualquer empresa punha o e-mail do superadmin na equipe, gerava uma
senha nova e entrava no console. `org_membros` não tem escrita direta: só as
funções mexem nela. A mesma trava (`alvoDaEquipe` em `lib/actions/equipe.ts`) vale para editar
nome/cargo/telefone e para desconectar alguém da equipe. O último acesso e as
sessões abertas da tela Equipe vêm de `equipe_acessos()` (`db/sql/60-equipe.sql`),
que só responde para membros da empresa pedida e devolve só esses dois dados.

### 12. Conta pré-cadastrada entrava na equipe no lugar do funcionário (grave)

O cadastro público não prova que o e-mail é de quem cadastrou. Um estranho
cadastrava `joao@empresa.com.br` antes do João; quando o gestor ia "Criar
usuário" para ele, o sistema via que o e-mail já tinha conta e só a punha na
equipe — a conta do estranho, com a senha do estranho.

Agora todo login nasce com o e-mail **não confirmado** (`auth_criar_usuario`)
e só o link de um e-mail nosso confirma (confirmação no cadastro ou "Esqueci
minha senha"). Pôr na equipe quem já tem conta vira **convite**
(`db/sql/73-convites.sql`): a pessoa aceita no topo da tela, e só aceita com o
e-mail confirmado. Login criado pelo gestor com e-mail novo continua entrando
direto, mas é só daquela empresa. Contas que já existiam antes desta mudança
ficaram como confirmadas.

### 13. Trocar a senha não pedia a atual

Qualquer sessão aberta (celular esquecido, "Entrar como") trocava a senha e
derrubava o dono. Agora Configurações pede a senha atual (5 erros em 15 min
bloqueiam), e `/nova-senha`, que não pede, só abre com o cookie curto
`recuperacao` amarrado à sessão que o link do e-mail abriu. No "Entrar como"
o superadmin não troca senha (da pessoa nem da equipe) nem exclui a conta
(`ENTRAR_COMO_SEM_SENHA` em `lib/permissoes.ts`).

### 14. "Entrar como" sem rastro do que foi feito

O registro guardava só que o superadmin entrou. Agora o motivo é obrigatório
e, enquanto ele está na conta, o JWT que o app manda ao banco leva a claim
`entrada_como`; um gatilho em toda tabela das empresas anota cada inclusão,
alteração e exclusão (`db/sql/79-entrar-como-auditoria.sql`). O console mostra
o histórico no detalhe do usuário, e o gestor vê em Equipe → "Acessos do
suporte" quando, na conta de quem, por quê e quantas alterações. Trocar a
`SUPERADMIN_SENHA` derruba também os "Entrar como" abertos por ele.

### 15. Valores de exemplo e backup sem criptografia

O `infra/portainer.yml` traz `TROQUE-...` nos segredos, e esse texto é
público. O `deploy.sh` recusa, o app não sobe com `JWT_SECRET`,
`SESSAO_SECRET` ou `ARQUIVOS_SECRET` de exemplo, o migrador não aceita a
`SUPERADMIN_SENHA` de exemplo e o WhatsApp não aceita a chave de exemplo. A
senha de criptografia do backup no B2 virou obrigatória no console; pelas
variáveis da stack ela continua opcional, mas o log avisa a cada mudança.

### 10. Entrada do navegador ia crua para o banco

Ids, tipos (enums) e números chegavam ao Postgres sem conferência: um id
malformado ou um tipo inesperado voltava como erro do banco em inglês na tela,
valores negativos (custo, horímetro, garantia) entravam e distorciam os totais,
e `alterarPapel` com papel inválido rebaixava a pessoa para técnico em
silêncio. Agora as server actions validam com `exigirId`, `opcao` e
`naoNegativo` (`lib/form.ts`) antes de gravar, o papel inválido é recusado, o
gestor não pode remover a si mesmo (a limpeza do login apagaria a própria
conta no meio da sessão), e `db/sql/50-validacoes.sql` repete as regras de
valor como `check` no banco.

### 11. Sessão vencida aparecia como "NEXT_REDIRECT"

As actions chamam `getContexto()` dentro do `try`; com a sessão vencida, o
redirect para o login era engolido pelo `catch` e a tela mostrava
"NEXT_REDIRECT". `mensagemErro()` agora relança os erros internos do Next.

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

- Senhas em **bcrypt** (custo 12; as antigas, de custo 10, seguem valendo).
  Senha errada e e-mail inexistente levam o mesmo tempo para responder (não
  dá para descobrir quem tem conta).
- **Senha mínima de 8 caracteres**, recusando as mais tentadas ("Senha123",
  "12345678", nome de time…) e a que contém o próprio e-mail
  (`lib/auth/regras-senha.ts`). Sem exigir símbolo: isso só gera "Senha@123".
- **Limite de tentativas** em 15 minutos: 8 falhas por e-mail **no mesmo IP**,
  30 por IP e 50 por e-mail de qualquer lugar. Errar a senha dos outros só
  tranca o IP de quem errou, não a conta da vítima. O IP vem do Traefik, que
  descarta o `X-Forwarded-For` enviado pelo cliente.
- Links dos e-mails usam só `SITE_URL` (nunca o cabeçalho Host, que quem pede
  escolhe). Confirmação vale 3 dias; recuperação, 30 minutos.
- **Sessões no banco** (`auth.sessoes`): sair, trocar a senha, receber senha
  nova do gestor ou ser excluído derruba a sessão na hora. Duram 30 dias e se
  renovam com o uso.
- Cookie `httpOnly`, `Secure` (com HTTPS) e `SameSite=Lax`, assinado com
  `SESSAO_SECRET` — diferente do `JWT_SECRET` do banco. Com HTTPS o nome leva
  o prefixo `__Host-` (subdomínio não planta cookie por cima); quem chega com
  o nome antigo é migrado pelo proxy sem perder a sessão.
- `/auth/sair` e `/auth/voltar` ignoram pedido vindo de outro site
  (`Sec-Fetch-Site: cross-site`): um link ou `<img>` alheio não derruba a sessão.
- O Traefik limita o envio (POST) de login, cadastro, recuperação e `/auth/*`
  a ~2 por segundo por IP (rajada de 60), antes de o app gastar CPU com
  bcrypt. Abrir a tela não conta, para não travar um escritório inteiro atrás
  do mesmo IP.
- `/api/saude?banco=1` não devolve a mensagem de erro do banco (vai para o log).
- Link de recuperação de senha: uso único, 30 minutos, só o hash fica no banco.
- As funções `auth_*` só podem ser executadas pelo `service_role`.

## Arquivos

Fotos e anexos ficam no volume `manutencao_arquivos`. Nada é público:

- **Leitura** só com link assinado (HMAC, `ARQUIVOS_SECRET`) de 30 minutos, gerado
  para caminhos que vieram do banco já filtrados pelo RLS.
- **Envio** só com autorização de 15 minutos para **um** caminho, que começa
  obrigatoriamente pela pasta da empresa; leitor não envia.
- Só imagem (JPG, PNG, WEBP, HEIC) e PDF, até 25 MB, sem sobrescrever.
- Cota por empresa (`ARQUIVOS_COTA_MB`, padrão 5 GB): uma empresa não enche o
  disco de todas. Arquivo sem registro no banco vai de madrugada para
  `.orfaos/` (fora do que a rota serve) e sai de vez em 30 dias; se "quase
  tudo" parecer órfão, a limpeza não mexe em nada e avisa.
- Caminhos com `..`, barras extras ou fora do formato são recusados.
- A resposta vem com `Content-Security-Policy: sandbox` e `nosniff`: mesmo um
  arquivo malicioso não executa nada no navegador.

## O que continua sendo responsabilidade sua

- **Backups fora da VM**: preencha o Backblaze B2 no console do superadmin
  (Gerência → Integrações) ou nas variáveis `B2_*` (INSTALACAO.md → Backups).
  As credenciais ficam em `sistema_credenciais`, com RLS ligado e sem policy
  (só a chave de servidor lê); a applicationKey e a senha de criptografia
  nunca voltam para o navegador, e o app só grava depois de conferir o posto
  de superadmin na sessão. Elas vão junto no dump do banco: use a senha de
  criptografia do backup para o B2 não guardar a própria chave em claro.
- **Senha forte para o superadmin** (`SUPERADMIN_SENHA`): ele enxerga e altera
  todas as empresas. As funções `admin_*` do banco só rodam com a chave de
  servidor, e o app confere o posto na sessão (no banco) em cada tela e ação
  do console. O superadmin não entra no sistema das empresas: ele só gerencia
  pelo console (`/admin`) e não pode fazer parte de nenhuma equipe.
- **"Entrar como"** (console → detalhe do usuário): o superadmin abre a conta
  de alguém sem senha. O banco (`auth_entrar_como`, só `service_role`) confere
  o posto de novo, recusa usuário bloqueado, sem empresa ou superadmin, e cria
  uma sessão marcada com quem a abriu (`auth.sessoes.aberta_por`), que vale
  até ele voltar ao console ou sair (teto de 30 dias, como um login comum; o
  dono tirou o limite de 1 hora): ela não se renova e cai na hora se o
  superadmin perder o posto ou for bloqueado. O cookie do superadmin fica guardado à parte (`sessao_admin`,
  httpOnly) e só volta a valer se o banco ainda o reconhecer como superadmin.
  Toda entrada vai para `sistema_entradas_como` (sem policy: só o servidor lê).
  Para consultar: `select * from sistema_entradas_como order by inicio desc;`.
- **Atualizar o sistema operacional** da VM e manter o SSH só com chave.
- **Ativar SMTP** para a recuperação de senha e a confirmação de e-mail (sem ela,
  quem criou a própria conta não consegue aceitar convite de outra empresa;
  o superadmin inclui a pessoa pelo console).
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
`authenticated` leem nada. O serviço de WhatsApp acessa com o papel
`whatsapp_servico`, que só tem permissão em `whatsapp_sessoes` e
`whatsapp_conexoes`. Ele não guarda o `JWT_SECRET`: pede ao app (rede interna,
com a `WHATSAPP_API_KEY`) um token de 5 minutos desse papel
(`app/api/whatsapp/token`, que responde 404 pelo Traefik). Antes ele assinava
tokens de `service_role` — invadir o contêiner do Baileys dava o banco inteiro.
As dependências dele vão travadas no `whatsapp/package-lock.json` (`npm ci`).
Quem tiver essas linhas consegue mandar mensagem como a empresa — trate os
backups com o mesmo cuidado.

## Atualizador (botão Atualizar do console)

O serviço `atualizador` monta `/var/run/docker.sock` — quem controla o Docker
controla o servidor. Por isso:

- O app **não** tem acesso ao Docker. O botão só grava um pedido em
  `sistema_atualizacoes` (RLS ligado, nenhuma policy, só `service_role`), depois
  de conferir na sessão do banco que quem pediu é o superadmin e que a versão
  é a última publicada.
- O atualizador não abre porta e fica só na rede interna; ele lê o pedido no
  banco. A versão é conferida duas vezes no padrão `vAAAA.MM.DD-N` (constraint
  da tabela e o script), então nada de texto livre vira argumento do Docker.
- Ele só troca a imagem de serviços da **própria stack** cujas imagens vêm da
  mesma base que a dele (ex.: `ghcr.io/dhqdev/manutencao-ativos/*`). Banco,
  PostgREST e Traefik não mudam.
- Uma atualização por vez (índice único); pedido interrompido vira erro quando
  o atualizador reinicia.

## Assistente de IA (Groq) e credenciais do console

- A chave do Groq fica em `sistema_credenciais` (RLS ligado, nenhuma policy,
  só `service_role`). Só as ações do console gravam, depois de conferir na
  sessão do banco que quem pediu é o superadmin. A tela recebe apenas se a
  chave existe e os 4 últimos caracteres.
- O modelo não monta SQL. Ele escolhe entre ferramentas fixas
  (`lib/assistente-ferramentas.ts`): tabela e colunas de uma lista fechada,
  operadores de uma lista fechada, valores passados como parâmetro. Colunas
  sensíveis (caminho de anexo, ids de usuário) não estão na lista.
- As consultas rodam com o JWT de quem perguntou (`createClient`, RLS) e com
  `org_id` da empresa aberta: o assistente vê o mesmo que a pessoa vê nas
  telas. Não existe ferramenta de escrita.
- O que vai para o Groq: a pergunta, a conversa da aba e as linhas que o
  modelo consultou. Dados da empresa saem do servidor para a API do Groq;
  sem chave cadastrada, nada sai.
- Freio de 15 perguntas por minuto por pessoa (protege a cota do Groq) e
  resultado de cada consulta cortado em ~12 mil caracteres.
