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

migrador · cron (resumo do WhatsApp) · backup diário
```

| Peça | O que faz |
|---|---|
| **app** | Telas, server actions, login/sessões, fotos e anexos (`/api/arquivos`) |
| **rest** | PostgREST: API do banco, **só na rede interna**. O app chama com um JWT curto do usuário; o RLS do Postgres filtra cada linha pela empresa |
| **db** | PostgreSQL 17 com RLS em todas as tabelas e autenticação própria (schema `auth`) |
| **whatsapp** | Servidor Baileys sempre ligado (QR, "digitando", reconexão) |
| **migrador** | Aplica `db/sql/*.sql` a cada deploy (idempotente) |
| **cron** | Chama a rotina do resumo diário do WhatsApp de hora em hora |
| **backup** | `pg_dump` + arquivos todo dia, com retenção |
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
| **Manutenções** | Todas as preventivas com alertas de atraso/vencimento + histórico geral |
| **Calendário** | Mês a mês, com realizadas (verde), programadas (azul) e atrasadas (vermelho). Filtra por categoria e por situação |
| **Estoque** | Pneus com número de fogo, medida, DOT, sulco, valor e situação (estoque, em uso, recapagem, descarte). Movimentações com veículo, posição e KM, e histórico de cada pneu |
| **Relatórios** | Filtra por período, uma ou mais categorias, ativo e tipo. Histórico com horímetro/KM e seção de pneus (gastos, movimentações, sulco baixo). Gera PDF e compartilha no WhatsApp |
| **Configurações** | Dados da empresa, perfil, senha, **WhatsApp** (com horário do envio), equipe e acessos, empresa ativa |

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

### Relatórios e WhatsApp

- **Baixar PDF** — salva o arquivo.
- **WhatsApp** — no celular abre o menu de compartilhamento com o PDF anexado;
  no computador baixa o PDF e abre o WhatsApp Web com o resumo em texto
  (o WhatsApp não aceita anexo por link, então o arquivo vai junto manualmente).

---

## 4. Equipe e acessos

Em **Configurações → Equipe e acessos**, o proprietário ou gestor cria o login
da pessoa (nome, e-mail, senha opcional e papel). No final o sistema mostra
e-mail e senha para copiar ou mandar no WhatsApp. A pessoa já entra na empresa
certa. Se o e-mail já tinha conta, ela só é adicionada à equipe.

Na mesma tela dá para trocar o papel, gerar uma senha nova e remover o acesso.

| Papel | Pode |
|---|---|
| **Proprietário / Gestor** | Tudo, inclusive equipe, WhatsApp e dados da empresa |
| **Técnico** | Registrar manutenções e anexos, movimentar pneus |
| **Leitor** | Somente consultar |

As regras valem no banco (RLS), não só na tela. Quem participa de mais de uma
empresa escolhe qual está ativa em **Configurações → Empresa ativa**.

### Limpar histórico

Em **Manutenções**, o gestor pode apagar o histórico de um período (tudo ou só
um tipo, como as preventivas, e opcionalmente de um ativo). O sistema mostra
quantos registros vão sair e pede para digitar APAGAR.

---

## 5. Estrutura do projeto

```
app/
  (app)/            telas internas (dashboard, ativos, manutenções, calendário, relatórios, configurações)
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
db/                 SQL + imagem "ops" (migrador, cron, backup, importação do Supabase)
whatsapp/           serviço Baileys
infra/              stacks do Swarm, Traefik, deploy e preparação do servidor
testes/             verificação da stack e teste ponta a ponta (Playwright)
```

## 6. Comandos

```bash
npm run dev        # desenvolvimento
npm run build      # build de produção
npm run typecheck  # checagem de tipos
cd whatsapp && npm test   # testes do serviço de WhatsApp
```
