-- ============================================================================
--  ATUALIZAÇÃO DO SISTEMA PELO PAINEL DO SUPERADMIN
--  Aplicado pelo migrador depois de 30-superadmin.sql. Idempotente.
--
--  O botão "Atualizar" do /admin não mexe no Docker: ele só grava um pedido
--  aqui. Quem aplica é o serviço "atualizador" da stack (imagem ops, com o
--  socket do Docker), que lê o pedido, troca a tag das imagens e conta o
--  andamento de volta nesta mesma tabela. Assim o app — que fica exposto na
--  internet — nunca tem acesso ao Docker.
--
--  Só o service_role lê e grava (RLS ligado e nenhuma policy): o app confere
--  antes, na sessão validada no banco, se quem pediu é o superadmin.
-- ============================================================================

-- 1. Pedidos de atualização ----------------------------------------------------
create table if not exists public.sistema_atualizacoes (
  id           bigint generated always as identity primary key,
  -- Só tags de release (vAAAA.MM.DD-N): o atualizador monta o nome da imagem
  -- com isto, então nada fora do padrão pode entrar.
  versao       text not null check (versao ~ '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$'),
  versao_antes text,
  estado       text not null default 'pendente'
               check (estado in ('pendente', 'executando', 'concluida', 'erro')),
  mensagem     text,
  pedido_por   uuid references auth.users (id) on delete set null,
  criado_em    timestamptz not null default now(),
  iniciado_em  timestamptz,
  concluido_em timestamptz
);

-- Uma atualização por vez: dois cliques (ou duas abas) não disparam duas.
create unique index if not exists sistema_atualizacoes_uma_ativa
  on public.sistema_atualizacoes ((true))
  where estado in ('pendente', 'executando');

alter table public.sistema_atualizacoes enable row level security;
revoke all on public.sistema_atualizacoes from anon, authenticated;
grant select, insert, update on public.sistema_atualizacoes to service_role;

-- 2. Sinal de vida do atualizador ------------------------------------------------
-- O atualizador grava aqui a cada poucos segundos. Sem sinal recente o painel
-- avisa que o serviço não está na stack (e explica como colocar).
create table if not exists public.sistema_atualizador (
  id       int primary key default 1 check (id = 1),
  visto_em timestamptz not null default now(),
  stack    text,   -- nome da stack no Swarm
  imagem   text,   -- base das imagens, ex.: ghcr.io/dhqdev/manutencao-ativos
  versao   text    -- tag em execução (pode ser "latest")
);

-- Resultado da última limpeza de contêineres parados (limpar_sobras do
-- atualizador), para o console mostrar se a faxina está funcionando.
alter table public.sistema_atualizador
  add column if not exists limpeza_em  timestamptz,
  add column if not exists limpeza_msg text,
  add column if not exists parados     int;

alter table public.sistema_atualizador enable row level security;
revoke all on public.sistema_atualizador from anon, authenticated;
grant select, insert, update on public.sistema_atualizador to service_role;

notify pgrst, 'reload schema';
