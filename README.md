# Gestão de Manutenção de Ativos

Sistema web para controlar ativos, manutenções realizadas, custos, históricos e
manutenções preventivas — com calendário, alertas de vencimento e relatórios em
PDF prontos para enviar no WhatsApp.

Feito com **Next.js 16 + React 19 + TypeScript + Tailwind CSS 4**, rodando
inteiro em servidor próprio: **PostgreSQL 17 + PostgREST + Traefik + Docker
Swarm**, com autenticação, arquivos, backup e WhatsApp (Baileys) próprios —
sem depender de Supabase, Vercel ou outro serviço externo.

---

## 1. Arquitetura

```
internet ─► Traefik (HTTPS, Let's Encrypt)
              └─► app (Next.js) ──► rest (PostgREST) ──► db (PostgreSQL 17)
                    │   ▲                  ▲
                    │   └ arquivos (volume) │
                    └──► whatsapp (Baileys) ┘

migrador · cron (resumo do WhatsApp) · backup diário · atualizador
```

| Peça | O que faz |
|---|---|
| **app** | Telas, server actions, login/sessões, fotos e anexos (`/api/arquivos`) |
| **rest** | PostgREST: API do banco, **só na rede interna**. O app chama com um JWT curto do usuário; o RLS do Postgres filtra cada linha pela empresa |
| **db** | PostgreSQL 17 com RLS em todas as tabelas e autenticação própria (schema `auth`) |
| **whatsapp** | Servidor Baileys sempre ligado (QR, "digitando", reconexão) |
| **migrador** | Aplica `db/sql/*.sql` a cada deploy (idempotente) e cria/atualiza o superadmin |
| **cron** | Chama a rotina do resumo diário do WhatsApp de hora em hora |
| **backup** | `pg_dump` + arquivos a cada 15 dias, com retenção, e cópia no Backblaze B2 (credenciais no console do superadmin, aba Integrações) |
| **atualizador** | Aplica a release nova quando o superadmin clica em **Atualizar** no console (tem o socket do Docker; não abre porta) |
| **traefik** | Porta de entrada, HTTPS automático, painel protegido por senha |

Instalação no servidor (Oracle Cloud ARM64): **[INSTALACAO.md](INSTALACAO.md)**.
Build, testes e releases: GitHub Actions na `main` (`.github/workflows/principal.yml`) —
cada push verde gera uma release `vAAAA.MM.DD-N` com as imagens e o pacote de instalação.

### O banco

Todo o SQL fica em [`db/sql/`](db/sql/) e é aplicado pelo migrador:

| Arquivo | O quê |
|---|---|
| `00-fundacao.sql` | Papéis (`anon`, `authenticated`, `service_role`, `authenticator`), schema `auth` (usuários, sessões, tokens, tentativas) e `auth.uid()` |
| `10-schema.sql` | Tabelas, RLS, views, funções e triggers do sistema |
| `20-auth.sql` | Funções de login, sessão, senha e recuperação (só o servidor chama) |
| `30-superadmin.sql` | Login do superadmin (vindo da stack) e funções `admin_*` do painel de administração |
| `70-integracoes.sql` | `sistema_credenciais`: chaves de serviços externos (Groq...) salvas pelo console |
| `71-backup.sql` | Rodadas do backup (histórico e "backup agora") e sinal de vida do serviço backup |
| `72-entrar-como.sql` | "Entrar como" do superadmin: sessão curta na conta da pessoa e registro de cada entrada |

Cadastro automático: ao criar conta, o usuário ganha empresa, perfil e as 6
categorias padrão.

---

## 2. Rodar na sua máquina

```bash
docker compose -f infra/dev.yml up -d --build   # banco + PostgREST + migrações
cp .env.example .env.local
npm install
npm run dev
```

Acesse **`http://localhost:3001`** e clique em **Criar conta grátis**.

O WhatsApp é opcional em desenvolvimento (`cd whatsapp && npm install && npm start`,
com as variáveis de `whatsapp/src/config.js`).

---

## 3. O que tem em cada tela

