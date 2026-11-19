---
name: padrao-manutencao
description: Padrão do sistema de Gestão de Manutenção de Ativos (Next.js 16 + PostgREST + Postgres + Swarm). Use antes de criar ou mudar telas, server actions, SQL/migrações, permissões, stack/infra, backup ou testes neste repositório.
---

# Padrão do projeto — Gestão de Manutenção de Ativos

Leia isto antes de mexer no código. O objetivo é que toda mudança tenha a mesma
cara do que já existe: mesmo idioma, mesmas camadas, mesma segurança.

## 0. Antes de tudo

- **Next.js 16 não é o que você conhece.** Leia o guia em
  `node_modules/next/dist/docs/` antes de usar uma API do Next (veja `AGENTS.md`).
  Ex.: o middleware se chama `proxy.ts` e roda no runtime Node.
- Tudo em **português do Brasil**: nomes de variáveis, funções, arquivos,
  comentários, mensagens de erro, textos de tela, commits e docs
  (`criarUsuario`, `textoObrigatorio`, `Resultado`, `erroBanco`). Termos técnicos
  que não têm tradução natural ficam em inglês (`cache`, `token`, `bucket`).
- Comentários explicam **o porquê** (a regra, o risco evitado), não o óbvio.
- Fluxo de entrega combinado com o dono: commit e push **direto na `main`**.
  Cada push verde no GitHub Actions gera a release `vAAAA.MM.DD-N` (N = número
  do run) com as imagens `app`, `whatsapp` e `ops` no ghcr.io.

## 1. Arquitetura (não quebre estas regras)

```
navegador ─► app (Next) ─► PostgREST (rede interna) ─► PostgreSQL (RLS)
                 └─► whatsapp (Baileys) ─► PostgREST
migrador (aplica db/sql) · cron (rotina do WhatsApp) · backup (local + Backblaze B2)
```

- O PostgREST **nunca** é exposto na internet. Só app e whatsapp falam com ele.
- Dados de tela: `createClient()` (`lib/db/server.ts`) — JWT do usuário, o
  **RLS filtra por empresa**. É o padrão para tudo.
- `createAdminClient()` (`lib/db/admin.ts`) ignora o RLS. Só para: autenticação,
  rotina do cron, ou **depois** de conferir a permissão de quem pediu (equipe,
  painel do superadmin). Nunca para buscar dados de tela comuns.
- Multiempresa: toda tabela de dados tem `org_id`. A empresa é sempre a aberta
  na tela (`getContexto().orgId`), nunca "adivinhada".

## 2. Server actions (`lib/actions/*.ts`)

Molde de toda ação:

```ts
"use server";
export async function salvarAlgo(fd: FormData): Promise<Resultado> {
  try {
    const { orgId, papel } = await getContexto();          // sessão validada no banco
    if (!podeGerenciar(papel)) return { ok: false, erro: SEM_PERMISSAO }; // só esconde/agiliza; quem barra é o RLS
    const db = await createClient();
    const { error } = await db.from("tabela").insert({
      org_id: orgId,
      nome: textoObrigatorio(fd, "nome", "o nome"),        // helpers de lib/form.ts
      valor: numero(fd, "valor"),
    });
    if (error) return erroBanco(error);                     // mensagem amigável (RLS, duplicado)
    revalidatePath("/rota");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
```

- Retorno sempre `Resultado` (`{ ok: true } | { ok: false; erro }`) — nunca
  lançar erro para o cliente. `redirect()` fica **fora** do `try/catch`.
- Leia o FormData só com `texto`, `textoObrigatorio`, `numero`, `inteiro`,
  `data`, `booleano` (`lib/form.ts`): eles aceitam vírgula decimal, datas ISO etc.
- Permissões por papel ficam em `lib/permissoes.ts` e **espelham** o RLS.
  Papéis: proprietário / gestor (tudo) · técnico (registra manutenções, anexos,
  movimenta pneus) · leitor (só consulta).
- Superadmin (painel `/admin`): toda ação começa com `exigirSuperadmin()`
  (`lib/actions/admin.ts`), que confere `obterSessao().superadmin` — o posto vem
  do banco a cada requisição, nunca do cookie.
- Arquivos: o navegador sobe direto para `/api/arquivos` com token de envio
  (`criarUploadAssinado`); o caminho começa sempre por `{org_id}/`. Ao apagar
  linhas com anexos/fotos, chame `removerArquivos()` depois.

## 3. Banco (`db/sql/`)

- Os arquivos rodam em ordem a **cada deploy** pelo migrador: tudo tem que ser
  **idempotente** (`create table if not exists`, `add column if not exists`,
  `create or replace function`, `drop policy if exists` + `create policy`,
  enums com `exception when duplicate_object`).
  - `00-fundacao.sql` papéis, schema `auth`, `auth.uid()`
  - `10-schema.sql` tabelas, RLS, views, triggers do sistema
  - `20-auth.sql` funções `auth_*` (login, sessão, senha)
  - `30-superadmin.sql` superadmin vindo da stack e funções `admin_*`
  - Coisa nova grande: crie `40-<assunto>.sql` em vez de inchar os outros.
