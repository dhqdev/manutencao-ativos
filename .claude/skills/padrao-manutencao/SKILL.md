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
  (`db/sql/72-entrar-como.sql`) cria uma sessão **da pessoa** que vale até ele
  voltar ao console (sem limite de 1 h, pedido de 24/11/2026; teto técnico de
  30 dias em `MINUTOS_ENTRAR_COMO`, `lib/auth/entrar-como.ts`), marcada em
  `auth.sessoes.aberta_por`, sem renovar e sem contar como acesso dela, e
  registra em `sistema_entradas_como`. O cookie do superadmin fica em
  `sessao_admin`; `voltarAoConsole()` (rotas `/auth/voltar` e `/auth/sair`, e
  o proxy quando o cookie curto vence) fecha a sessão emprestada e o devolve.
  Faixa `AvisoEntrarComo` no topo do `(app)` via `getContexto().entradaComo`.
  Contagem de sessões/acessos (`admin_usuarios`, `equipe_acessos`,
  `admin_resumo`) ignora `aberta_por`. "Último acesso" (console e Equipe) é
  `greatest(last_sign_in_at, max(sessoes.ultimo_uso))` sem `aberta_por`
  (`ultimoAcesso()` em `components/admin/tipos.ts`): a sessão dura 30 dias e
  se renova, então só o login envelhece para quem usa todo dia.
  **Seções no menu lateral** (pedido do dono em 24/11/2026, antes eram abas
  no topo): `SECOES` de `components/admin/console.tsx`, cada uma com a
  própria página: Usuários (`/admin`), Clientes e uso (`/admin/clientes`),
  Assinaturas (`/admin/assinaturas`), Integrações e backup
  (`/admin/integracoes`) e Versão e atualização (`/admin/sistema`). O
  `/admin?aba=...` antigo redireciona. Os números do menu vêm de
  `carregarContadores()` (leve: `admin_resumo` + contagem de comprovantes a
  conferir). Ação do console revalida com `revalidatePath("/admin", "layout")`.
  Cartão de número em qualquer seção = `Indicador` de
  `components/admin/comum.tsx` (ícone, valor, rótulo, detalhe; vira filtro
  com `aoClicar`). Não crie seções novas no console sem o dono pedir.
  - Toda página do console começa com `exigirSuperadminTela()`
    (`lib/admin-console.ts`) — layout e página rodam em paralelo, não confie
    só no layout. Dados pelos `carregar*()` do mesmo arquivo.
  - Toda ação começa com `exigirSuperadmin()` (`lib/actions/admin.ts`), que
    confere `obterSessao().superadmin` — o posto vem do banco a cada
    requisição, nunca do cookie.