| Menu | O que faz |
|---|---|
| **Dashboard** | Ativos cadastrados, manutenções vencendo, atrasadas, gasto do mês, gasto dos últimos 6 meses, gasto por categoria e últimas manutenções |
| **Ativos** | Categorias funcionam como pastas. Entrando na pasta, a lista de ativos com busca e filtro de situação |
| Ativo (detalhe) | Abas de **Histórico** (com fotos/anexos, peças, custo, garantia), **Manutenções periódicas** e **Dados do ativo** |
| **Manutenções** | Todas as preventivas com alertas de atraso/vencimento + histórico geral em tabela, com busca, filtros (tipo, categoria, ativo, período) e ordem que ficam no link, paginação e **Exportar CSV** (abre no Excel) |
| **Calendário** | Mês a mês, com realizadas (verde), programadas (azul) e atrasadas (vermelho). Filtra por categoria e por situação |
| **Estoque** | Pneus com número de fogo, medida, DOT, sulco, valor e situação (estoque, em uso, recapagem, descarte). Movimentações com veículo, posição e KM, e histórico de cada pneu |
| **Relatórios** | Filtra por período, uma ou mais categorias, ativo e tipo. Histórico com horímetro/KM e seção de pneus (gastos, movimentações, sulco baixo). Gera PDF e compartilha no WhatsApp |
| **Equipe** | Quem tem acesso, com que papel, último acesso e quem está conectado. Busca, filtro por papel, criar acesso, trocar papel, editar dados, gerar senha nova, desconectar e remover |
| **Configurações** | Dados da empresa, perfil, senha, aparência (tema, densidade das tabelas e decoração de Natal), **WhatsApp** (com horário do envio), empresa ativa |

### Busca e atalhos de teclado

