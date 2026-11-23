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
- Fluxo de entrega combinado com o dono: `npm run verificar` local e push
  **direto na `main`** (sem branch). Cada push verde na main gera a release `vAAAA.MM.DD-N` (N = número
  do run) com as imagens `app`, `whatsapp` e `ops` no ghcr.io. Main vermelha é
  falha nossa: veja a seção 6.

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
  console do superadmin). Nunca para buscar dados de tela comuns.
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
- Nada do navegador vai cru para o banco (senão volta erro do Postgres em
  inglês na tela): id → `exigirId`/`idOpcional`; enum → `opcao(valor, LISTA,
  padrão, "o rótulo")`; número que não pode ser negativo → `naoNegativo`.
  Ações que recebem id por parâmetro começam com `exigirId(id, "o ...")`.
- Valide **tudo antes da primeira gravação**. Se a ação grava em duas
  tabelas, desfaça a primeira quando a segunda falhar (ex.: periódica criada
  junto com a manutenção em `salvarManutencao`).
- `mensagemErro()` relança redirect/notFound do Next (`unstable_rethrow`):
  `getContexto()` dentro do try redireciona para o login com sessão vencida.
  Em catch próprio que não usa `mensagemErro`, chame `unstable_rethrow(e)`.
- `erroBanco()` traduz os códigos do Postgres (23503, 23514, 22P02...); as
  mensagens de `raise exception` das nossas funções passam como vieram.
  PGRST202/PGRST205 (função/tabela que o banco ainda não tem: imagem nova sem
  o migrador ter rodado) viram `BANCO_DESATUALIZADO`; ação que repassa
  `error.message` cru confere `esquemaDesatualizado(error)` antes. Se o
  migrador rodou e só o PostgREST ficou com o cache velho,
  `recarregarEsquema()` (`lib/db/admin.ts` → `sistema_recarregar_esquema()`
  em `80-esquema.sql`) pede para ele reler; tente a chamada mais uma vez
  depois (como em `adminEntrarComo`).
- Permissões por papel ficam em `lib/permissoes.ts` e **espelham** o RLS.
  Papéis: proprietário / gestor (tudo) · técnico (registra manutenções, anexos,
  movimenta pneus) · leitor (só consulta).
- Superadmin = **console de gerência** (`app/admin/`, fora do grupo `(app)`,
  casca própria em `components/admin/console.tsx`). Ele **não** entra no
  sistema das empresas com a conta dele: `getContexto()` o redireciona para
  `/admin` e ele não pode ser membro de equipe (`admin_definir_membro` recusa).
  A única porta é o **"Entrar como"** (pedido do dono em 23/11/2026), no
  detalhe do usuário: `adminEntrarComo()` → `auth_entrar_como()`
  (`db/sql/72-entrar-como.sql`) cria uma sessão de 1 h (`MINUTOS_ENTRAR_COMO`,
  `lib/auth/entrar-como.ts`) **da pessoa**, marcada em
  `auth.sessoes.aberta_por`, sem renovar e sem contar como acesso dela, e
  registra em `sistema_entradas_como`. O cookie do superadmin fica em
  `sessao_admin`; `voltarAoConsole()` (rotas `/auth/voltar` e `/auth/sair`, e
  o proxy quando o cookie curto vence) fecha a sessão emprestada e o devolve.
  Faixa `AvisoEntrarComo` no topo do `(app)` via `getContexto().entradaComo`.
  Contagem de sessões/acessos (`admin_usuarios`, `equipe_acessos`,
  `admin_resumo`) ignora `aberta_por`. O dono quer
  **uma tela só** (`app/admin/page.tsx`: abas Usuários, Clientes e uso e
  Integrações + bloco da versão);
  não crie telas novas no console sem ele pedir.
  - Toda página do console começa com `exigirSuperadminTela()`
    (`lib/admin-console.ts`) — layout e página rodam em paralelo, não confie
    só no layout. Dados pelos `carregar*()` do mesmo arquivo.
  - Toda ação começa com `exigirSuperadmin()` (`lib/actions/admin.ts`), que
    confere `obterSessao().superadmin` — o posto vem do banco a cada
    requisição, nunca do cookie.
- Credenciais de serviços externos (Groq, Backblaze...) **não** viram
  variável da stack: o superadmin cola na aba **Integrações** do console
  (`components/admin/integracoes.tsx`, um cartão por serviço dentro de
  `IntegracoesAdmin`). Ficam em `sistema_credenciais` (chave/valor, só
  `service_role`, `db/sql/70-integracoes.sql`); leia no servidor com
  `obterCredenciais()` (`lib/integracoes.ts`) e mande para a tela só se existe
  e o final (nunca o valor). Campo de chave em branco = manter a atual.
- Assistente de IA (`/assistente`, Groq): o modelo só chama as ferramentas de
  `lib/assistente-ferramentas.ts` (tabelas/colunas em lista fechada, só
  leitura) e `lib/assistente.ts` executa com `createClient()` + `org_id` da
  empresa aberta. Tabela nova que o cliente deveria poder perguntar ⇒ entre
  em `TABELAS` (sem colunas sensíveis: caminho de arquivo, ids de usuário).