- **Assinatura (pedido do dono em 24/11/2026)**: seção **Assinaturas** do
  console (`components/admin/assinaturas.tsx`) e tela `/assinatura` da
  empresa. Pix copia e cola + QR montados no servidor por `lib/pix.ts` (BR
  Code estático, CRC16; teste com o exemplo do Banco Central) e
  `lib/assinatura-servidor.ts` (QR em SVG pelo `qrcode`). Bloqueio:
  `getContexto()` redireciona para `/assinatura` quando
  `assinatura.estado === "bloqueada"` (menos no "Entrar como"). O layout do
  `(app)`, a tela/ações de Assinatura e ações da própria pessoa (trocar de
  empresa, convites, excluir conta) usam `getContextoSemBloqueio()`. Ação
  nova que precisa funcionar com a empresa bloqueada: use essa variante.
  Comprovante vai para `{org_id}/assinatura/` e, depois da resposta
  (`after()`), segue para o WhatsApp do dono pela sessão `sistema_cobranca`
  do serviço de WhatsApp (`INSTANCIA_COBRANCA`, rota `/arquivos` para
  imagem/PDF); o resultado fica em `whatsapp_em`/`whatsapp_erro`.
  **Comprovante sem aprovação** (pedido do dono em 24/11/2026: "anexou, já
  vale"): `assinatura_enviar_comprovante` já grava `aprovado` com
  `liberado_em` e empurra o vencimento (`assinatura_proximo_vencimento`: no
  dia ou adiantado, +1 plano do vencimento; atrasado sem dia fixo, +1 plano
  do dia do pagamento). **Plano e dia** por empresa (pedido do dono):
  `assinaturas.ciclo_meses` (1, 3, 6, 12; Pix e comprovante = valor mensal ×
  meses, `pixDaEmpresa(org, config, meses)`) e `dia_vencimento` (todo dia N:
  `assinatura_no_dia` no banco e `dataNoDia` na tela fazem a mesma conta;
  mudou uma, mude a outra e o teste). Na tela do superadmin, escolher o dia
  (ou uma data com dia fixo) usa `vencimentoNoDia`: dia N do **mesmo mês** da
  data, ou o próximo a partir de hoje se já passou (24/11 + dia 5 = 05/12,
  não 05/01); atrasada fica no mês dela. O dono só olha depois: **Comprovante falso**
  (`admin_avaliar_pagamento` recusando um liberado) desfaz o mês se ninguém
  mexeu no vencimento depois, e a tela já marca bloquear junto. `pendente`
  só existe com bloqueio à mão (o comprovante espera; Liberar = +1 mês e
  desbloqueia; é o contador amarelo do menu). Não volte a criar fila de
  aprovação. **Bloqueio à mão**: `assinaturas.bloqueio_manual`
  (`admin_bloquear_empresa`, `adminBloquearEmpresa`) vira estado
  `bloqueada` por cima de tudo (até isenta/sem cobrança). O console mostra o
  comprovante ali mesmo (modal com `iframe` para PDF, `img` para imagem):
  por isso `/api/arquivos` serve PDF sem o `sandbox` da CSP (o Chrome não
  abre PDF com ele).
- Credenciais de serviços externos (Groq, Backblaze...) **não** viram
  variável da stack: o superadmin cola em **Integrações e backup** no console
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
  Modelos em `lib/modelos-groq.ts` (padrão `openai/gpt-oss-120b`, lista do
  console, `DESLIGADOS`): modelo que o Groq desligar entra em `DESLIGADOS`
  (vira o padrão sozinho); erro "modelo não existe" na hora também cai no
  padrão. O teste do console lista os modelos da chave e faz uma chamada com
  as ferramentas. Tela: rolagem da página com o campo `sticky` acima da barra
  inferior do celular; conversa em `sessionStorage` por empresa.
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
  - `45-desempenho.sql` índices compostos (`org_id` + data) e as funções de
    leitura que somam/paginam no banco: `dashboard_gastos`,
    `resumo_ativos_categoria`, `historico_manutencoes` (filtros + ordem +
    página, devolve `{ total, valor_total, linhas }`) e `busca_global`.
    Todas `security invoker` (o RLS de quem chama vale), revogadas de
    `public, anon` e liberadas para `authenticated`. Função de leitura é
    `stable` e **não** cria tabela temporária (o PostgREST roda GET em
    transação só leitura). A tela que chama tem um caminho antigo para
    quando o banco ainda não tem a função (imagem nova antes do migrador).
  - `80-esquema.sql` `sistema_esquema`: versão do SQL aplicado (fica por
    último; arquivo novo vem antes dele)
  - `71-backup.sql` `sistema_backups` (rodadas e pedidos de "backup agora")
    e `sistema_backup_servico` (sinal de vida do serviço backup)
  - `72-entrar-como.sql` `auth_entrar_como` / `auth_sair_entrada_como` e o
    registro `sistema_entradas_como` (coluna `auth.sessoes.aberta_por` mora
    no `00-fundacao.sql`, porque `20-auth.sql` já a usa)
  - `74-assinaturas.sql` assinatura mensal por Pix: `assinaturas`
    (vencimento/isenta por empresa, só leitura para a empresa),
    `assinatura_pagamentos` (comprovantes), `assinatura_situacao(org)`
    (estado: sem_cobranca, isenta, em_dia, vencendo, tolerancia, bloqueada),
    `assinatura_enviar_comprovante` e `admin_assinaturas` /
    `admin_definir_assinatura` / `admin_avaliar_pagamento`. Config (chave Pix,
    valor, tolerância, dias grátis, WhatsApp) em `sistema_credenciais`
    (`CFG` de `lib/assinatura.ts`). `contexto_usuario()` devolve a situação
    em `assinatura` (chamada dinâmica, porque o 10 roda antes do 74).
  - Coisa nova grande: crie `40-<assunto>.sql` em vez de inchar os outros.
- Tabela nova: `org_id ... references organizacoes on delete cascade`, índice
  em `org_id`, `enable row level security` e policies separadas por comando
  (select para `user_org_ids()`, escrita para `user_admin_org_ids()` ou
  `user_org_ids_escrita()`). Nunca `for all` em `org_membros` (recursão); ela nem tem escrita direta.
  Se referencia outra tabela da empresa, inclua no trigger `garantir_mesma_empresa`.
- Funções: `security definer` + `set search_path = public` (ou `public, auth`).
  No Postgres toda função nasce executável por PUBLIC: **revogue** de
  `public, anon, authenticated` e libere só quem precisa. `auth_*` e `admin_*`
  só para `service_role`.
  Vale também para função auxiliar simples (`language sql`, sem definer): o
  `verificar-stack.sh` do CI falha se QUALQUER função de `public` for
  executável por `anon` (confira localmente com `has_function_privilege('anon', ...)`).
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
  O `Modal` guarda `aoFechar` num ref e só foca o painel ao abrir: efeito
  que depende de função inline roda a cada tecla e rouba o foco do campo.
  No e2e, campo de texto em modal se preenche com `pressSequentially`.
  Inputs com a classe `campo`, rótulos com `rotulo`, cartões com `card`.
- Ícones só do `lucide-react`. Cores: grafite (`slate-900`) é ação, `marca-*`
  é navegação/estado; badges de papel seguem `PAPEIS` de `components/configuracoes/equipe.tsx`
  (o quadro "O que cada papel pode fazer" ali espelha `lib/permissoes.ts`).
- Equipe tem tela própria (`/equipe`, no grupo Administração do menu). Ação que
  mexe na conta de outra pessoa (senha, dados, sessões) passa por
  `alvoDaEquipe()` em `lib/actions/equipe.ts`: só o login que **esta** empresa
  criou (`app_metadata.convite_org`), que participa apenas dela, não é
  proprietário nem superadmin. A tela esconde os botões pelo
  `conta_da_empresa` de `equipe_acessos()`.
- Superadmin nunca entra em equipe nem tem a senha trocada pelo app (só pela
  stack). Função nova que põe alguém numa empresa ou troca senha: recuse
  `superadmin` no banco.
- `org_membros` não tem policy de escrita: entrar/sair/trocar papel só por
  função `security definer` que confere as regras.
- Quem JÁ tem conta não entra direto em equipe: vira convite
  (`db/sql/73-convites.sql`), aceito pela pessoa na faixa do topo
  (`components/shell/convites-pendentes.tsx`) e só com e-mail confirmado.
  Login nasce com e-mail não confirmado; só link de e-mail confirma
  (`lib/auth/links-email.ts`, que monta o link só com `SITE_URL`).
- Senha: valide com `problemaNaSenha(senha, email)` (`lib/auth/regras-senha.ts`,
  mínimo 8, recusa as comuns). Trocar a própria pede a atual; `/nova-senha`
  só com o cookie `recuperacao`. Ação que mexe em senha ou exclui conta recusa
  `entradaComo` com `ENTRAR_COMO_SEM_SENHA`.
- "Entrar como": tabela nova com `org_id` ganha o gatilho de auditoria sozinha
  (loop do `79-entrar-como-auditoria.sql`, que roda depois das tabelas). Arquivo
  SQL com tabela de empresa deve vir antes do 79.
- Serviço de WhatsApp fala com o banco como `whatsapp_servico` (token do app
  em `/api/whatsapp/token`). Tabela nova que ele precise: `grant` explícito a
  esse papel. Nunca dê a ele o `JWT_SECRET`. Lock versionado (`npm ci`).
- Segredo novo lido pelo app: passe por `exigir()` de `lib/auth/config.ts`
  (recusa vazio e `TROQUE-...`) e inclua na lista do `infra/deploy.sh`.
- Cookies: use as constantes de `lib/auth/sessao-cookie.ts` (`__Host-` com
  HTTPS) e apague com `delete(apagarCookie(NOME))` — o `delete(nome)` simples
  sai sem Secure e o navegador ignora para `__Host-`.
- Rota que aceita GET e muda estado (sair, voltar): recuse `pedidoDeOutroSite`.
- Upload: a rota `/api/arquivos` confere a cota (`cotaPorEmpresaBytes`).
  Coluna nova que guarda caminho de arquivo: inclua em `caminhosDoBanco()` de
  `lib/orfaos.ts`, senão a limpeza noturna move os arquivos dela.
- Limite de tentativas: lista de `{ chave, limite }` em
  `bloqueadoPorTentativas`/`registrarTentativa` (`lib/auth/usuarios.ts`).
  Nunca uma chave só por e-mail com limite baixo: vira jeito de trancar a
  conta dos outros.
- Nada de efeito em todo clique (as faíscas foram tiradas a pedido do dono).
  Enfeite é discreto, `aria-hidden`, `pointer-events-none`, `no-print` e some
  com `prefers-reduced-motion`.
- Datas comemorativas (pedido do dono em 24/11/2026): `lib/festas.ts` liga
  cada data **30 dias antes** e desliga sozinha depois (fuso de Brasília);
  Páscoa (Meeus), Carnaval (Páscoa − 50 a − 47) e Dia das Mães/Pais (2º
  domingo) são calculados. Datas sobrepostas: a mais próxima ganha. Cookie
  `enfeites` deixa cada aparelho desligar (o antigo `natal=desligado` ainda
  vale). Leia no servidor com `festaNaTela(await cookies())`. Visual em
  `components/festas/`: `temas.ts` (cores, ícone, textos), `enfeites.tsx`
  (borda do menu: pisca-pisca no Natal, bandeirinhas no São João, filete nas
  outras; `CartaoFesta` no menu; `FaixaFesta` no Dashboard só na última
  semana), `particulas.tsx` (`Ambiente`: neve, confete...) e
  `acessorios.tsx` (`LogoFestivo`: gorro, capacete, orelhas...). O trenó com
  renas foi **tirado a pedido do dono**: nada atravessando a tela. Enfeite é
  minimalista: só transform/opacity, sorteio com semente (`sorteio.ts`, sem
  `Math.random` nem `Math.sin`: hidratação), degradê SVG com `useIdSvg`
  (o logo aparece duas vezes na página). Data nova: entra em `festasDoAno`,
  `TEMAS` e `ACESSORIOS` (+ teste em `testes/unidade/festas.test.mjs`).
  Animação nova entra também no bloco `prefers-reduced-motion` do
  `globals.css`.
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
  cookie dos enfeites para pôr o detalhe da data no logo e o `Ambiente`) e os campos de
  `components/auth/campos.tsx` (`CampoSenha` já avisa Caps Lock ligado).
  Formulário cliente importa `Alerta` de `components/auth/alerta.tsx`, nunca
  de `moldura.tsx` (ela usa `next/headers`). A ilustração do painel é a
  `Vitrine` (`components/auth/vitrine.tsx`): cartões de exemplo, `aria-hidden`.
