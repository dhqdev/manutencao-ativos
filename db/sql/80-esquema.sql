-- ============================================================================
--  VERSÃO DO ESQUEMA
--  Último arquivo do migrador. Idempotente.
--
--  Guarda a versão da imagem ops cujo SQL foi aplicado por último. Os serviços
--  que ficam no ar (backup, atualizador) comparam com a própria versão ao
--  subir e aplicam o SQL se o banco estiver atrás (garantir_esquema em
--  db/scripts/comum.sh): atualizar a stack no Portainer basta, mesmo que o
--  Swarm não rode o migrador de novo. Só o postgres mexe aqui.
-- ============================================================================

create table if not exists public.sistema_esquema (
  id          int primary key default 1 check (id = 1),
  versao      text not null,
  aplicado_em timestamptz not null default now()
);

alter table public.sistema_esquema enable row level security;
revoke all on public.sistema_esquema from public, anon, authenticated, service_role;

-- O app pede ao PostgREST para reler o esquema quando bate numa função ou
-- tabela que ele ainda não conhece (PGRST202/PGRST205): o aviso do migrador
-- se perde se o PostgREST estava reconectando, e ele seguia com o cache
-- antigo até alguém reiniciá-lo. Só o servidor chama (recarregarEsquema()
-- em lib/db/admin.ts).
create or replace function public.sistema_recarregar_esquema()
returns void
language sql
security definer
set search_path = public
as $$
  select pg_notify('pgrst', 'reload schema');
$$;

revoke execute on function public.sistema_recarregar_esquema() from public, anon, authenticated;
grant execute on function public.sistema_recarregar_esquema() to service_role;