**Ctrl+K** (⌘K no Mac) ou o botão **Buscar** do menu abre a busca global:
ativos, manutenções, periódicas, pneus e telas da empresa aberta, e a ação
"Registrar manutenção". Na busca, **?** mostra todos os atalhos: **/** vai para
a busca da tela, **N** abre o cadastro novo da tela (manutenção, ativo, pneu),
**Ctrl+B** recolhe o menu e **Esc** fecha janelas.

### Natal

De 15 de novembro até o Dia de Reis (6 de janeiro) o sistema ganha luzinhas no
menu, neve leve, gorro no logo, uma faixa de boas festas no Dashboard e um
trenó que atravessa o alto da tela de vez em quando. Depois some sozinho. Cada
aparelho pode desligar em **Configurações → Aparência**, e quem pediu menos
animação no sistema operacional não vê neve nem trenó.

### Aplicativo no celular (PWA)

Dá para instalar na tela inicial e usar como app.

- **Android/Chrome**: abrir o site → menu ⋮ → *Instalar aplicativo*
- **iPhone/Safari**: abrir o site → Compartilhar → *Adicionar à Tela de Início*

No celular a interface muda:

- **barra inferior fixa** com Dashboard, Ativos, Manutenções e Calendário;
- botão **Mais** abre um menu suspenso com quadrados (Relatórios, Configurações,
  atalhos e Sair);
- os **modais sobem da borda inferior**, com alça de arrasto, em vez de aparecer
  no meio da tela;
- nas listas, ao rolar, aparece uma barrinha fixa com **Filtros** e o botão
  de novo cadastro da tela;
- respeita as áreas seguras (notch e barra de gestos).

Sem internet, aparece uma tela avisando — nunca dados de manutenção
desatualizados, que seria pior do que não mostrar nada.

> Só funciona instalado em **HTTPS** (o Traefik já entrega assim). Em
> `localhost` o service worker fica desligado propositalmente, para não servir
> arquivo velho durante o desenvolvimento.

### Notificações no WhatsApp

O gestor conecta o WhatsApp da empresa lendo um QR code (ou digitando um
código, sem câmera) dentro do sistema, cadastra quem recebe, e todo dia no
horário escolhido sai o resumo das manutenções atrasadas e a vencer — com
"digitando..." antes, como uma pessoa.

O WhatsApp roda num serviço próprio com [Baileys](https://github.com/WhiskeySockets/Baileys)
(pasta `whatsapp/`), sempre conectado.
Instalação e detalhes em [WHATSAPP.md](WHATSAPP.md).

### Manutenções periódicas

Podem ser por **dias**, **meses** ou **horas de uso** (horímetro/km):

- por data → alerta X dias antes do vencimento;
- por horas → alerta quando faltarem X horas para o horímetro alvo.

Ao registrar uma manutenção vinculada a um plano, o sistema **avança sozinho** a
próxima data (ou o próximo horímetro) e atualiza o horímetro do ativo.

### Assistente de IA

A tela **Assistente** (grupo Análise do menu) é um chat em que qualquer pessoa
da equipe pergunta em português sobre a empresa: "quais manutenções estão
atrasadas?", "quanto gastei por ativo este mês?", "pneus com sulco abaixo de
3 mm". A IA é do **Groq**, ligada pelo superadmin na aba **Integrações** do
console (sem chave, a tela avisa que ainda não está disponível).

O modelo não fala com o banco: ele pede uma consulta (tabela, colunas,
filtros) e o servidor executa **com o login de quem perguntou**, sempre na
empresa aberta. Ele enxerga ativos, categorias, planos, manutenções, anexos
(só o nome), pneus e movimentações, e **não grava nada**. A conversa fica só
na aba do navegador (sair para outra tela e voltar não a perde; fechar a aba,
sim), separada por empresa.

O modelo padrão é o `openai/gpt-oss-120b`. O console oferece uma lista de
modelos que aceitam ferramentas (e os que a chave enxerga, depois do teste).
Se o Groq desligar o modelo salvo (como fez com o `llama-3.3-70b-versatile`
em 16/08/2026), o assistente passa sozinho para o padrão e o console avisa.

### Relatórios e WhatsApp

- **Baixar PDF** — salva o arquivo.
- **WhatsApp** — no celular abre o menu de compartilhamento com o PDF anexado;
  no computador baixa o PDF e abre o WhatsApp Web com o resumo em texto
  (o WhatsApp não aceita anexo por link, então o arquivo vai junto manualmente).

---

## 4. Equipe e acessos

Em **Equipe** (no menu), o proprietário ou gestor clica em **Nova pessoa** e
cria o login (nome, e-mail, senha opcional e papel). No final o sistema mostra
e-mail e senha para copiar ou mandar no WhatsApp. A pessoa já entra na empresa
certa. Se o e-mail já tinha conta, ela só é adicionada à equipe.

Na mesma tela aparecem o último acesso de cada pessoa, quem está conectado
agora e quem ainda não entrou. Dá para buscar, filtrar por papel, trocar o
papel, corrigir nome/cargo/telefone, gerar uma senha nova, desconectar de todos
os aparelhos e remover o acesso. Senha, dados e desconexão só valem para quem
participa **apenas** desta empresa (assim o gestor de uma empresa não mexe na
conta do dono de outra).

| Papel | Pode |
|---|---|
| **Proprietário / Gestor** | Tudo, inclusive equipe, WhatsApp e dados da empresa |
| **Técnico** | Registrar manutenções e anexos, movimentar pneus |
| **Leitor** | Somente consultar |

As regras valem no banco (RLS), não só na tela. Quem participa de mais de uma
empresa escolhe qual está ativa em **Configurações → Empresa ativa**.

### Superadmin (administração do sistema inteiro)

O superadmin é um login definido **na stack**, no serviço `migrador`:

```yaml
- SUPERADMIN_EMAIL=voce@suaempresa.com.br
- SUPERADMIN_SENHA=uma-senha-forte-com-8-ou-mais-caracteres
```

A cada deploy o migrador cria esse login (se ainda não existir), garante que
ele é o superadmin e acerta a senha para a da stack. Trocar a senha na stack e
dar *Update* derruba as sessões abertas dele. Trocar o e-mail passa o posto
para o e-mail novo; deixar as duas vazias tira o posto de todo mundo.

O superadmin **só gerencia**: ao entrar ele cai direto no **console do
superadmin** (`/admin`), com menu próprio, e não tem acesso ao sistema das
empresas (dashboard, ativos, manutenções…). Qualquer tela do sistema o devolve
ao console, e ele não pode fazer parte da equipe de nenhuma empresa.

A exceção é o botão **Entrar como**, no detalhe de um usuário: abre o sistema
na conta da pessoa, sem a senha dela, para ver o que ela vê. A sessão vale
até você voltar ao console ou sair (sem limite de 1 hora), não conta como
acesso da pessoa e cai se o superadmin perder o posto. Uma faixa no topo mostra de quem é a conta e o botão **Voltar
ao console** (sair pelo menu também volta). Cada entrada fica registrada em
`sistema_entradas_como` (quem, na conta de quem, quando, IP e quando saiu).
Não vale para usuário bloqueado, sem empresa ou outro superadmin.

O console tem **uma tela só, a gerência dos usuários** (todos, de todas as
empresas):

- **Cartões no topo** que também filtram: usuários no sistema, entraram em 7
  dias, nunca entraram, sem empresa e bloqueados.
- **Lista** com busca (nome, e-mail, telefone, empresa), filtro por empresa,
  ordenação (último acesso, nome, mais novos), situação de cada um e
  **exportar CSV** (abre no Excel) da lista filtrada.
- **Novo usuário** numa empresa nova ou numa existente, com qualquer papel; no
  fim aparecem e-mail e senha para copiar ou mandar no WhatsApp.
- **Detalhe do usuário** (clique na linha): editar nome e e-mail, definir/gerar
  senha, encerrar sessões, **bloquear/desbloquear**, ver criação, último
  acesso e sessões, **empresas** (pôr em outra empresa, trocar o papel, tirar)
  e excluir.

Na aba **Clientes e uso**, cada empresa aparece com o **espaço que ocupa**
(fotos e anexos no disco + estimativa das linhas no banco, com barra
comparando os clientes), quantos ativos e manutenções tem e se o **WhatsApp
está conectado** (com o número). No topo, os totais: clientes, espaço usado,
quanto é arquivo e quanto é banco, e quantos estão com WhatsApp.

Na aba **Integrações** ficam as chaves de serviços externos, guardadas no
banco (`sistema_credenciais`) e nunca devolvidas à tela (só o final aparece):
o **Groq** do assistente de IA (chave, lista de modelos e **Testar conexão**,
que também roda sozinho depois de salvar) e o
backup.

Na aba **Integrações** ficam as credenciais dos serviços de fora. O cartão
**Backup no Backblaze B2** recebe keyID, applicationKey, bucket, pasta, de
quantos em quantos dias roda o automático (padrão 15) e como o B2 guarda
(espelho do app, o padrão, ou com histórico pelos dias de retenção); **Testar conexão** confere a
chave na API do Backblaze, e **Salvar** só grava se o teste passar. Os segredos
não voltam para a tela (só os 4 últimos caracteres). O cartão mostra se o
serviço backup está no ar, para onde ele está mandando, as pastas no bucket, o
botão **Fazer backup agora** e as últimas 10 rodadas (automáticas e manuais).

Na aba **Assinaturas** fica a cobrança mensal por **Pix** (sem gateway: o
sistema monta o Pix copia e cola e o QR code no padrão BR Code do Banco
Central, `lib/pix.ts`):

- **Pix da assinatura**: chave Pix (e-mail, CPF, CNPJ, telefone ou aleatória),
  nome e cidade de quem recebe, **valor mensal**, **tolerância** (dias depois
  do vencimento antes de bloquear, padrão 3), **dias grátis** para empresa
  nova (padrão 7) e **seu WhatsApp**, que recebe os comprovantes. Mostra o QR
  como o cliente vai ver. Sem chave ou sem valor a cobrança fica desligada e
  ninguém é bloqueado (botão **Desligar cobrança**).
- **WhatsApp dos avisos**: conecte um WhatsApp seu (QR ou código). Quando um
  cliente anexa o comprovante, a imagem/PDF chega no número cadastrado, com a
  empresa, o valor e o link para aprovar. **Enviar teste** confere.
- **Comprovantes para aprovar**: ver o arquivo, **Aprovar (+1 mês)** ou
  **Recusar** com motivo (a empresa vê). Aprovar empurra o vencimento 1 mês a
  partir do vencimento atual (o dia do mês não muda).
- **Vencimento de cada empresa**: situação (em dia, vence em breve, vencida,
  bloqueada), a **data de vencimento** editável e a opção **Isenta**.
- **Histórico de pagamentos**: aprovados (vencimento antes → depois) e recusados.

Do lado da empresa, o menu **Assinatura** mostra a situação, o QR, o copia e
cola e o envio do comprovante (proprietário ou gestor), com o histórico. Uma
faixa no topo avisa quando faltam 5 dias ou menos e quando já venceu. Passou
do vencimento + tolerância, a empresa fica **bloqueada**: qualquer tela leva
para Assinatura, que continua deixando pagar e anexar. O superadmin no
"Entrar como" não é barrado. Empresas que já existiam ganharam 30 dias a
partir da instalação desta versão.

Abaixo fica o bloco **Versão do sistema** (a que está no ar e a
última publicada no GitHub Packages, com o botão **Atualizar**).

#### Atualizar pelo console

Cada push verde na `main` publica as imagens com a tag `vAAAA.MM.DD-N` no
ghcr.io. O bloco **Versão do sistema**, no console, compara a versão no ar (gravada na imagem do app)
com a maior tag publicada e, quando há uma nova, mostra **Atualizar para
vX**. O clique só grava o pedido no banco (`sistema_atualizacoes`); o serviço
`atualizador` da stack pega o pedido e:

1. baixa as imagens `app`, `whatsapp` e `ops` da versão (se faltar uma, para
   sem mexer em nada);
2. roda o migrador da versão nova e espera terminar;
3. troca a imagem dos outros serviços, um de cada vez (o app volta sozinho
   para a versão anterior se a nova não subir);
4. por último troca a própria imagem;
5. apaga as sobras: contêineres parados desta stack (os substituídos e o
   migrador que já terminou) e as imagens `app`/`whatsapp`/`ops` antigas que
   nenhum contêiner usa. Contêiner que quebrou com erro fica 24 h para os logs
   mostrarem o motivo. Volumes e outras stacks não são tocados. A mesma
   limpeza roda quando o atualizador sobe (também depois de atualizar a stack
   pelo Portainer) e de hora em hora;
6. faz a faxina do servidor: toda imagem sem contêiner, cache de build,
   volumes anônimos sem uso e volumes com nome **sem uso e vazios** (volume
   com dado nunca sai). A mensagem final diz quanto foi liberado.

O repositório pode ser privado: basta os pacotes `app`, `whatsapp` e `ops` do
ghcr.io continuarem públicos (veja INSTALACAO.md, "Repositório privado").

O andamento aparece na tela. Só as imagens mudam: variável nova ou serviço
novo na stack ainda pedem um deploy pela stack (`deploy.sh` ou Portainer).
Sem o serviço `atualizador` na stack, a tela avisa e o botão fica desligado.

A cada deploy o migrador tira o superadmin das empresas: a empresa vazia que o
cadastro monta para ele é apagada; nas empresas com mais gente ele só sai (se
era o proprietário, a próxima pessoa assume). Empresa com dados em que ele é a
única pessoa fica como está.

Quem não é superadmin não vê o console e recebe 404 em `/admin`. Cada tela e
cada ação conferem no banco, pela sessão, se quem pediu é o superadmin; as
funções `admin_*` só são executáveis pela chave de servidor. Usuário bloqueado
não entra e perde as sessões na hora.

### Limpar histórico

Em **Manutenções**, o gestor pode apagar o histórico de um período (tudo ou só
um tipo, como as preventivas, e opcionalmente de um ativo). O sistema mostra
quantos registros vão sair e pede para digitar APAGAR.

---

## 5. Estrutura do projeto

```
app/
  (app)/            telas internas (dashboard, ativos, manutenções, calendário, relatórios, configurações)
  admin/            console do superadmin (uma tela: usuários, clientes e uso, integrações e versão)
  api/arquivos/     envio e leitura de fotos/anexos (links assinados)
  api/notificacoes/ rotina diária do WhatsApp (chamada pelo serviço cron)
  auth/             login, cadastro, recuperação de senha e logout
components/         UI, modais, formulários e listas
lib/
  actions/          server actions de dados
  auth/             sessões, senhas (bcrypt), JWT, limite de tentativas
  db/               cliente do PostgREST (usuário e servidor)
  arquivos.ts       armazenamento em volume + links assinados
  session.ts        usuário + empresa atual
proxy.ts            protege as rotas e renova o cookie de sessão
db/                 SQL + imagem "ops" (migrador, cron, backup + Backblaze B2, importação do Supabase)
whatsapp/           serviço Baileys
infra/              stacks do Swarm (stack.yml com .env, portainer.yml para colar no Portainer), Traefik, deploy
testes/             verificação da stack e teste ponta a ponta (Playwright)
.claude/skills/      padrão do projeto para o Claude seguir (padrao-manutencao)
```

## 6. Comandos

```bash
npm run dev        # desenvolvimento
npm run build      # build de produção
npm run typecheck  # checagem de tipos
cd whatsapp && npm test   # testes do serviço de WhatsApp
```