- Marca: `Logo` / `Simbolo` de `components/marca.tsx` (um "M" cuja segunda
  perna vira um visto, num selo azul fixo que serve em fundo claro e escuro;
  sem prop de tom). Mudou o traço (`TRACO_MARCA`)? Atualize `app/icon.svg` e
  `app/apple-icon.svg`, rode `node scripts/gerar-icones.mjs` (PNGs do PWA) e
  suba `VERSAO` em `public/sw.js` (os ícones ficam em cache). No menu e nas
  telas de entrada o logo é o `LogoFestivo` (com o detalhe da data da vez).
- Formulário cliente: `useTransition` + chamar a action + mostrar `erro` +
  `router.refresh()` no sucesso (veja `FormModal` em `components/admin/comum.tsx`).
  Envolva a chamada em `chamarAcao(() => acao(fd))` (`lib/acao-cliente.ts`):
  queda de rede ou aba com versão antiga vira mensagem no formulário em vez
  de derrubar a tela. Envie com `<form onSubmit={enviarSemLimpar(enviar)}>`
  (mesmo arquivo), **nunca** `<form action={fn}>`: o React 19 limpa o
  formulário quando a função termina, até com erro (o que a pessoa digitou
  sumia), e o `<select>` volta ao valor de quando a página abriu, porque não
  acompanha o `defaultValue` novo (o horário do WhatsApp "desfazia" e o
  próximo Salvar regravava o valor velho). Limpar de propósito é
  `form.reset()` (`limparAoSalvar` do `FormularioSalvar`).
