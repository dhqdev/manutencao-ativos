-- ============================================================================
--  BACKUP PELO CONSOLE DO SUPERADMIN
--  Aplicado pelo migrador depois de 70-integracoes.sql. Idempotente.
--
--  As credenciais do Backblaze B2 são digitadas no console (aba Integrações) e
--  ficam em sistema_credenciais (chaves b2_*). O serviço "backup" da stack lê
--  essas chaves a cada rodada, então trocar a chave no console vale já no
--  próximo backup, sem mexer na stack. As variáveis B2_* da stack continuam
--  valendo como reserva quando o console estiver vazio.
--
--  O app nunca roda o backup: o botão "Fazer backup agora" só grava um pedido
--  em sistema_backups e o serviço backup, que olha a tabela a cada poucos
--  segundos, executa e conta o resultado de volta na mesma linha.
--
--  Só o service_role lê e grava (RLS ligado e nenhuma policy). O serviço
--  backup entra como postgres (dono das tabelas).
-- ============================================================================

-- 1. Credenciais das integrações (mesma definição de 70-integracoes.sql) --------
-- Repetida aqui para este arquivo não depender da ordem em que as duas
-- mudanças chegaram: "if not exists" deixa só a primeira valer.
create table if not exists public.sistema_credenciais (
  chave         text primary key check (chave ~ '^[a-z0-9_]+$'),
  valor         text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

alter table public.sistema_credenciais enable row level security;
revoke all on public.sistema_credenciais from public, anon, authenticated;
grant select, insert, update, delete on public.sistema_credenciais to service_role;

-- 2. Rodadas de backup -----------------------------------------------------------
create table if not exists public.sistema_backups (
  id            bigint generated always as identity primary key,
  origem        text not null default 'manual' check (origem in ('agendado', 'manual')),
  estado        text not null default 'pendente'
                check (estado in ('pendente', 'executando', 'ok', 'erro')),
  -- Resultado do envio para o Backblaze: só o banco local conta para "ok",
  -- então o B2 tem campo próprio (um backup local bom com B2 falhando ainda
  -- precisa aparecer em vermelho no console).
  b2            text check (b2 in ('ok', 'falhou', 'desligado')),
  arquivo       text,     -- nome do dump do banco
  bytes_banco   bigint,
  bytes_arquivos bigint,
  mensagem      text,
  pedido_por    uuid references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now(),
  iniciado_em   timestamptz,
  concluido_em  timestamptz
);

create index if not exists sistema_backups_criado_em on public.sistema_backups (criado_em desc);

-- Um backup por vez: dois cliques (ou duas abas) não disparam dois.
create unique index if not exists sistema_backups_um_ativo
  on public.sistema_backups ((true))
  where estado in ('pendente', 'executando');

alter table public.sistema_backups enable row level security;
revoke all on public.sistema_backups from public, anon, authenticated;
grant select, insert, update on public.sistema_backups to service_role;

-- 3. Sinal de vida do serviço backup -----------------------------------------------
-- Gravado a cada poucos segundos, com o que só o serviço sabe (hora marcada,
-- retenção local, de onde veio a credencial do B2). Sem sinal recente o
-- console avisa que o serviço não está rodando.
create table if not exists public.sistema_backup_servico (
  id        int primary key default 1 check (id = 1),
  visto_em  timestamptz not null default now(),
  hora      int,      -- roda todo dia às <hora>h30 (fuso da stack)
  dias      int,      -- dias mantidos no volume do servidor
  b2_origem text check (b2_origem in ('console', 'variaveis', 'desligado')),
  b2_destino text     -- bucket/pasta em uso
);

alter table public.sistema_backup_servico enable row level security;
revoke all on public.sistema_backup_servico from public, anon, authenticated;
grant select, insert, update on public.sistema_backup_servico to service_role;

-- Histórico enxuto: as rodadas com mais de 180 dias não ajudam ninguém.
delete from public.sistema_backups where criado_em < now() - interval '180 days';

notify pgrst, 'reload schema';
