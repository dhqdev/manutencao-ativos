-- ============================================================================
--  INTEGRAÇÕES — credenciais de serviços externos guardadas pelo superadmin
--  Aplicado pelo migrador depois de 60-equipe.sql. Idempotente.
--
--  Chave/valor (ex.: groq_api_key, groq_modelo, b2_key_id...). O superadmin
--  cola as chaves na aba "Integrações" do console em vez de mexer na stack.
--
--  Só o service_role lê e grava (RLS ligado e nenhuma policy): o app confere
--  antes, na sessão validada no banco, se quem pediu é o superadmin, e o
--  valor nunca vai para o navegador (a tela só mostra o final da chave).
--  71-backup.sql repete a mesma definição: qualquer um dos dois que rodar
--  primeiro cria a tabela.
-- ============================================================================

create table if not exists public.sistema_credenciais (
  chave          text primary key check (chave ~ '^[a-z0-9_]+$'),
  valor          text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

alter table public.sistema_credenciais enable row level security;
revoke all on public.sistema_credenciais from public, anon, authenticated;
grant select, insert, update, delete on public.sistema_credenciais to service_role;

notify pgrst, 'reload schema';