- Tabela nova: `org_id ... references organizacoes on delete cascade`, índice
  em `org_id`, `enable row level security` e policies separadas por comando
  (select para `user_org_ids()`, escrita para `user_admin_org_ids()` ou
  `user_org_ids_escrita()`). Nunca `for all` em `org_membros` (recursão).
  Se referencia outra tabela da empresa, inclua no trigger `garantir_mesma_empresa`.
- Funções: `security definer` + `set search_path = public` (ou `public, auth`).
  No Postgres toda função nasce executável por PUBLIC: **revogue** de
  `public, anon, authenticated` e libere só quem precisa. `auth_*` e `admin_*`
  só para `service_role`.
- Variáveis do migrador chegam como variáveis do psql (`-v nome=valor`) em
  `db/scripts/migrar.sh`; use `\if :{?nome}` e `:'nome'` (nunca concatene SQL).
- Senhas: bcrypt. O app gera com `bcryptjs` ($2b$), o banco com
  `crypt(..., gen_salt('bf', 10))` ($2a$); `auth.senha_confere` aceita os dois.
- **Teste o SQL num Postgres de verdade antes do push**, rodando os arquivos
  duas vezes seguidas (a segunda prova a idempotência).

## 4. Telas e componentes

- Páginas em `app/(app)/<rota>/page.tsx` (server component) + `loading.tsx`
  com os esqueletos de `components/esqueleto.tsx`.
- Use os componentes prontos: `Cabecalho`, `Secao`, `Campo`, `Botao`,
  `BotaoLink`, `Badge`, `EstadoVazio` (`components/ui.tsx`), `Modal` +
  `RodapeModal`, `BotaoExcluir` (confirmação), `Abas`, `FormularioSalvar`.
  Inputs com a classe `campo`, rótulos com `rotulo`, cartões com `card`.
- Ícones só do `lucide-react`. Cores: grafite (`slate-900`) é ação, `marca-*`
  é navegação/estado; badges de papel seguem `PAPEIS` de `components/configuracoes/equipe.tsx`.
- Tem que funcionar no celular (é PWA): barra inferior + menu "Mais"; modais
  viram folha de baixo para cima. Item novo de menu vai em `MENU` de
  `components/shell/navegacao.tsx`.
- Formulário cliente: `useTransition` + chamar a action + mostrar `erro` +
  `router.refresh()` no sucesso (veja `FormModal` em `components/admin/painel-admin.tsx`).
- Tela restrita: confira no servidor e chame `notFound()` (não só esconder o botão).

## 5. Infra, stack e variáveis

Variável nova de ambiente ⇒ atualize **todos** estes lugares no mesmo commit:

1. `infra/stack.yml` (com `${VAR:-padrão}`)
2. `infra/portainer.yml` (stack para colar no Portainer, com valores `TROQUE-...`)
3. `infra/.env.exemplo` (comentada)
4. `testes/gerar-env-teste.sh` se o CI precisar dela
5. `infra/deploy.sh` → `obrigatorias` se for obrigatória
6. `INSTALACAO.md` / `README.md`

- **Nunca** commite segredos reais (senhas, chaves, tokens). Repositório só com
  placeholders. A stack real do dono é entregue fora do Git.
- `POSTGRES_PASSWORD` não muda depois do primeiro deploy; trocar `SESSAO_SECRET`
  desloga todo mundo.
- Scripts da imagem `ops` (`db/scripts/*.sh`) são `sh` POSIX (Alpine/busybox):
  nada de bash-ismos. Comando novo da imagem ⇒ `entrypoint.sh`.
- Backup: `db/scripts/backup.sh` (local + Backblaze B2 via `rclone` com
  configuração por variáveis de ambiente, sem arquivo de config).

## 6. Testes e CI

Antes do push, no mínimo:

```bash
npm run typecheck
npm run build                      # sem warnings novos
for f in db/scripts/*.sh; do sh -n "$f"; done
for f in infra/*.sh testes/*.sh; do bash -n "$f"; done
cd whatsapp && npm test            # se mexeu no WhatsApp
```

- `package-lock.json` sempre em sincronia (`npm install` e commite o lock).
- O CI (`.github/workflows/principal.yml`) sobe a stack inteira num Swarm,
  roda `testes/verificar-stack.sh` e o teste no navegador `testes/e2e.mjs`.
  Funcionalidade nova visível ⇒ um `passo(...)` novo no e2e.
- No e2e: telas com `loading.tsx` respondem 200 mesmo com `notFound()` (confira
  o conteúdo, não o status); a aba escondida de `Abas` continua no DOM, então use
  `{ exact: true }` ou um seletor da aba visível.
- Só publique a tag da release para o dono **depois** do run verde.

## 7. Commits e docs

- Mensagem em português: título curto no imperativo/descritivo + corpo com o
  porquê e o que mudou. Termine com as linhas de atribuição pedidas.
- README (visão geral, telas, superadmin), INSTALACAO (servidor, stack,
  backup/B2, operação) e SEGURANCA (o que está protegido e como) andam junto
  com o código.
