-- ============================================================================
--  FUNDAÇÃO DO BANCO — papéis, autenticação própria e permissões padrão
--  Aplicado pelo serviço "migrador" antes de 10-schema.sql. Idempotente.
--
--  Como o acesso funciona:
--
--    navegador ─► app (Next) ─► PostgREST ─► PostgreSQL
--
--  O app valida a sessão do usuário e chama o PostgREST com um JWT curto
--  assinado com JWT_SECRET, contendo { sub: <id do usuário>, role:
--  "authenticated" }. O PostgREST troca para o papel "authenticated" e grava
--  o JWT em request.jwt.claims; auth.uid() lê dali e as policies de RLS de
--  10-schema.sql filtram cada linha pela empresa do usuário.
--
--  O PostgREST NÃO é exposto na internet: só o app e o servidor de WhatsApp
--  falam com ele, pela rede interna do Docker.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. PAPÉIS
--    anon           sem login (o PostgREST usa quando não há JWT) — não vê nada
--    authenticated  usuário logado; o RLS decide o que ele enxerga
--    service_role   servidor (rotina diária, equipe, WhatsApp) — ignora o RLS
--    authenticator  o usuário com que o PostgREST conecta; só troca de papel
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- A senha do authenticator vem do migrador (variável AUTHENTICATOR_PASSWORD).
\if :{?senha_authenticator}
  alter role authenticator with login password :'senha_authenticator';
\endif

-- Tempo máximo de uma consulta vinda da API (evita travar o banco).
alter role authenticated set statement_timeout = '30s';
alter role anon          set statement_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 2. PERMISSÕES PADRÃO
--    Toda tabela nova do schema public já nasce acessível a "authenticated"
--    (o RLS filtra as linhas) e ao "service_role". Funções NÃO: cada uma é
--    liberada explicitamente em 10-schema.sql.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- 3. AUTENTICAÇÃO PRÓPRIA (schema auth)
--    Fica fora do schema exposto pelo PostgREST: ninguém lê estas tabelas
--    pela API. O app usa as funções auth_* (20-auth.sql), liberadas só para
--    o service_role.
--
--    Os nomes de auth.users seguem o formato antigo do Supabase de propósito:
--    os triggers de 10-schema.sql (cadastro cria empresa e perfil) continuam
--    iguais, e a migração dos dados antigos é uma cópia direta.
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  encrypted_password text,                       -- bcrypt ($2a$/$2b$)
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data  jsonb not null default '{}', -- só o servidor grava (convites)
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists users_email_unico on auth.users (lower(email));

-- superadmin: administra o sistema inteiro (todas as empresas e usuários).
--             Só o migrador liga, a partir de SUPERADMIN_EMAIL (30-superadmin.sql).
-- bloqueado:  não entra e perde as sessões abertas (o superadmin decide).
alter table auth.users add column if not exists superadmin boolean not null default false;
alter table auth.users add column if not exists bloqueado  boolean not null default false;

create table if not exists auth.sessoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  criada_em  timestamptz not null default now(),
  expira_em  timestamptz not null,
  ultimo_uso timestamptz not null default now(),
  ip         text,
  agente     text
);

create index if not exists sessoes_usuario on auth.sessoes (user_id);

-- Sessão aberta pelo superadmin com "Entrar como" (72-entrar-como.sql): quem
-- abriu. Vazio = login normal da própria pessoa. Dura pouco e não se renova.
alter table auth.sessoes add column if not exists aberta_por uuid references auth.users (id) on delete cascade;

-- Links de recuperação de senha. Guardamos só o hash: quem ler o banco não
-- consegue usar um link que ainda esteja valendo.
create table if not exists auth.tokens (
  hash      text primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  tipo      text not null check (tipo in ('recuperacao')),
  expira_em timestamptz not null,
  usado_em  timestamptz,
  criado_em timestamptz not null default now()
);

-- Limite de tentativas de login (por e-mail e por IP).
create table if not exists auth.tentativas (
  id      bigserial primary key,
  chave   text not null,
  sucesso boolean not null,
  em      timestamptz not null default now()
);

create index if not exists tentativas_chave on auth.tentativas (chave, em desc);

-- Nada do schema auth é acessível pela API.
revoke all on all tables in schema auth from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. auth.uid() — quem está chamando
--    Lê o "sub" do JWT que o PostgREST grava em request.jwt.claims.
--    (request.jwt.claim.sub é aceito também, por compatibilidade.)
-- ---------------------------------------------------------------------------
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