- Arquivos: o navegador sobe direto para `/api/arquivos` com token de envio
  (`criarUploadAssinado`); o caminho começa sempre por `{org_id}/`. Ao apagar
  linhas com anexos/fotos, chame `removerArquivos()` depois.

## 3. Banco (`db/sql/`)

- Os arquivos rodam em ordem a **cada deploy** pelo migrador (e por
  `garantir_esquema` de `db/scripts/comum.sh`, que backup e atualizador chamam
  ao subir quando a imagem, `OPS_VERSAO`, é mais nova que `sistema_esquema`:
  o Portainer nem sempre roda o migrador de novo). Cada arquivo segura a trava
  727272, então dois aplicadores ao mesmo tempo não trombam. Tudo tem que ser
  **idempotente** (`create table if not exists`, `add column if not exists`,
  `create or replace function`, `drop policy if exists` + `create policy`,
  enums com `exception when duplicate_object`).
  - `00-fundacao.sql` papéis, schema `auth`, `auth.uid()`
  - `10-schema.sql` tabelas, RLS, views, triggers do sistema
  - `20-auth.sql` funções `auth_*` (login, sessão, senha)
  - `30-superadmin.sql` superadmin vindo da stack e funções `admin_*`
  - `40-atualizacoes.sql` pedidos do botão Atualizar e sinal do atualizador
  - `50-validacoes.sql` travas `check` (valores não negativos, cor #RRGGBB)
    criadas como `not valid` por `pg_temp.trava()`: base antiga com dado
    estranho não derruba o deploy. Regra nova de valor vai lá.
  - `60-equipe.sql` `equipe_acessos()`: último acesso e sessões abertas da
    equipe (dados de `auth.*` que o PostgREST não expõe)
  - `70-integracoes.sql` `sistema_credenciais` (chaves do console)
  - `80-esquema.sql` `sistema_esquema`: versão do SQL aplicado (fica por
    último; arquivo novo vem antes dele)
  - `71-backup.sql` `sistema_backups` (rodadas e pedidos de "backup agora")
    e `sistema_backup_servico` (sinal de vida do serviço backup)
  - `72-entrar-como.sql` `auth_entrar_como` / `auth_sair_entrada_como` e o
    registro `sistema_entradas_como` (coluna `auth.sessoes.aberta_por` mora
    no `00-fundacao.sql`, porque `20-auth.sql` já a usa)
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
  é navegação/estado; badges de papel seguem `PAPEIS` de `components/configuracoes/equipe.tsx`
  (o quadro "O que cada papel pode fazer" ali espelha `lib/permissoes.ts`).
- Equipe tem tela própria (`/equipe`, no grupo Administração do menu). Ação que
  mexe na conta de outra pessoa (senha, dados, sessões) passa por
  `alvoDaEquipe()` em `lib/actions/equipe.ts`: só quem participa **apenas**
  desta empresa e não é proprietário.
- Nada de efeito em todo clique (as faíscas foram tiradas a pedido do dono).
  Enfeite é discreto, `aria-hidden`, `pointer-events-none`, `no-print` e some
  com `prefers-reduced-motion`.
- Natal: `lib/natal.ts` decide a época (15/11 a 6/1, fuso de Brasília) e o
  cookie `natal` deixa cada aparelho desligar. Decoração em
  `components/natal/decoracao.tsx` (luzes, neve no menu, gorro, bolinhas
  `Enfeites`, trenó com renas desenhadas em SVG com degradê e patas em
  galope). Animação nova de enfeite entra também no bloco
  `prefers-reduced-motion` do `globals.css`.
- Tem que funcionar no celular (é PWA): barra inferior + menu "Mais"; modais
  viram folha que desce do topo (`Modal`, animação `folha-topo`); só o menu
  "Mais" sobe da barra inferior. Item novo de menu vai em `MENU` de
  `components/shell/navegacao.tsx`, com o `grupo` (Operação, Análise,
  Administração); os 4 primeiros vão na barra inferior do celular.
- Menu lateral (desktop) recolhe para só ícones (botão na borda ou Ctrl+B).
  O estado vai no cookie `menu_lateral` (`lib/menu-lateral.ts`), lido no
  `app/(app)/layout.tsx`: assim o servidor já entrega a largura certa, sem o
  menu "pular" depois de hidratar. Preferência visual nova segue o mesmo
  caminho (cookie, como o tema), não `localStorage`. Com o menu recolhido, o
  nome vem da `Dica` (hover/foco) e de um texto `sr-only` no link.
- Telas de entrada (`/login`, `/cadastro`, `/recuperar-senha`, `/nova-senha`)
  usam `MolduraAuth` (`components/auth/moldura.tsx`, server component: lê o
  cookie do Natal para pôr o gorro e a neve) e os campos de
  `components/auth/campos.tsx` (`CampoSenha` já avisa Caps Lock ligado).
  Formulário cliente importa `Alerta` de `components/auth/alerta.tsx`, nunca
  de `moldura.tsx` (ela usa `next/headers`). A ilustração do painel é a
  `Vitrine` (`components/auth/vitrine.tsx`): cartões de exemplo, `aria-hidden`.
- Marca: `Logo` / `Simbolo` de `components/marca.tsx` (um "M" cuja segunda
  perna vira um visto, num selo azul fixo que serve em fundo claro e escuro;
  sem prop de tom). Mudou o traço (`TRACO_MARCA`)? Atualize `app/icon.svg` e
  `app/apple-icon.svg`, rode `node scripts/gerar-icones.mjs` (PNGs do PWA) e
  suba `VERSAO` em `public/sw.js` (os ícones ficam em cache). Gorro de Natal
  vai num `span relative` em volta do `Logo`.
- Formulário cliente: `useTransition` + chamar a action + mostrar `erro` +
  `router.refresh()` no sucesso (veja `FormModal` em `components/admin/comum.tsx`).
  Envolva a chamada em `chamarAcao(() => acao(fd))` (`lib/acao-cliente.ts`):
  queda de rede ou aba com versão antiga vira mensagem no formulário em vez
  de derrubar a tela.
- Fronteiras de erro: `app/(app)/error.tsx` (mantém o menu), `app/error.tsx`
  e `app/global-error.tsx`, todas com `ErroTela` (`components/erro-tela.tsx`).
  No Next 16 a prop é `retry` (não `reset`).
- Tela restrita: confira no servidor e chame `notFound()` (não só esconder o botão).
- Datas com hora: use `dataHoraBR` (fuso fixo de Brasília). `toLocaleString`
  sem `timeZone` em componente cliente gera erro de hidratação (#418) quando o
  fuso do navegador difere do servidor.
- "Hoje" e meses: `hoje()`, `mesBR(n)`, `primeiroDiaDoMes(n)`,
  `ultimoDiaDoMes(n)`, `somarDias`, `somarMeses` (`lib/format.ts`). Nunca
  `new Date()` + `setMonth`/`toLocaleDateString("sv-SE")` sem fuso: o
  container roda em UTC e depois das 21h já seria o dia (ou mês) seguinte.

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
- Credencial nova de integração (seção 2): teste na API do serviço antes de
  gravar (como `testarB2()` em `lib/backup.ts`).
- Backup: `db/scripts/backup.sh` (local + Backblaze B2 via `rclone` com
  configuração por variáveis de ambiente, sem arquivo de config). As
  credenciais do B2 vêm do console (`sistema_credenciais`, relidas a cada
  rodada) e, com ele vazio, das variáveis `B2_*` da stack. No B2:
  `<pasta>/banco/AAAA/MM/`, `<pasta>/arquivos/`, `<pasta>/arquivos-removidos/<carimbo>/`.
  O serviço olha `sistema_backups` a cada 15 s (botão "Fazer backup agora"),
  registra cada rodada lá e manda sinal de vida em `sistema_backup_servico`. O dump só
  conta se o `pg_restore --list` o lê; a retenção só apaga cópias antigas
  depois de um backup bom; `ULTIMO-BACKUP.txt` no volume diz o resultado da
  última rodada; `backup-agora` sai com erro se falhar.
- Atualização pelo console: o app **nunca** fala com o Docker. A ação grava
  em `sistema_atualizacoes`; o serviço `atualizador` (`db/scripts/atualizador.sh`,
  socket do Docker, sem porta) aplica: migrador primeiro, depois os outros,
  ele por último. Versão atual = `APP_VERSAO` (build-arg do CI); última =
  maior tag `vAAAA.MM.DD-N` do ghcr.io (`lib/atualizacao.ts`). Serviço novo que
  usa imagem nossa entra sozinho na atualização (é achado pela base da imagem).

## 6. Testes e CI

Antes de qualquer push:

```bash
npm install          # uma vez: liga o pre-push (.githooks) via script "prepare"
npm run verificar    # lock, tipos, unidade, build, WhatsApp, shell — ~30 s
npm run testar       # só os testes de unidade (testes/unidade, node:test)
```

- Testes de unidade: `testes/unidade/*.test.mjs` com `node:test`, importando
  os `.ts` direto (o Node remove os tipos; `registrar.mjs` resolve `@/` e
  `next/*`). Lógica pura nova (validação, datas, cálculos) ganha teste lá.

- `scripts/verificar.sh` é **o mesmo** passo do job `verificar` do Actions e
  roda sozinho no `git push` (pre-push). Não use `--no-verify` para "resolver".
- Sem branches: o dono pediu (19/11/2026) que tudo vá **direto para a
  `main`**, e o Actions roda só lá. Por isso o `npm run verificar` local é a
  barreira antes do push. O e2e e a stack (Swarm) só rodam no Actions: mudou
  tela, fluxo, SQL, infra ou `testes/`? Confira com cuidado (tela no
  navegador, SQL num Postgres de verdade) antes de subir, e acompanhe o run
  da main até ficar verde. Se ficar vermelho, corrija na hora com um commit
  novo.
- `package-lock.json` sempre em sincronia (`npm install` e commite o lock);
  o CI usa `npm ci` estrito.
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
