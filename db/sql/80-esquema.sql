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