- **Listas com cara de ERP**: no computador, tabela densa com a classe
  `tabela-erp` (globals.css: cabeçalho fixo, linhas compactas, rodapé com o
  total) dentro de um `div` com `max-h-[calc(100dvh-13rem)] overflow-auto`;
  no celular (`md:hidden`), cartões compactos. Exemplos:
  `components/manutencoes/tabela-manutencoes.tsx` e `TabelaPlanos` em
  `components/planos/lista-planos.tsx`. Barra de filtros com `campo-compacto`.
  - Exceção pedida pelo dono (24/11/2026): as **periódicas** abrem em
    **Quadro** (kanban: uma coluna por situação com os cards
    `CartaoPlano`, `QuadroPlanos` em `lista-planos.tsx`; no celular as
    colunas empilham), com alternador Quadro/Lista lembrado no cookie
    `vista_planos` (`lib/vista-planos.ts`, lido pela página no servidor).
  - Largura: o conteúdo do `(app)` e do console usa a tela toda até
    `max-w-[120rem]` (pedido do dono); não volte a centralizar estreito.
  - Lista que pode crescer sem limite (histórico geral) **não** baixa tudo
    para filtrar na tela: filtros, ordem e página vão na URL
    (`lib/historico.ts` valida tudo que vem dela) e o banco pagina
    (`historico_manutencoes`, `lib/historico-servidor.ts`). Lista pequena
    (histórico de um ativo) filtra e ordena na própria tela.
  - Somas e contagens de tela (dashboard, categoria) vêm prontas do banco,
    não de baixar as linhas e somar no Node.
  - Exportar: CSV com `paraCsv` (`lib/csv.ts`: `;`, vírgula decimal, BOM,
    célula que começa com `= + - @` ganha apóstrofo) e as colunas de
    `lib/exportar.ts`. Lista na tela → `baixarCsv` no navegador; lista
    paginada → rota `app/api/exportar/<lista>/route.ts` com os mesmos filtros.
