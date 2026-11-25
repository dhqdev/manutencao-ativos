# Gestão de Manutenção de Ativos

Sistema web para controlar ativos, manutenções realizadas, custos, históricos e
manutenções preventivas — com calendário, alertas de vencimento e relatórios em
PDF prontos para enviar no WhatsApp.

Feito com **Next.js 16 + React 19 + TypeScript + Tailwind CSS 4**, rodando
inteiro em servidor próprio: **PostgreSQL 17 + PostgREST + Traefik + Docker
Swarm**, com autenticação, arquivos, backup e WhatsApp (Baileys) próprios —
sem depender de Supabase, Vercel ou outro serviço externo.

### Novidades (24/11/2026)

- **Mais rápido e com cara de ERP**: tabelas densas com cabeçalho fixo e
  ordenação, filtros e página no link, totais calculados no banco, PDF só
  carregado na hora e busca global com **Ctrl+K** ([detalhes](#busca-e-atalhos-de-teclado)).
- **Periódicas em quadro (kanban)**: colunas Atrasadas, Vencendo em breve, Em
  dia e Pausadas ([detalhes](#manutenções-periódicas)).
- **Assinatura mensal por Pix**: QR e copia e cola no sistema; o comprovante
  anexado **vale na hora, sem aprovação**, e chega no WhatsApp do dono, que
  olha quando quiser no console (vê o PDF ali mesmo), marca **comprovante
  falso** ou **bloqueia a empresa** ([detalhes](#assinatura-por-pix)).
- **Console do superadmin com menu lateral**: Usuários, Clientes e uso,
  Assinaturas, Integrações e backup e Versão, cada um na sua página.
- **Backup a cada 15 dias** com o Backblaze B2 espelhado com o app, sem senha
  de criptografia obrigatória ([detalhes](#backup-no-backblaze-b2)).
- **"Entrar como" sem limite de 1 hora**: vale até voltar ao console ou sair.
- **Atualizador faz a faxina**: apaga contêineres parados da stack, imagens sem
  uso, cache de build e volumes vazios sem uso (volume com dado nunca sai)
  ([detalhes](#atualizar-pelo-console)).
- **Repositório pode ser privado**, com os pacotes do ghcr.io públicos.
- **Assistente de IA** com o Groq no modelo `openai/gpt-oss-120b`, trocando
  sozinho de modelo quando o Groq desliga o salvo ([detalhes](#assistente-de-ia)).

---

## 1. Arquitetura

```
internet ─► Traefik (HTTPS, Let's Encrypt)
              └─► app (Next.js) ──► rest (PostgREST) ──► db (PostgreSQL 17)
                    │   ▲                  ▲
                    │   └ arquivos (volume) │
                    └──► whatsapp (Baileys) ┘

migrador · cron (resumo do WhatsApp) · backup (a cada 15 dias) · atualizador
```

| Peça | O que faz |
|---|---|
| **app** | Telas, server actions, login/sessões, fotos e anexos (`/api/arquivos`) |
| **rest** | PostgREST: API do banco, **só na rede interna**. O app chama com um JWT curto do usuário; o RLS do Postgres filtra cada linha pela empresa |
| **db** | PostgreSQL 17 com RLS em todas as tabelas e autenticação própria (schema `auth`) |
| **whatsapp** | Servidor Baileys sempre ligado (QR, "digitando", reconexão) |
| **migrador** | Aplica `db/sql/*.sql` a cada deploy (idempotente) e cria/atualiza o superadmin. Backup e atualizador também conferem a versão do banco ao subir e aplicam o SQL que faltar |
| **cron** | Chama a rotina do resumo diário do WhatsApp de hora em hora |
| **backup** | `pg_dump` + arquivos a cada 15 dias (configurável), com cópia no Backblaze B2 espelhada com o app (credenciais no console do superadmin, Integrações e backup) |
| **atualizador** | Aplica a release nova quando o superadmin clica em **Atualizar** no console e apaga as sobras da stack (tem o socket do Docker; não abre porta) |
| **traefik** | Porta de entrada, HTTPS automático, painel protegido por senha |

### Deploy (Docker Swarm ou Portainer)

Build, testes e releases: GitHub Actions na `main` (`.github/workflows/principal.yml`).
Cada push verde publica as imagens `app`, `whatsapp` e `ops` (linux/arm64) no
ghcr.io e gera uma release `vAAAA.MM.DD-N` com as notas e o pacote `infra/`.

Dois jeitos de subir a stack no Swarm (passo a passo em
**[INSTALACAO.md](INSTALACAO.md)**, Oracle Cloud ARM64):

- **Na VM, com o Traefik da própria stack**: `infra/stack.yml` + `infra/.env`
  (copiado de `.env.exemplo`) e `./deploy.sh`. Com os segredos de deploy no
  GitHub, o Actions roda isso sozinho a cada push na `main`.
- **No Portainer, com um Traefik que já existe**: cole `infra/portainer.yml`
  em *Stacks → Add stack*, troque os valores `TROQUE-...` e faça o Deploy.

Depois de instalado, a atualização é pelo **console do superadmin**
(bloco **Versão do sistema** → **Atualizar para vX**, veja
[Atualizar pelo console](#atualizar-pelo-console)). Variável ou serviço novo
na stack ainda pedem *Update the stack* no Portainer ou `./deploy.sh`; o banco
se acerta sozinho nos dois casos.

### O banco

Todo o SQL fica em [`db/sql/`](db/sql/) e é aplicado pelo migrador:

| Arquivo | O quê |
|---|---|
| `00-fundacao.sql` | Papéis (`anon`, `authenticated`, `service_role`, `authenticator`), schema `auth` (usuários, sessões, tokens, tentativas) e `auth.uid()` |
| `10-schema.sql` | Tabelas, RLS, views, funções e triggers do sistema |
| `20-auth.sql` | Funções de login, sessão, senha e recuperação (só o servidor chama) |
| `30-superadmin.sql` | Login do superadmin (vindo da stack) e funções `admin_*` do painel de administração |
| `40-atualizacoes.sql` | `sistema_atualizacoes`: pedidos do botão **Atualizar** que o atualizador aplica |
| `45-desempenho.sql` | Índices compostos e totais calculados no banco (dashboard, histórico paginado, busca global) |
| `50-validacoes.sql` | Travas de valores (negativos, cores) que valem para qualquer caminho de escrita |
| `60-equipe.sql` | Último acesso e sessões abertas para a tela Equipe |
| `70-integracoes.sql` | `sistema_credenciais`: chaves de serviços externos (Groq, B2, Pix...) salvas pelo console |
| `71-backup.sql` | Rodadas do backup (histórico e "backup agora") e sinal de vida do serviço backup |
| `72-entrar-como.sql` | "Entrar como" do superadmin: sessão na conta da pessoa e registro de cada entrada |
| `73-convites.sql` | Convite com aceite para pôr na equipe quem já tem conta (só com e-mail confirmado) |
| `74-assinaturas.sql` | Assinatura por Pix: vencimento por empresa, comprovantes e bloqueio |
| `79-entrar-como-auditoria.sql` | O que o superadmin alterou numa conta pelo "Entrar como" (a empresa vê em Equipe) |
| `80-esquema.sql` | `sistema_esquema`: versão do SQL aplicado, para o banco se atualizar sozinho |

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
| **Manutenções** | Periódicas em **quadro (kanban)** ou lista, com alertas de atraso/vencimento + histórico geral em tabela, com busca, filtros (tipo, categoria, ativo, período) e ordem que ficam no link, paginação e **Exportar CSV** (abre no Excel) |
| **Calendário** | Mês a mês, com realizadas (verde), programadas (azul) e atrasadas (vermelho). Filtra por categoria e por situação |
| **Estoque** | Pneus com número de fogo, medida, DOT, sulco, valor e situação (estoque, em uso, recapagem, descarte). Movimentações com veículo, posição e KM, e histórico de cada pneu |
| **Relatórios** | Filtra por período, uma ou mais categorias, ativo e tipo. Histórico com horímetro/KM e seção de pneus (gastos, movimentações, sulco baixo). Gera PDF e compartilha no WhatsApp |
| **Assistente** | Chat com IA que responde em português sobre os dados da empresa ([detalhes](#assistente-de-ia)) |
| **Assinatura** | Situação da mensalidade, QR do Pix, copia e cola e envio do comprovante ([detalhes](#assinatura-por-pix)) |
| **Equipe** | Quem tem acesso, com que papel, último acesso e quem está conectado. Busca, filtro por papel, criar acesso, trocar papel, editar dados, gerar senha nova, desconectar e remover |
| **Configurações** | Dados da empresa, perfil, senha, aparência (tema, densidade das tabelas e enfeites das datas comemorativas), **WhatsApp** (com horário do envio), empresa ativa |

### Busca e atalhos de teclado

**Ctrl+K** (⌘K no Mac) ou o botão **Buscar** do menu abre a busca global:
ativos, manutenções, periódicas, pneus e telas da empresa aberta, e a ação
"Registrar manutenção". Na busca, **?** mostra todos os atalhos: **/** vai para
a busca da tela, **N** abre o cadastro novo da tela (manutenção, ativo, pneu),
**Ctrl+B** recolhe o menu e **Esc** fecha janelas.

### Datas comemorativas

O sistema ganha um enfeite discreto **30 dias antes** de cada data e ele some
sozinho quando a data passa, sem precisar de deploy nem de ninguém ligar:

| Data | Quando | Enfeite |
|---|---|---|
| Natal | 25/12 | luzinhas no menu, neve leve, gorro no logo |
| Ano Novo | 1º/01 (fica até o Dia de Reis) | estrelas cintilando, brilho no logo |
| Carnaval | sábado a terça, calculado pela Páscoa | confete, máscara no logo |
| Páscoa | domingo de Páscoa (calculado) | orelhas de coelho, ovinhos pendurados |
| Dia do Trabalhador | 1º/05 | capacete no logo |
| Dia das Mães | 2º domingo de maio | pétalas, coraçãozinho |
| São João | 24/06 (fica até o São Pedro, 29/06) | bandeirinhas, fagulhas da fogueira, chapéu de palha |
| Dia dos Pais | 2º domingo de agosto | gravata-borboleta |
| Independência | 07/09 | roseta verde e amarela |
| Dia das Crianças | 12/10 | bolhas de sabão, balão |

No pé do menu um cartão conta os dias, com uma barrinha da espera. Na última
semana (e no dia) entra uma faixa fina no Dashboard com um recado útil (por
exemplo, programar as manutenções antes do feriado). Quando duas datas se
encostam (Natal e Ano Novo), a mais próxima aparece e a outra assume depois.
Cada aparelho pode desligar em **Configurações → Aparência**, que também mostra
as próximas datas. Quem pediu menos animação no sistema operacional vê os
enfeites parados, sem neve, confete nem bolhas.

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
horário escolhido (horário de Brasília) sai o resumo das manutenções
atrasadas e a vencer — com "digitando..." antes, como uma pessoa. Se nessa hora
o WhatsApp estiver fora do ar (ou não houver nada pendente), o sistema tenta de
novo de hora em hora; a tela mostra quando sai o próximo e, se o de hoje
atrasou, o motivo.

O WhatsApp roda num serviço próprio com [Baileys](https://github.com/WhiskeySockets/Baileys)
(pasta `whatsapp/`), sempre conectado.
Instalação e detalhes em [WHATSAPP.md](WHATSAPP.md).

### Manutenções periódicas

Podem ser por **dias**, **meses** ou **horas de uso** (horímetro/km):

- por data → alerta X dias antes do vencimento;
- por horas → alerta quando faltarem X horas para o horímetro alvo.

Ao registrar uma manutenção vinculada a um plano, o sistema **avança sozinho** a
próxima data (ou o próximo horímetro) e atualiza o horímetro do ativo.

Em **Manutenções → Periódicas** e na aba do ativo elas abrem em **Quadro**:
uma coluna por situação (**Atrasadas**, **Vencendo em breve**, **Em dia** e,
quando houver, **Pausadas**), com cards de borda colorida, próxima data, prazo,
responsável e o botão **Dar baixa**. No celular as colunas ficam empilhadas,
Atrasadas primeiro; em tablet ou com o menu aberto, o quadro rola para o lado.
O alternador **Quadro/Lista** fica lembrado no aparelho.

### Assistente de IA

A tela **Assistente** (grupo Análise do menu) é um chat em que qualquer pessoa
da equipe pergunta em português sobre a empresa: "quais manutenções estão
atrasadas?", "quanto gastei por ativo este mês?", "pneus com sulco abaixo de
3 mm". A IA é do **Groq**, ligada pelo superadmin em **Integrações e backup** no
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

O console tem um **menu lateral** (no celular, a barra de baixo) com as
seções **Usuários**, **Clientes e uso**, **Assinaturas** (com um número em
amarelo quando empresa bloqueada por você mandou comprovante), **Integrações
e backup** e **Versão e atualização**. Links antigos com `?aba=` continuam abrindo a seção certa.

Em **Usuários** fica a gerência de todos, de todas as empresas:

- **Cartões no topo** que também filtram: usuários no sistema, usaram em 7
  dias, nunca entraram, sem empresa e bloqueados. O **último acesso** conta o
  uso da sessão (que se renova sozinha por 30 dias), não só o último login.
- **Lista** com busca (nome, e-mail, telefone, empresa), filtro por empresa,
  ordenação (último acesso, nome, mais novos), situação de cada um e
  **exportar CSV** (abre no Excel) da lista filtrada.
- **Novo usuário** numa empresa nova ou numa existente, com qualquer papel; no
  fim aparecem e-mail e senha para copiar ou mandar no WhatsApp.
- **Detalhe do usuário** (clique na linha): editar nome e e-mail, definir/gerar
  senha, encerrar sessões, **bloquear/desbloquear**, ver criação, último
  acesso e sessões, **empresas** (pôr em outra empresa, trocar o papel, tirar)
  e excluir.

Em **Clientes e uso**, cada empresa aparece com o **espaço que ocupa**
(fotos e anexos no disco + estimativa das linhas no banco, com barra
comparando os clientes), quantos ativos e manutenções tem (e a data da última
lançada), o **último acesso** de alguém da equipe, se o **WhatsApp está
conectado** (com o número) e a **situação da assinatura**. No topo, os
totais: clientes e pessoas, espaço usado, quanto é arquivo e quanto é banco,
e quantos estão com WhatsApp.

Em **Integrações e backup** ficam as chaves de serviços externos, guardadas no
banco (`sistema_credenciais`) e nunca devolvidas à tela (só o final aparece):
o **Groq** do assistente de IA (chave, lista de modelos e **Testar conexão**,
que também roda sozinho depois de salvar) e o backup.

#### Backup no Backblaze B2

O cartão **Backup no Backblaze B2** recebe keyID, applicationKey, bucket, pasta, de
quantos em quantos dias roda o automático (padrão 15) e como o B2 guarda
(espelho do app, o padrão, ou com histórico pelos dias de retenção); **Testar conexão** confere a
chave na API do Backblaze, e **Salvar** só grava se o teste passar. Os segredos
não voltam para a tela (só os 4 últimos caracteres). O cartão mostra se o
serviço backup está no ar, para onde ele está mandando, as pastas no bucket, o
botão **Fazer backup agora** e as últimas 10 rodadas (automáticas e manuais).

O backup automático roda **a cada 15 dias** (contados do último backup bom,
então **Fazer backup agora** adia o próximo). No modo **espelho**, o padrão, o
bucket fica igual ao app: só o dump mais novo do banco e as fotos/anexos
arquivo por arquivo; o que foi apagado no app some do B2. A senha de
criptografia não é pedida (uma já salva continua valendo).

#### Assinatura por Pix

Em **Assinaturas** fica a cobrança mensal por **Pix** (sem gateway: o
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
  empresa, o valor, até quando o acesso foi liberado e o link do console para
  marcar como falso.
  **Enviar teste** confere.
- **Cartões no topo**: comprovantes nos últimos 7 dias, recebido no mês, em
  dia, vencendo ou vencidas e bloqueadas (os três últimos filtram a lista).
- **Comprovantes recebidos**: o comprovante **já vale** quando o cliente anexa,
  sem aprovação. O vencimento anda um período do plano da empresa (pagou
  adiantado não perde dias); com dia fixo, cai sempre nesse dia; sem dia
  fixo e atrasado, conta a partir do dia do pagamento. **Ver
  comprovante** abre o PDF ou a imagem ali mesmo; **Comprovante falso** (com
  motivo, que a empresa vê) desfaz o mês e, marcado por padrão, **bloqueia a
  empresa** na hora. Bolinha azul = chegou há menos de 2 dias.
- **Esperando você** (só aparece quando tem): empresa que você bloqueou mandou
  comprovante, então ele não liberou sozinho. **Liberar** dá +1 mês e tira o
  bloqueio; **Recusar** mantém bloqueada.
- **Empresas: vencimento e acesso**: situação (em dia, vence em breve,
  vencida, bloqueada), o **plano** (mensal, trimestral, semestral ou anual: o
  Pix cobra o valor mensal × meses), o **dia do vencimento** (todo dia N; a
  data já vai para esse dia), o **próximo vencimento** editável, a opção
  **Isenta** e
  **Bloquear acesso** / **Desbloquear**, que vale na hora e por cima de
  qualquer vencimento (o motivo aparece para a empresa). Liberar um
  comprovante dela também desbloqueia.

Do lado da empresa, o menu **Assinatura** mostra a situação, o QR, o copia e
cola, o plano e o envio do comprovante (proprietário ou gestor), com o
histórico. A tela mostra os 3 passos e deixa claro que **anexar o comprovante
é obrigatório**: só o Pix, sem o comprovante, não libera. Ao anexar, as telas
voltam a abrir na hora. Uma
faixa no topo avisa quando faltam 5 dias ou menos e quando já venceu. Passou
do vencimento + tolerância, a empresa fica **bloqueada**: qualquer tela leva
para Assinatura, que continua deixando pagar e anexar. O superadmin no
"Entrar como" não é barrado. Empresas que já existiam ganharam 30 dias a
partir da instalação desta versão.

Em **Versão e atualização** fica o bloco **Versão do sistema** (a que está no
ar e a última publicada no GitHub Packages, com o botão **Atualizar**).

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
   nenhum contêiner usa. Terminou a atualização, não sobra nenhum contêiner
   parado na stack. Neste passo, volumes e outras stacks não são tocados. A
   limpeza roda de novo quando o atualizador sobe (também depois de atualizar a
   stack pelo Portainer), 1 e 5 minutos depois (o que ainda estava parando) e
   de hora em hora; fora de uma atualização, só o contêiner que quebrou na
   versão atual fica 24 h para os logs mostrarem o motivo. O console mostra a
   última limpeza e quantos parados sobraram. A lista de tarefas antigas em
   `docker service ps` continua aparecendo: é só o histórico do Swarm;
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
  (app)/            telas internas (dashboard, ativos, manutenções, calendário, estoque, relatórios,
                    assistente, assinatura, equipe, configurações)
  admin/            console do superadmin (usuários, clientes e uso, assinaturas, integrações e versão)
  api/arquivos/     envio e leitura de fotos/anexos (links assinados)
  api/exportar/     CSV do histórico de manutenções
  api/notificacoes/ rotina diária do WhatsApp (chamada pelo serviço cron)
  api/rotinas/      limpeza de arquivos órfãos
  api/saude/        checagem de saúde da stack
  auth/             login, cadastro, recuperação de senha e logout
components/         UI, modais, formulários e listas
lib/
  actions/          server actions de dados
  auth/             sessões, senhas (bcrypt), JWT, limite de tentativas
  db/               cliente do PostgREST (usuário e servidor)
  arquivos.ts       armazenamento em volume + links assinados
  pix.ts            Pix copia e cola e QR (BR Code) da assinatura
  modelos-groq.ts   modelos do assistente (padrão e desligados)
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
npm run verificar  # o mesmo do Actions: lock, tipos, unidade, build, WhatsApp, shell (~30 s; roda no git push)
npm run testar     # só os testes de unidade (testes/unidade)
npm run build      # build de produção
npm run typecheck  # checagem de tipos
cd whatsapp && npm test   # testes do serviço de WhatsApp
```