- **Teclado**: busca global Ctrl+K (`components/shell/busca-global.tsx`,
  `busca_global` no banco); `/` foca o campo com `data-busca` da tela; `N`
  clica no botão com `data-atalho-novo` (o principal de novo cadastro: já
  está em `DialogoManutencao` com `atalhoNovo`, `DialogoAtivo`,
  `DialogoPneu`). Tela nova com busca ou cadastro: ponha esses atributos.
  A lista de atalhos fica em `ATALHOS` (o `?` mostra). No celular,
  `BarraAcoesCelular` usa os mesmos atributos para a barrinha "Filtros / Novo".
- **Movimento sóbrio**: nada de número contando, entrada em cascata ou
  cartão que "levanta"/ícone que gira no hover. Entrada de tela e de lista é
  só um fade curto (`aparecer`).
- Densidade das tabelas: cookie `densidade` (`lib/densidade.ts`, compacta
  por padrão), classe no `<html>` pelo `app/layout.tsx`, escolha em
  Configurações → Aparência.
- Biblioteca pesada só no clique: o jsPDF (`lib/relatorio-pdf.ts`) é
  carregado por `import()` em `components/relatorios/gerador.tsx`; cálculos e
  textos do relatório ficam em `lib/relatorio-dados.ts`, sem o jsPDF.
- Fronteiras de erro: `app/(app)/error.tsx` (mantém o menu), `app/error.tsx`
  e `app/global-error.tsx`, todas com `ErroTela` (`components/erro-tela.tsx`).
  No Next 16 a prop é `retry` (não `reset`).
- Tela restrita: confira no servidor e chame `notFound()` (não só esconder o botão).
- Datas com hora: use `dataHoraBR` (fuso fixo de Brasília). `toLocaleString`
  sem `timeZone` em componente cliente gera erro de hidratação (#418) quando o
  fuso do navegador difere do servidor. `dataBR` de um timestamptz
  ("criado em") já mostra o dia de Brasília; não corte a string do banco.
  Texto que depende da hora atual (ex.: "próximo resumo às...") é montado no
  servidor e vai pronto por prop para o componente cliente.
- Fuso do banco: `00-fundacao.sql` fixa `timezone = America/Sao_Paulo` no
  banco (`alter database`), então `current_date` das views e funções
  (vencimentos, antecedência, situação das periódicas, pendências do
  WhatsApp) é o dia de Brasília, igual ao `hoje()` do app. Não mude.
- Resumo do WhatsApp: `horario_envio` é a hora cheia de Brasília. A regra
  (padrão 8h, rodada no minuto 1 de cada hora, nova tentativa de hora em
  hora) mora em `lib/whatsapp-agenda.ts`, usada pela rotina
  (`/api/notificacoes/disparar`) e pela tela, que mostra o próximo envio.
  `whatsapp_envios.tentativas` (somada por `whatsapp_reservar_envio`) e
  `ultima_falha` (o sucesso depois não apaga) explicam um resumo que saiu
  depois do horário.
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
  Pedido do dono (24/11/2026): automático **a cada N dias** (`backup_cada_dias`
  no console ou `BACKUP_CADA_DIAS`, padrão 15, contado do último backup bom em
  `sistema_backups`: `backup_vencido` no script e `proximoBackup` em
  `lib/backup-regras.ts` seguem a mesma regra) e modo **espelho** por padrão
  (`b2_modo`/`B2_MODO`: só o dump mais novo, `sync` sem `--backup-dir`,
  `arquivos-removidos/` apagada); `historico` mantém o jeito antigo com
  `b2_dias`. Senha de criptografia **opcional** e fora da tela (o dono quer
  simples); uma já salva continua valendo.
  O serviço olha `sistema_backups` a cada 15 s (botão "Fazer backup agora"),
  registra cada rodada lá e manda sinal de vida em `sistema_backup_servico`. O dump só
  conta se o `pg_restore --list` o lê; a retenção só apaga cópias antigas
  depois de um backup bom; `ULTIMO-BACKUP.txt` no volume diz o resultado da
  última rodada; `backup-agora` sai com erro se falhar.
- Atualização pelo console: o app **nunca** fala com o Docker. A ação grava
  em `sistema_atualizacoes`; o serviço `atualizador` (`db/scripts/atualizador.sh`,
  socket do Docker, sem porta) aplica: migrador primeiro, depois os outros,
  ele por último. Versão atual = `APP_VERSAO` (build-arg do CI); última =
  maior tag `vAAAA.MM.DD-N` do ghcr.io (`lib/atualizacao.ts`). No fim ele
  força o restart do PostgREST da stack (`servicos_postgrest`): o canal de
  `notify pgrst` pode morrer e o cache velho dá PGRST202 em função nova. Serviço novo que
  usa imagem nossa entra sozinho na atualização (é achado pela base da imagem).
  Sobras (pedido de 24/11/2026): `limpar_sobras` no atualizador apaga
  contêineres parados com a etiqueta da stack e imagens da `BASE` sem contêiner
  usando, menos a tag dele. Nunca `-f`. **Decide pela tarefa do Swarm, não
  pelo código de saída**: a imagem ops herda `STOPSIGNAL SIGINT` do postgres
  (parada normal = 130) e o PostgREST sai com 255 — olhar o código deixava os
  parados para sempre. Modo `tudo` no fim da atualização e ao subir até 15 min
  depois de uma (pedido de 24/11/2026: não sobra nenhum parado); modo `rotina`
  ao subir e de hora em hora (segura 24 h só tarefa failed/rejected da imagem
  atual). Revisa 1 e 5 min depois de subir (start-first ainda parando). Grava
  o resultado em `sistema_atualizador.limpeza_em/limpeza_msg/parados`, que o
  console mostra; `verificar-stack.sh` testa trocando cron e PostgREST.
  `faxina_geral` (também pedido do dono, só em atualização pelo console e ao
  subir até 15 min depois de uma): `image prune -a`, `builder prune` e
  volumes sem uso que são anônimos ou, com nome, **vazios** (olhados por um
  `docker run` só leitura). Nunca `volume prune -a`/`system prune`: volume
  com dado (banco de qualquer stack com o serviço parado) não pode sair.
  Repositório pode ficar privado: console e atualizador só dependem dos
  pacotes do ghcr.io serem públicos (token anônimo).

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
